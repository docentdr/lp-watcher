import { fmt } from './format.js';

/**
 * Calculate swap needed based on CSV snapshot data
 * Simplified version that works with the CSV fields
 */
function calculateSwapFromCSV(snapshot) {
  const ethPrice = parseFloat(snapshot.eth_price);
  const posEth = parseFloat(snapshot.pos_eth);
  const posUsdc = parseFloat(snapshot.pos_usdc);
  const feeEth = parseFloat(snapshot.fee_eth);
  const feeUsdc = parseFloat(snapshot.fee_usdc);
  
  const GAS_SAFETY_BUFFER_ETH = 0.01;
  
  // Current position ratio (in USD terms)
  const posUsdEth = posEth * ethPrice;
  const posUsdUsdc = posUsdc;
  const totalPosUsd = posUsdEth + posUsdUsdc;
  const targetRatio = totalPosUsd > 0 ? posUsdEth / totalPosUsd : 0.5;
  
  // Fees available (in USD terms, with gas buffer)
  let feesUsdEth = feeEth > GAS_SAFETY_BUFFER_ETH 
    ? (feeEth - GAS_SAFETY_BUFFER_ETH) * ethPrice 
    : 0;
  let feesUsdUsdc = feeUsdc;
  
  const totalFeesUsd = feesUsdEth + feesUsdUsdc;
  
  // Target split to match position ratio
  const targetUsdEth = totalFeesUsd * targetRatio;
  const targetUsdUsdc = totalFeesUsd * (1 - targetRatio);
  
  const needUsdEth = targetUsdEth - feesUsdEth;
  const needUsdUsdc = targetUsdUsdc - feesUsdUsdc;
  
  // Determine swap needed
  if (Math.abs(needUsdEth) < 1 && Math.abs(needUsdUsdc) < 1) {
    return null; // Already balanced
  } else if (needUsdEth > 1) {
    // Need more ETH - sell USDC for ETH
    const sellUsdcAmount = needUsdEth;
    const buyEthAmount = sellUsdcAmount / ethPrice;
    return {
      direction: 'USDC→ETH',
      sellAmount: sellUsdcAmount,
      buyAmount: buyEthAmount,
      text: `Convert $${fmt(sellUsdcAmount)} USDC to ${buyEthAmount.toFixed(4)} ETH`
    };
  } else if (needUsdUsdc > 1) {
    // Need more USDC - sell ETH for USDC
    const sellEthAmount = needUsdUsdc / ethPrice;
    const buyUsdcAmount = needUsdUsdc;
    return {
      direction: 'ETH→USDC',
      sellAmount: sellEthAmount,
      buyAmount: buyUsdcAmount,
      text: `Convert ${sellEthAmount.toFixed(4)} ETH to USDC (est. $${fmt(buyUsdcAmount)})`
    };
  }
  
  return null;
}

/**
 * Generate HTML response for the LP Watcher dashboard
 */
