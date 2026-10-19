require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "london",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: "london",
      // Mezo testnet is not in Hardhat's built-in chain list; declare its hardfork
      // history so `hardhat_reset` with a fork of rpc.test.mezo.org works.
      chains: { 31611: { hardforkHistory: { london: 0 } } },
    },
    localhost: { url: "http://127.0.0.1:8545" },
    mezoTestnet: {
      url: process.env.MEZO_RPC_URL || "https://rpc.test.mezo.org",
      chainId: 31611,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: { mezoTestnet: process.env.MEZO_EXPLORER_API_KEY || "empty" },
    customChains: [
      {
        network: "mezoTestnet",
        chainId: 31611,
        urls: {
          apiURL: "https://explorer.test.mezo.org/api",
          browserURL: "https://explorer.test.mezo.org",
        },
      },
    ],
  },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
  mocha: { timeout: 120000 },
};
