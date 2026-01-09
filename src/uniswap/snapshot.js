import { ethers } from "ethers";
import { Token, Ether } from "@uniswap/sdk-core";
import { Pool, Position } from "@uniswap/v4-sdk";

import { CHAIN_ID } from "../config.js";
import { POSM_ABI, STATE_VIEW_ABI, ERC20_ABI } from "./abis.js";
import { decodeTicks, padSaltFromTokenId } from "../utils/decode.js";
import { jsbiToBigInt, priceToken1PerToken0 } from "../utils/math.js";

async function getDecimals(provider, tokenAddress) {
  if (tokenAddress === ethers.constants.AddressZero) return 18;
  const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return Number(await erc20.decimals());
}

export async function fetchPositionSnapshot({ rpcUrl, tokenId, posmAddress, stateViewAddress }) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const posm = new ethers.Contract(posmAddress, POSM_ABI, provider);
  const stateView = new ethers.Contract(stateViewAddress, STATE_VIEW_ABI, provider);

  const tid = BigInt(tokenId);

  const [[poolKey, infoValue], posLiq] = await Promise.all([
    posm.getPoolAndPositionInfo(tid),
    posm.getPositionLiquidity(tid),
  ]);

  const { tickLower, tickUpper } = decodeTicks(infoValue);

  const currency0IsNative = poolKey.currency0.toLowerCase() === ethers.constants.AddressZero;
  const currency1IsNative = poolKey.currency1.toLowerCase() === ethers.constants.AddressZero;

  const currency0 = currency0IsNative
    ? Ether.onChain(CHAIN_ID)
    : new Token(
        CHAIN_ID,
        poolKey.currency0,
        await getDecimals(provider, poolKey.currency0),
        "T0",
        "Token0"
      );

  const currency1 = currency1IsNative
    ? Ether.onChain(CHAIN_ID)
    : new Token(
        CHAIN_ID,
        poolKey.currency1,
        await getDecimals(provider, poolKey.currency1),
        "T1",
        "Token1"
      );

  const poolId = Pool.getPoolId(
    currency0,
    currency1,
    Number(poolKey.fee),
    Number(poolKey.tickSpacing),
    poolKey.hooks
  );

  const [slot0, poolLiquidity] = await Promise.all([
    stateView.getSlot0(poolId),
    stateView.getLiquidity(poolId),
  ]);

  const sqrtPriceX96 = slot0[0];
  const currentTick = Number(slot0[1]);

  const pool = new Pool(
    currency0,
    currency1,
    Number(poolKey.fee),
    Number(poolKey.tickSpacing),
    poolKey.hooks,
    BigInt(sqrtPriceX96).toString(),
    BigInt(poolLiquidity).toString(),
    currentTick
  );

  const position = new Position({
    pool,
    tickLower,
    tickUpper,
    liquidity: BigInt(posLiq).toString(),
  });

  const amount0Raw = jsbiToBigInt(position.amount0.quotient);
  const amount1Raw = jsbiToBigInt(position.amount1.quotient);

  const dec0 = currency0IsNative ? 18 : currency0.decimals;
  const dec1 = currency1IsNative ? 18 : currency1.decimals;

  const amount0 = Number(ethers.utils.formatUnits(amount0Raw, dec0));
  const amount1 = Number(ethers.utils.formatUnits(amount1Raw, dec1));

  const p1per0 = priceToken1PerToken0({ sqrtPriceX96, dec0, dec1 });
  const positionUsd = amount0 * p1per0 + amount1;

  const salt = padSaltFromTokenId(tid);
  const stored = await stateView.getPositionInfo(poolId, posmAddress, tickLower, tickUpper, salt);

  const liquidityStored = stored[0];
  const feeGrowth0Last = stored[1];
  const feeGrowth1Last = stored[2];
  const [feeGrowth0Now, feeGrowth1Now] = await stateView.getFeeGrowthInside(
    poolId,
    tickLower,
    tickUpper
  );

  const Q128 = 2n ** 128n;
  const L = BigInt(liquidityStored);

  const unclaimed0Raw = ((BigInt(feeGrowth0Now) - BigInt(feeGrowth0Last)) * L) / Q128;
  const unclaimed1Raw = ((BigInt(feeGrowth1Now) - BigInt(feeGrowth1Last)) * L) / Q128;

  const unclaimed0 = Number(ethers.utils.formatUnits(unclaimed0Raw, dec0));
  const unclaimed1 = Number(ethers.utils.formatUnits(unclaimed1Raw, dec1));
  const feesUsd = unclaimed0 * p1per0 + unclaimed1;

  return {
    provider,
    tokenId: tid.toString(),
    poolKey,
    currency0IsNative,
    currency1IsNative,
    tickLower,
    tickUpper,
    currentTick,
    priceToken1PerToken0: p1per0,
    amount0,
    amount1,
    positionUsd,
    unclaimed0,
    unclaimed1,
    feesUsd,
  };
}
