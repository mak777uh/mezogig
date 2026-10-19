// Coverage uses the IR pipeline because solidity-coverage instrumentation pushes
// the stack past the legacy codegen limit on london. Production deploys keep the
// plain london/no-IR settings from hardhat.config.js.
const base = require("./hardhat.config.js");

module.exports = {
  ...base,
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "london",
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
};
