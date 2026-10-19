// Fork config: runs the contract against the REAL Mezo testnet MUSD state.
// Usage: npx hardhat --config hardhat.config.fork.js run scripts/fork-demo.js
const base = require("./hardhat.config.js");

module.exports = {
  ...base,
  networks: {
    hardhat: {
      chainId: 31611,
      hardfork: "london",
      forking: { url: process.env.MEZO_RPC_URL || "https://rpc.test.mezo.org" },
      chains: { 31611: { hardforkHistory: { london: 0 } } },
    },
  },
};
