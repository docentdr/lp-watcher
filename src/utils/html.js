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
export function generateHTML(snapshot, history = []) {
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
            <h2>Worth Over Time</h2>
            <span class="hint">History from position-history.csv</span>
          </div>
          <div class="chart-wrap">
            <canvas id="worthChart" height="200"></canvas>
            <div id="chart-empty" style="display: none;">No history yet</div>
            <script type="application/json" id="history-data">${JSON.stringify(chartData)}</script>
          </div>
        </div>

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
