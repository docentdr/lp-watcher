import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fmt } from "./src/utils/format.js";
import { fetchPositionSnapshot } from "./src/uniswap/snapshot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Save snapshot to CSV file for historical tracking
 */
async function saveToCSV(snapshot) {
  const csvPath = path.join(__dirname, "data", "position-history.csv");
  const dir = path.dirname(csvPath);
  
  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true });
  
  // Extract data
  const date = snapshot.provider ? new Date().toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
  const posEth = snapshot.currency0IsNative ? snapshot.amount0 : snapshot.amount1;
  const posUsdc = snapshot.currency0IsNative ? snapshot.amount1 : snapshot.amount0;
  const feeEth = snapshot.currency0IsNative ? snapshot.unclaimed0 : snapshot.unclaimed1;
  const feeUsdc = snapshot.currency0IsNative ? snapshot.unclaimed1 : snapshot.unclaimed0;
  
  const totalWorthUsd = snapshot.positionUsd + snapshot.feesUsd;
  const worthEth = totalWorthUsd / snapshot.priceToken1PerToken0;
  const ethPrice = snapshot.priceToken1PerToken0;
  
  const recycleSuggested = snapshot.feesUsd > 250 ? "TRUE" : "FALSE";
  
  // Format CSV line
  const csvLine = `${date},${posEth.toFixed(4)},${posUsdc.toFixed(2)},${feeEth.toFixed(4)},${feeUsdc.toFixed(2)},${worthEth.toFixed(1)},${totalWorthUsd.toFixed(2)},${recycleSuggested},${ethPrice.toFixed(2)}`;
  
  // Check if file exists to know if we need to write header
  let fileExists = false;
  try {
    await fs.access(csvPath);
    fileExists = true;
  } catch {
    fileExists = false;
  }
  
  // Write header if file doesn't exist
  if (!fileExists) {
    await fs.writeFile(csvPath, "date,pos_eth,pos_usdc,fee_eth,fee_usdc,worth_eth,worth_usdc,recycle_suggested,eth_price\n", "utf8");
  }
  
  // Append the line
  await fs.appendFile(csvPath, csvLine + "\n", "utf8");
}

/**
 * Print current LP position status
 */
function printStatus(snapshot) {
  const ts = new Date().toISOString();
  const ethPrice = snapshot.priceToken1PerToken0; // USDC per ETH

  const positionUsd = snapshot.positionUsd;
  const feesUsd = snapshot.feesUsd;
  const totalWorthUsd = positionUsd + feesUsd;
  const totalWorthEth = totalWorthUsd / ethPrice;

  console.log();
  console.log(`[${ts}]`);
  console.log();
  console.log(`LP POSITION STATUS`);
  console.log(`─────────────────────────────────────────`);
  
  if (snapshot.currency0IsNative) {
    console.log(`Position: ${snapshot.amount0.toFixed(4)} ETH + ${snapshot.amount1.toFixed(2)} USDC`);
    console.log(`Accrued Fees: ${snapshot.unclaimed0.toFixed(4)} ETH + ${snapshot.unclaimed1.toFixed(2)} USDC`);
  } else {
    console.log(`Position: ${snapshot.amount0.toFixed(2)} USDC + ${snapshot.amount1.toFixed(4)} ETH`);
    console.log(`Accrued Fees: ${snapshot.unclaimed0.toFixed(2)} USDC + ${snapshot.unclaimed1.toFixed(4)} ETH`);
  }

  console.log(`\nPosition Value: $${fmt(positionUsd)}`);
  console.log(`Fees Value: $${fmt(feesUsd)}`);
  console.log(`\nTotal Worth: $${fmt(totalWorthUsd)}`);
  console.log(`Total Worth: ${totalWorthEth.toFixed(1)} ETH`);
  console.log(`─────────────────────────────────────────\n`);
}

