import { defineChain } from "viem";

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" },
  },
  testnet: true,
});

export const EXPLORER = "https://explorer.test.mezo.org";

// Testnet MUSD (Mezo USD), 18 decimals, EIP-2612 permit.
export const MUSD_ADDRESS = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as const;

// Set after deployment (frontend/.env).
export const ESCROW_ADDRESS = (import.meta.env.VITE_ESCROW_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;
export const DEPLOY_BLOCK = BigInt(import.meta.env.VITE_DEPLOY_BLOCK || "0");

export const RPC_URL = "https://rpc.test.mezo.org";
export const BTC_FAUCET = "https://faucet.test.mezo.org";
export const MUSD_HOWTO = "https://testnet.mezo.org";
// Demo review period used by the deployed contract (seconds); shown in the UI only.
export const REVIEW_PERIOD_SECONDS_FALLBACK = Number(import.meta.env.VITE_REVIEW_PERIOD_SECONDS || "148");

export const GIG_STATUS = ["Active", "Completed", "Cancelled"] as const;
export const MS_STATUS = ["Pending", "Submitted", "Paid", "Refunded", "Disputed", "Resolved"] as const;