export function generateHTML(
  snapshot,
  history = [],
  validators = { entries: [], message: null },
  wallets = { wallets: [] }
) {
  const validatorEntries = validators?.entries ?? [];
  const validatorMessage = validators?.message ?? null;

  const validatorCards = validatorEntries.length
    ? validatorEntries
        .map((entry) => {
          const statusText = entry.error ? 'error' : entry.status ?? 'unknown';
          const statusClass = entry.error ? 'error' : statusText.toLowerCase();
          const balanceText = entry.balanceEth != null ? `${entry.balanceEth.toFixed(4)} ETH` : '—';

          return `
            <div class="validator-card">
              <div class="validator-id">Validator #${entry.index}</div>
              <div class="validator-meta">
                <span class="validator-status ${statusClass}">${statusText}</span>
                <span class="validator-balance">${balanceText}</span>
              </div>
              ${entry.error ? `<div class="validator-error">${entry.error}</div>` : ''}
            </div>
          `;
        })
        .join('')
    : `<div class="empty">${validatorMessage || 'Validator data unavailable.'}</div>`;

  const validatorPanel = `
    <div class="panel">
      <div class="panel-head">
        <h2>Validators</h2>
        <span class="hint">Live from beaconcha.in</span>
      </div>
      <div class="validator-grid">
        ${validatorCards}
      </div>
    </div>
  `;

  const walletCards = (wallets?.wallets || [])
    .map((w) => {
      const ethLine = w.eth?.error ? `ETH: error` : `ETH: ${fmt(w.eth?.amount ?? 0, 4)}`;
      const uEthLine = w.uEth?.error ? `uETH: error` : `uETH: ${fmt(w.uEth?.amount ?? 0, 4)}`;
      const uUsdcLine = w.uUsdc?.error ? `uUSDC: error` : `uUSDC: ${fmt(w.uUsdc?.amount ?? 0, 2)}`;

      return `
        <div class="wallet-card">
          <div class="wallet-head">
            <span class="wallet-network">${w.label}</span>
            <span class="hint">${w.address}</span>
          </div>
          <div class="wallet-balances column">
            <span class="pill">${ethLine}</span>
            <span class="pill">${uEthLine}</span>
            <span class="pill">${uUsdcLine}</span>
          </div>
        </div>
      `;
    })
    .join("");

  const walletPanel = `
    <div class="panel">
      <div class="panel-head">
        <h2>Wallets</h2>
        <span class="hint">Ethereum & Unichain</span>
      </div>
      <div class="wallet-grid">
        ${walletCards || '<div class="empty">Wallet data unavailable.</div>'}
      </div>
    </div>
  `;

  if (!snapshot) {
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
          .info { color: #d4d4d4; font-size: 14px; }
          .panel { background: #252526; border: 1px solid #3e3e42; border-radius: 4px; padding: 16px; margin: 24px 0; }
          .panel-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
          .hint { color: #858585; font-size: 11px; }
          .validator-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
          .validator-card { background: #1f1f23; border: 1px solid #3e3e42; border-radius: 6px; padding: 12px; }
          .validator-id { color: #dcdcaa; font-weight: bold; margin-bottom: 6px; }
          .validator-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
          .validator-status { text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; color: #d4d4d4; }
          .validator-status.active { color: #4ec9b0; }
          .validator-status.pending { color: #dcdcaa; }
          .validator-status.exited, .validator-status.slash, .validator-status.error { color: #f14c4c; }
          .validator-status.unknown { color: #858585; }
          .validator-balance { color: #ce9178; font-weight: bold; }
          .validator-error { color: #f14c4c; font-size: 12px; margin-top: 6px; }
          .empty { color: #858585; text-align: center; padding: 8px 0; }
          .wallet-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; }
          .wallet-card { background: #1f1f23; border: 1px solid #3e3e42; border-radius: 6px; padding: 12px; }
          .wallet-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
          .wallet-network { color: #dcdcaa; font-weight: bold; font-size: 14px; }
          .wallet-error { color: #f14c4c; font-size: 12px; }
          .wallet-balances { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
          .pill { background: #2d2d30; border: 1px solid #3e3e42; border-radius: 999px; padding: 4px 10px; font-size: 12px; color: #ce9178; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📊 LP Watcher</h1>
          <p class="info">Waiting for first snapshot...</p>
          <p class="info">Page auto-refreshes every 30 seconds</p>
          ${validatorPanel}
          ${walletPanel}
        </div>
      </body>
      </html>
    `;
  }

  const lastUpdate = new Date().toISOString();
  const chartData = history
    .map((row) => ({
      date: row.date,
      worth_eth: Number.parseFloat(row.worth_eth),
      worth_usdc: Number.parseFloat(row.worth_usdc),
    }))
    .filter((row) => row.date && !Number.isNaN(row.worth_eth) && !Number.isNaN(row.worth_usdc));

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
        h2 { color: #dcdcaa; margin: 0; font-size: 16px; }
        .panel { 
          background: #252526; 
          border: 1px solid #3e3e42; 
          border-radius: 4px; 
          padding: 16px; 
          margin: 24px 0;
        }
        .panel-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
        .hint { color: #858585; font-size: 11px; }
        .validator-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
        .validator-card { background: #1f1f23; border: 1px solid #3e3e42; border-radius: 6px; padding: 12px; }
        .validator-id { color: #dcdcaa; font-weight: bold; margin-bottom: 6px; }
        .validator-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
        .validator-status { text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; color: #d4d4d4; }
        .validator-status.active { color: #4ec9b0; }
        .validator-status.pending { color: #dcdcaa; }
        .validator-status.exited, .validator-status.slash, .validator-status.error { color: #f14c4c; }
        .validator-status.unknown { color: #858585; }
        .validator-balance { color: #ce9178; font-weight: bold; }
        .validator-error { color: #f14c4c; font-size: 12px; margin-top: 6px; }
        .empty { color: #858585; text-align: center; padding: 8px 0; }
        .wallet-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; }
        .wallet-card { background: #1f1f23; border: 1px solid #3e3e42; border-radius: 6px; padding: 12px; }
        .wallet-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .wallet-network { color: #dcdcaa; font-weight: bold; font-size: 14px; }
        .wallet-error { color: #f14c4c; font-size: 12px; }
        .wallet-balances { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
        .pill { background: #2d2d30; border: 1px solid #3e3e42; border-radius: 999px; padding: 4px 10px; font-size: 12px; color: #ce9178; }
        .chart-wrap { position: relative; min-height: 180px; }
        #chart-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #858585; font-size: 13px; }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <div class="container">
        ${snapshot.recycle_suggested === 'TRUE' 
          ? `<div class="status ready">TIME TO RECYCLE</div>
             ${(() => {
               const swap = calculateSwapFromCSV(snapshot);
               return swap ? `<div style="text-align: center; color: #4ec9b0; margin: -10px 0 15px 0; font-size: 14px;">${swap.text}</div>` : '';
             })()}`
          : ''
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
            <td>Total Worth (ETH)</td>
            <td>${parseFloat(snapshot.worth_eth).toFixed(1)}</td>
          </tr>
          <tr>
            <td>Total Worth (USDC)</td>
            <td>$${parseFloat(snapshot.worth_usdc).toLocaleString('en-US', {maximumFractionDigits: 2})}</td>
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
            <td>Recycle Ready</td>
            <td>${snapshot.recycle_suggested}</td>
          </tr>
          <tr>
            <td>ETH Price</td>
            <td>$${parseFloat(snapshot.eth_price).toLocaleString('en-US', {maximumFractionDigits: 2})}</td>
          </tr>
        </table>

        <div class="panel">
          <div class="panel-head">
            <h2>LP Worth Over Time</h2>
            <span class="hint">History from position-history.csv</span>
          </div>
          <div class="chart-wrap">
            <canvas id="worthChart" height="200"></canvas>
            <div id="chart-empty" style="display: none;">No history yet</div>
            <script type="application/json" id="history-data">${JSON.stringify(chartData)}</script>
          </div>
        </div>

        ${validatorPanel}
        ${walletPanel}

        <div class="footer">
          Last updated: ${lastUpdate}<br>
          Updates: on page visit or daily at midnight
        </div>
      </div>

      <script>
        (function initChart() {
          const dataEl = document.getElementById('history-data');
          const emptyEl = document.getElementById('chart-empty');
          const ctx = document.getElementById('worthChart');

          if (!dataEl || !ctx || !window.Chart) {
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
          }

          const parsed = JSON.parse(dataEl.textContent || '[]');
          if (!parsed.length) {
            emptyEl.style.display = 'flex';
            return;
          }

          const labels = parsed.map((row) => row.date);
          const ethSeries = parsed.map((row) => row.worth_eth);
          const usdcSeries = parsed.map((row) => row.worth_usdc);

          new Chart(ctx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: 'Worth (ETH)',
                  data: ethSeries,
                  borderColor: '#4ec9b0',
                  backgroundColor: 'rgba(78, 201, 176, 0.15)',
                  tension: 0.25,
                  borderWidth: 2,
                },
                {
                  label: 'Worth (USDC)',
                  data: usdcSeries,
                  borderColor: '#dcdcaa',
                  backgroundColor: 'rgba(220, 220, 170, 0.1)',
                  tension: 0.25,
                  borderWidth: 2,
                  yAxisID: 'y1',
                },
              ],
            },
            options: {
              plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                tooltip: {
                  mode: 'index',
                  intersect: false,
                },
              },
              scales: {
                x: { ticks: { color: '#d4d4d4' }, grid: { color: '#2f2f33' } },
                y: { ticks: { color: '#d4d4d4' }, grid: { color: '#2f2f33' } },
                y1: {
                  position: 'right',
                  ticks: { color: '#dcdcaa' },
                  grid: { drawOnChartArea: false },
                },
              },
              interaction: { mode: 'index', intersect: false },
              animation: false,
            },
          });
        })();
      </script>
    </body>
    </html>
  `;
}