/**
 * Calculate how to split accrued fees to maintain current position ratio
 * for re-adding liquidity (all-in reinvestment)
 * 
 * Includes gas safety buffer - reserves ETH for transaction fees
 */
function calculateFeeRecycling(snapshot) {
  const GAS_SAFETY_BUFFER_ETH = 0.01; // Reserve 0.01 ETH for gas fees
  
  const { amount0, amount1, unclaimed0, unclaimed1, priceToken1PerToken0: ethPrice } = snapshot;
  
  // Current position ratio (in USD terms)
  const posUsd0 = snapshot.currency0IsNative 
    ? amount0 * ethPrice 
    : amount0;
  const posUsd1 = snapshot.currency1IsNative 
    ? amount1 * ethPrice 
    : amount1;
  const totalPosUsd = posUsd0 + posUsd1;
  const targetRatio = totalPosUsd > 0 ? posUsd0 / totalPosUsd : 0.5;

  // Fees available (in USD terms)
  let feesUsd0 = snapshot.currency0IsNative 
    ? unclaimed0 * ethPrice 
    : unclaimed0;
  let feesUsd1 = snapshot.currency1IsNative 
    ? unclaimed1 * ethPrice 
    : unclaimed1;
  
  // Apply gas safety buffer - reduce available ETH if native asset
  if (snapshot.currency0IsNative && unclaimed0 > GAS_SAFETY_BUFFER_ETH) {
    // Reserve gas buffer, only use excess ETH fees
    feesUsd0 = (unclaimed0 - GAS_SAFETY_BUFFER_ETH) * ethPrice;
  } else if (snapshot.currency0IsNative) {
    // Not enough ETH fees to cover buffer, don't use any
    feesUsd0 = 0;
  }
  
  if (snapshot.currency1IsNative && unclaimed1 > GAS_SAFETY_BUFFER_ETH) {
    // Reserve gas buffer, only use excess ETH fees
    feesUsd1 = (unclaimed1 - GAS_SAFETY_BUFFER_ETH) * ethPrice;
  } else if (snapshot.currency1IsNative) {
    // Not enough ETH fees to cover buffer, don't use any
    feesUsd1 = 0;
  }
  
  const totalFeesUsd = feesUsd0 + feesUsd1;

  // Target split to match position ratio
  const targetUsd0 = totalFeesUsd * targetRatio;
  const targetUsd1 = totalFeesUsd * (1 - targetRatio);

  const needUsd0 = targetUsd0 - feesUsd0;
  const needUsd1 = targetUsd1 - feesUsd1;

  let recommendation = {
    totalFeesUsd,
    currentFeesUsd0: feesUsd0,
    currentFeesUsd1: feesUsd1,
    targetUsd0,
    targetUsd1,
    ethPrice,
    isNative0: snapshot.currency0IsNative,
    isNative1: snapshot.currency1IsNative,
    gasBuffer: GAS_SAFETY_BUFFER_ETH,
  };

  // Determine what swap is needed
  if (Math.abs(needUsd0) < 1 && Math.abs(needUsd1) < 1) {
    // Already balanced
    recommendation.swap = null;
    recommendation.message = "✅ Fees already in correct ratio!";
  } else if (needUsd0 > 1) {
    // Need more token0 (ETH) - sell USDC for ETH
    const sellUsdcUsd = needUsd0;
    const buyEthAmount = sellUsdcUsd / ethPrice;
    recommendation.swap = {
      direction: "USDC→ETH",
      sellAmount: sellUsdcUsd,
      sellToken: snapshot.currency0IsNative ? "USDC" : "Token0",
      buyAmount: buyEthAmount,
      buyToken: snapshot.currency0IsNative ? "ETH" : "Token0",
    };
    recommendation.message = `Swap $${fmt(sellUsdcUsd)} USDC for ${buyEthAmount.toFixed(4)} ETH`;
  } else if (needUsd1 > 1) {
    // Need more token1 (USDC) - sell ETH for USDC
    const sellEthUsd = needUsd1;
    const sellEthAmount = sellEthUsd / ethPrice;
    recommendation.swap = {
      direction: "ETH→USDC",
      sellAmount: sellEthAmount,
      sellToken: snapshot.currency0IsNative ? "ETH" : "Token1",
      buyAmount: sellEthUsd,
      buyToken: snapshot.currency0IsNative ? "USDC" : "Token1",
    };
    recommendation.message = `Swap ${sellEthAmount.toFixed(4)} ETH for $${fmt(sellEthUsd)} USDC`;
  }

  return recommendation;
}

