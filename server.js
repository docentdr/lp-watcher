import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import cron from "node-cron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3169;
const CSV_PATH = path.join(__dirname, "data", "position-history.csv");
const DATA_DIR = path.join(__dirname, "data");

// Ensure data directory exists
await fs.mkdir(DATA_DIR, { recursive: true });

/**
 * Run simple.js to take a snapshot
 */
function takeSnapshot() {
  console.log(`[${new Date().toISOString()}] Taking snapshot...`);
  return new Promise((resolve) => {
    const child = spawn("node", ["simple.js"], { cwd: __dirname });
    
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[${new Date().toISOString()}] Snapshot completed successfully`);
      } else {
        console.error(`[${new Date().toISOString()}] Snapshot failed with code ${code}`);
      }
      resolve();
    });

    child.on("error", (err) => {
      console.error(`[${new Date().toISOString()}] Error running snapshot:`, err);
      resolve();
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill();
      console.warn(`[${new Date().toISOString()}] Snapshot timeout`);
      resolve();
    }, 30000);
  });
}

/**
 * Read the latest row from CSV
 */
async function getLatestSnapshot() {
  try {
    const content = await fs.readFile(CSV_PATH, "utf8");
    const lines = content.trim().split("\n");
    
    if (lines.length < 2) {
      return null; // No data yet
    }

    const headers = lines[0].split(",");
    const latestRow = lines[lines.length - 1].split(",");

    const data = {};
    headers.forEach((header, i) => {
      data[header] = latestRow[i];
    });

    return data;
  } catch (err) {
    console.error("Error reading CSV:", err);
    return null;
  }
}

/**
 * Generate HTML response
 */
async function generateHTML() {
  const snapshot = await getLatestSnapshot();

  if (!snapshot) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>LP Watcher</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: monospace; background: #1e1e1e; color: #e0e0e0; padding: 20px; }
          .container { max-width: 800px; margin: 0 auto; }
          h1 { color: #4ec9b0; }
          .info { color: #d4d4d4; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📊 LP Watcher</h1>
          <p class="info">Waiting for first snapshot...</p>
          <p class="info">Page auto-refreshes every 30 seconds</p>
        </div>
        <script>
          setTimeout(() => location.reload(), 30000);
        </script>
      </body>
      </html>
    `;
  }

  const lastUpdate = new Date().toISOString();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>LP Watcher</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: 'Monaco', 'Courier New', monospace; 
          background: #1e1e1e; 
          color: #e0e0e0; 
          padding: 20px; 
          margin: 0;
        }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { color: #4ec9b0; margin-top: 0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .card { 
          background: #252526; 
          border: 1px solid #3e3e42; 
          border-radius: 4px; 
          padding: 15px; 
        }
        .card-title { 
          color: #4ec9b0; 
          font-size: 12px; 
          text-transform: uppercase; 
          margin: 0 0 10px 0;
          font-weight: bold;
        }
        .card-value { 
          font-size: 24px; 
          font-weight: bold; 
          color: #ce9178;
          margin: 5px 0;
        }
        .card-subtitle { 
          color: #858585; 
          font-size: 12px; 
          margin: 5px 0;
        }
        .status { 
          padding: 10px; 
          border-radius: 4px; 
          margin: 15px 0;
          text-align: center;
          font-weight: bold;
        }
        .status.ready { background: #1f4620; color: #4ec9b0; }
        .status.waiting { background: #3d3d1f; color: #d4d4d4; }
        .footer { 
          color: #858585; 
          font-size: 11px; 
          margin-top: 30px; 
          text-align: center;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          background: #252526;
          border: 1px solid #3e3e42;
          border-radius: 4px;
          overflow: hidden;
          margin: 20px 0;
        }
        th, td { 
          padding: 12px; 
          text-align: left; 
          border-bottom: 1px solid #3e3e42;
        }
        th { 
          background: #2d2d30; 
          color: #4ec9b0;
          font-weight: bold;
          font-size: 12px;
          text-transform: uppercase;
        }
        td { color: #ce9178; }
        tr:hover { background: #2d2d30; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📊 LP Watcher Dashboard</h1>
        
        <div class="grid">
          <div class="card">
            <div class="card-title">Position (ETH)</div>
            <div class="card-value">${parseFloat(snapshot.pos_eth).toFixed(4)}</div>
            <div class="card-subtitle">+ ${parseFloat(snapshot.pos_usdc).toLocaleString()} USDC</div>
          </div>

          <div class="card">
            <div class="card-title">Accrued Fees (ETH)</div>
            <div class="card-value">${parseFloat(snapshot.fee_eth).toFixed(4)}</div>
            <div class="card-subtitle">+ ${parseFloat(snapshot.fee_usdc).toLocaleString()} USDC</div>
          </div>

          <div class="card">
            <div class="card-title">Total Worth</div>
            <div class="card-value">$${parseFloat(snapshot.worth_usdc).toLocaleString('en-US', {maximumFractionDigits: 2})}</div>
            <div class="card-subtitle">${parseFloat(snapshot.worth_eth).toFixed(1)} ETH</div>
          </div>

          <div class="card">
            <div class="card-title">ETH Price</div>
            <div class="card-value">$${parseFloat(snapshot.eth_price).toLocaleString('en-US', {maximumFractionDigits: 2})}</div>
            <div class="card-subtitle">as of ${snapshot.date}</div>
          </div>
        </div>

        ${snapshot.recycle_suggested === 'TRUE' 
          ? '<div class="status ready">✅ TIME TO RECYCLE FEES! Fees > $250</div>' 
          : '<div class="status waiting">⏳ Keep accumulating... (< $250)</div>'
        }

        <table>
          <tr>
            <th>Field</th>
            <th>Value</th>
          </tr>
          <tr>
            <td>Date</td>
            <td>${snapshot.date}</td>
          </tr>
          <tr>
            <td>Position ETH</td>
            <td>${parseFloat(snapshot.pos_eth).toFixed(4)}</td>
          </tr>
          <tr>
            <td>Position USDC</td>
            <td>${parseFloat(snapshot.pos_usdc).toLocaleString('en-US', {maximumFractionDigits: 2})}</td>
          </tr>
          <tr>
            <td>Fee ETH</td>
            <td>${parseFloat(snapshot.fee_eth).toFixed(4)}</td>
          </tr>
          <tr>
            <td>Fee USDC</td>
            <td>${parseFloat(snapshot.fee_usdc).toLocaleString('en-US', {maximumFractionDigits: 2})}</td>
          </tr>
          <tr>
            <td>Total Worth (ETH)</td>
            <td>${parseFloat(snapshot.worth_eth).toFixed(1)}</td>
          </tr>
          <tr>
            <td>Total Worth (USDC)</td>
            <td>$${parseFloat(snapshot.worth_usdc).toLocaleString('en-US', {maximumFractionDigits: 2})}</td>
          </tr>
          <tr>
            <td>Recycle Ready</td>
            <td>${snapshot.recycle_suggested}</td>
          </tr>
          <tr>
            <td>ETH Price</td>
            <td>$${parseFloat(snapshot.eth_price).toLocaleString('en-US', {maximumFractionDigits: 2})}</td>
          </tr>
        </table>

        <div class="footer">
          Last updated: ${lastUpdate}<br>
          Page auto-refreshes every 30 seconds<br>
          Next snapshot: every hour
        </div>
      </div>

      <script>
        // Auto refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
      </script>
    </body>
    </html>
  `;
}

/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const html = await generateHTML();
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// Schedule snapshot every hour
cron.schedule("0 * * * *", async () => {
  await takeSnapshot();
});

// Also take a snapshot on startup
console.log(`[${new Date().toISOString()}] Starting LP Watcher Server`);
console.log(`[${new Date().toISOString()}] Port: ${PORT}`);
console.log(`[${new Date().toISOString()}] CSV Path: ${CSV_PATH}`);
await takeSnapshot();

// Start server
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server listening on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] Open http://localhost:${PORT}`);
});
