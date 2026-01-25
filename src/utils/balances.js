import { ethers } from "ethers";
import { ERC20_ABI } from "../uniswap/abis.js";

function toChecksum(address) {
  try {
    return ethers.utils.getAddress(address);
  } catch {
    return address;
  }
}

function normalizeAddresses(addresses) {
  return addresses.map((entry, idx) => {
    if (typeof entry === "string") {
      return { address: entry, label: `Wallet ${idx + 1}` };
    }
    return {
      address: entry.address,
      label: entry.label || `Wallet ${idx + 1}`,
    };
  });
}

function formatAmount(num, decimals = 4) {
  if (num == null || Number.isNaN(num)) return "—";
  return Number(num).toFixed(decimals);
}

async function fetchErc20Balance(provider, tokenAddress, decimals, holder) {
  const contract = new ethers.Contract(toChecksum(tokenAddress), ERC20_ABI, provider);
  const raw = await contract.balanceOf(holder);
  return Number(ethers.utils.formatUnits(raw, decimals));
}

export async function fetchWalletBalances(addresses = []) {
  const entries = normalizeAddresses(addresses);

  const providers = {
    mainnet: process.env.MAINNET_RPC_URL
      ? new ethers.providers.JsonRpcProvider(process.env.MAINNET_RPC_URL)
      : null,
    unichain: process.env.RPC_URL ? new ethers.providers.JsonRpcProvider(process.env.RPC_URL) : null,
  };

  const unichainUsdc = process.env.UNICHAIN_USDC_ADDRESS
    ? toChecksum(process.env.UNICHAIN_USDC_ADDRESS)
    : null;

  const wallets = [];

  for (const entry of entries) {
    const item = {
      address: entry.address,
      label: entry.label,
      eth: { symbol: "ETH", amount: null },
      uEth: { symbol: "uETH", amount: null },
      uUsdc: { symbol: "uUSDC", amount: null },
    };

    // Mainnet ETH
    if (providers.mainnet) {
      try {
        const bal = await providers.mainnet.getBalance(entry.address);
        item.eth.amount = Number(ethers.utils.formatEther(bal));
      } catch (err) {
        console.warn(`[wallets] mainnet ETH error ${entry.address}:`, err.message);
        item.eth.error = err.message;
      }
    } else {
      item.eth.error = "Missing MAINNET_RPC_URL";
    }

    // Unichain native
    if (providers.unichain) {
      try {
        const bal = await providers.unichain.getBalance(entry.address);
        item.uEth.amount = Number(ethers.utils.formatEther(bal));
      } catch (err) {
        console.warn(`[wallets] unichain ETH error ${entry.address}:`, err.message);
        item.uEth.error = err.message;
      }
    } else {
      item.uEth.error = "Missing RPC_URL";
      item.uUsdc.error = "Missing RPC_URL";
    }

    // Unichain USDC
    if (providers.unichain && unichainUsdc) {
      try {
        const amt = await fetchErc20Balance(providers.unichain, unichainUsdc, 6, entry.address);
        item.uUsdc.amount = amt;
      } catch (err) {
        console.warn(`[wallets] unichain USDC error ${entry.address}:`, err.message);
        item.uUsdc.error = err.message;
      }
    } else if (!unichainUsdc && providers.unichain) {
      item.uUsdc.error = "Missing UNICHAIN_USDC_ADDRESS";
    }

    wallets.push(item);
  }

  return { wallets, formatAmount };
}
