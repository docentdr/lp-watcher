import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import cron from "node-cron";
import { generateHTML } from "./src/utils/html.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3169;
const CSV_PATH = path.join(__dirname, "data", "position-history.csv");
const DATA_DIR = path.join(__dirname, "data");

// Ensure data directory exists
await fs.mkdir(DATA_DIR, { recursive: true });

/**
 * Run index.js to take a snapshot
 */
function takeSnapshot() {
  console.log(`[${new Date().toISOString()}] Taking snapshot...`);
  return new Promise((resolve) => {
    const child = spawn("node", ["index.js"], { cwd: __dirname });
    
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
 * Check if today already has an entry in the CSV
 */
async function hasTodayEntry() {
  try {
    const content = await fs.readFile(CSV_PATH, "utf8");
    const lines = content.trim().split("\n");
    
    if (lines.length < 2) {
      return false;
    }

    const today = new Date().toISOString().split("T")[0];
    const lastLine = lines[lines.length - 1];
    const lastDate = lastLine.split(",")[0];

    return lastDate === today;
  } catch (err) {
    return false;
  }
}

/**
 * Update today's entry in CSV (replace the last line if it's for today)
 */
async function removeTodaysEntry() {
  try {
    const content = await fs.readFile(CSV_PATH, "utf8");
    const lines = content.trim().split("\n");
    
    if (lines.length < 2) {
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const lastLine = lines[lines.length - 1];
    const lastDate = lastLine.split(",")[0];

    if (lastDate === today) {
      lines.pop();
      await fs.writeFile(CSV_PATH, lines.join("\n") + "\n", "utf8");
    }
  } catch (err) {
    console.error("Error updating today's entry:", err);
  }
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
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const hasEntry = await hasTodayEntry();
    
    if (hasEntry) {
      await removeTodaysEntry();
      await takeSnapshot();
    } else {

      await takeSnapshot();
    }
    
    const snapshot = await getLatestSnapshot();
    const html = generateHTML(snapshot);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// Schedule snapshot once a day at midnight
cron.schedule("0 0 * * *", async () => {
  const hasEntry = await hasTodayEntry();
  
  if (!hasEntry) {
    await takeSnapshot();
  }
});

console.log(`[${new Date().toISOString()}] Starting LP Watcher Server`);
console.log(`[${new Date().toISOString()}] Port: ${PORT}`);
console.log(`[${new Date().toISOString()}] CSV Path: ${CSV_PATH}`);
console.log(`[${new Date().toISOString()}] Snapshot will be taken on first page visit or at midnight`);

// Start server
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server listening on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] Open http://localhost:${PORT}`);
});