/**
 * Print fee recycling recommendation
 */
function printFeeRecyclingPlan(snapshot) {
  const plan = calculateFeeRecycling(snapshot);
  
  console.log(`REINVESTING ACCRUED FEES`);
  console.log(`─────────────────────────────────────────`);
  console.log(`Total Fees: $${fmt(plan.totalFeesUsd)}`);
  if (plan.isNative0) {
    console.log(`(Gas buffer reserved: ${plan.gasBuffer} ETH)\n`);
  }
  
  if (plan.isNative0) {
    console.log(`Current: ${(plan.currentFeesUsd0 / plan.ethPrice).toFixed(4)} ETH + ${plan.currentFeesUsd1.toFixed(2)} USDC`);
    console.log(`Target: ${(plan.targetUsd0 / plan.ethPrice).toFixed(4)} ETH + ${plan.targetUsd1.toFixed(2)} USDC`);
  } else {
    console.log(`Current: ${plan.currentFeesUsd0.toFixed(2)} USDC + ${(plan.currentFeesUsd1 / plan.ethPrice).toFixed(4)} ETH`);
    console.log(`Target: ${plan.targetUsd0.toFixed(2)} USDC + ${(plan.targetUsd1 / plan.ethPrice).toFixed(4)} ETH`);
  }

  console.log(`\n${plan.message}`);
  
  if (plan.swap) {
    console.log(`\nSwap to execute:`);
    if (plan.swap.direction === "ETH→USDC") {
      console.log(`  Sell: ${plan.swap.sellAmount.toFixed(4)} ${plan.swap.sellToken}`);
      console.log(`  Buy: $${fmt(plan.swap.buyAmount)} ${plan.swap.buyToken}`);
    } else {
      console.log(`  Sell: $${fmt(plan.swap.sellAmount)} ${plan.swap.sellToken}`);
      console.log(`  Buy: ${plan.swap.buyAmount.toFixed(4)} ${plan.swap.buyToken}`);
    }
  }
  
  console.log(`─────────────────────────────────────────\n`);
}

/**
 * Main function: fetch position and print status + recycling plan
 */
async function checkPosition() {
  const env = {
    RPC_URL: requireEnv("RPC_URL"),
    POSITION_TOKEN_ID: requireEnv("POSITION_TOKEN_ID"),
    POSM_ADDRESS: requireEnv("POSM_ADDRESS"),
    STATE_VIEW_ADDRESS: requireEnv("STATE_VIEW_ADDRESS"),
  };

  try {
    const snapshot = await fetchPositionSnapshot({
      rpcUrl: env.RPC_URL,
      tokenId: env.POSITION_TOKEN_ID,
      posmAddress: env.POSM_ADDRESS,
      stateViewAddress: env.STATE_VIEW_ADDRESS,
    });

    printStatus(snapshot);
    
    // Save to CSV
    await saveToCSV(snapshot);
    
    // Only show fee recycling plan if fees are above threshold
    const plan = calculateFeeRecycling(snapshot);
    if (plan.totalFeesUsd > 250) {
      printFeeRecyclingPlan(snapshot);
    }

    return snapshot;
  } catch (e) {
    console.error("Error fetching position:", e.message);
    throw e;
  }
}

// Run
checkPosition();
