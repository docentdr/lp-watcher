# LP Watcher - Simplified

A simplified tool to monitor your Uniswap V4 LP position and calculate how to reinvest accrued fees.

## Features

1. **Position Status** - Print current position balances (tokens) and accrued fees
2. **Fee Recycling Calculator** - Shows exactly how much of each token (ETH/USDC) you should swap to maintain your current position ratio when re-adding liquidity

## Setup

1. Copy `.env.example` to `.env` and fill in your values:

```
RPC_URL=<your-rpc-url>
POSITION_TOKEN_ID=<your-position-token-id>
POSM_ADDRESS=<posm-contract-address>
STATE_VIEW_ADDRESS=<state-view-contract-address>
```

2. Install dependencies:
```bash
npm install
```

## Usage

Run the simplified version:
```bash
node simple.js
```

### Output Example

```
[2026-01-08T12:34:56.789Z] LP POSITION STATUS
─────────────────────────────────────────
Position: 0.5234 ETH + 1500.00 USDC
Accrued Fees: 0.0145 ETH + 25.50 USDC

Position Value: $2,300.45
Fees Value: $51.25
ETH Price: $1,600.00
─────────────────────────────────────────

REINVESTING ACCRUED FEES
─────────────────────────────────────────
Total Fees: $51.25
Current: 0.0145 ETH + 25.50 USDC
Target: 0.0160 ETH + 15.65 USDC

Swap $9.85 USDC for 0.0015 ETH

Swap to execute:
  Sell: $9.85 USDC
  Buy: 0.0015 ETH
─────────────────────────────────────────
```

## How it Works

### Position Status
Shows your current position breakdown:
- How much of each token you have in the position
- How much fees you've accrued in each token
- Total USD value of position and fees
- Current ETH price (USDC per ETH)

### Fee Recycling Plan
When reinvesting accrued fees, you want to maintain the same ratio as your current position:

1. **Calculate current ratio** - How much of your position is in each token (by USD value)
2. **Apply that ratio to fees** - If position is 30% ETH and 70% USDC, your fees should be split 30/70
3. **Calculate the swap needed** - Show exactly how much to swap to achieve this split

**Example:**
- Your position: 10 ETH + 20,000 USDC (35% ETH, 65% USDC in USD terms)
- Your fees: 0.5 ETH + 500 USDC (75% ETH, 25% USDC)
- To match position ratio, you should have: ~0.175 ETH + 0.825 ETH worth of USDC
- Solution: Swap ~0.325 ETH for USDC

Once you execute the swap and have the right ratio of tokens, add them back to the pool!

## Files

- `simple.js` - Main simplified entry point (recommended to use this)
- `src/watcher.js` - Original (more complex) watcher logic
- `src/uniswap/snapshot.js` - Fetches position data from chain
- `src/utils/` - Formatting and math utilities
