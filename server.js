import "dotenv/config";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import cron from "node-cron";
import { generateHTML } from "./src/utils/html.js";
import { fetchWalletBalances } from "./src/utils/balances.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3169;
const CSV_PATH = path.join(__dirname, "data", "position-history.csv");
const DATA_DIR = path.join(__dirname, "data");
const VALIDATOR_INDICES = (process.env.VALIDATOR_INDICES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((n) => Number(n))
  .filter((n) => Number.isFinite(n));
const VALIDATOR_CACHE_TTL_MS = 120_000; // cache validator responses for 2 minutes to avoid rate limits

function parseMonitoredAddresses(raw) {
  if (!raw) {
    throw new Error("Missing env MONITORED_ADDRESSES (comma-separated list of Label:address)");
  }

  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, idx) => {
      if (entry.includes(":")) {
        const [label, ...rest] = entry.split(":");
        const addr = rest.join(":").trim();
        return {
          label: label.trim() || `Wallet ${idx + 1}`,
          address: addr,
        };
      }

      return {
        label: `Wallet ${idx + 1}`,
        address: entry,
      };
    })
    .filter((item) => item.address);
}

const MONITORED_ADDRESSES = parseMonitoredAddresses(process.env.MONITORED_ADDRESSES);

let validatorCache = {
  expiresAt: 0,
  data: { entries: [], message: null },
};

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
 * Read full CSV history
 */
async function getHistory() {
  try {
    const content = await fs.readFile(CSV_PATH, "utf8");
    const lines = content.trim().split("\n");

    if (lines.length < 2) {
      return [];
    }

    const headers = lines[0].split(",");

    return lines.slice(1).map((line) => {
      const values = line.split(",");
      const row = {};
      headers.forEach((header, i) => {
        row[header] = values[i];
      });
      return row;
    });
  } catch (err) {
    console.error("Error reading CSV history:", err);
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchValidatorStatuses() {
  const apiKey = process.env.BEACONCHAIN_API_KEY;

  if (!apiKey) {
    return { entries: [], message: "Add BEACONCHAIN_API_KEY to .env to enable validator data." };
  }

  if (!VALIDATOR_INDICES.length) {
    return { entries: [], message: "Add VALIDATOR_INDICES to .env (comma-separated indices)." };
  }

  const now = Date.now();
  if (validatorCache.expiresAt > now) {
    return validatorCache.data;
  }

  const entries = [];

  for (const index of VALIDATOR_INDICES) {
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`https://beaconcha.in/api/v1/validator/${index}`, {
          headers: {
            accept: "application/json",
            apikey: apiKey,
          },
        });

        if (!res.ok) {
          const errText = res.status === 429 ? "Rate limited (429)" : `HTTP ${res.status}`;
          throw new Error(errText);
        }

        const json = await res.json();
        const v = json?.data ?? {};
        const balanceGwei = Number(v.balance);

        entries.push({
          index,
          status: v.status ?? "unknown",
          balanceEth: Number.isFinite(balanceGwei) ? balanceGwei / 1e9 : null,
        });

        // success; small pause before next validator
        await sleep(300);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const backoff = 400 * (attempt + 1);
        await sleep(backoff);
      }
    }

    if (lastError) {
      console.error(`Error fetching validator ${index}:`, lastError.message);

      // Fallback to cached entry if available
      const cachedEntry = validatorCache.data.entries.find((e) => e.index === index);
      if (cachedEntry && !cachedEntry.error) {
        entries.push({ ...cachedEntry, stale: true });
      } else {
        entries.push({ index, error: lastError.message });
      }
    }
  }

  const data = { entries, message: null };
  validatorCache = { data, expiresAt: Date.now() + VALIDATOR_CACHE_TTL_MS };
  return data;
}



/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    // Take snapshot (will replace today's entry if it exists)
    await takeSnapshot();
    
    const snapshot = await getLatestSnapshot();
    const history = await getHistory();
    const validators = await fetchValidatorStatuses();
    const wallets = await fetchWalletBalances(MONITORED_ADDRESSES);
    const html = generateHTML(snapshot, history, validators, wallets);
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
