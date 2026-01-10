/**
 * Generate HTML response for the LP Watcher dashboard
 */
export function generateHTML(snapshot) {
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
      </style>
    </head>
    <body>
      <div class="container">
        ${snapshot.recycle_suggested === 'TRUE' 
          ? '<div class="status ready">TIME TO RECYCLE</div>'
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

        <div class="footer">
          Last updated: ${lastUpdate}<br>
          Updates: on page visit or daily at midnight
        </div>
      </div>
    </body>
    </html>
  `;
}
