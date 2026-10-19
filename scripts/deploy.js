const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const MEZO_TESTNET_MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

async function main() {
  const [deployer] = await ethers.getSigners();
  let musdAddress = process.env.MUSD_ADDRESS;
  const isLocal = network.name === "localhost" || network.name === "hardhat";

  if (!musdAddress && isLocal) {
    const Mock = await ethers.getContractFactory("MockMUSD");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    musdAddress = await mock.getAddress();
    console.log(`MockMUSD (local only): ${musdAddress}`);
  }
  if (!musdAddress) musdAddress = MEZO_TESTNET_MUSD;

  const reviewPeriodSeconds = Number(process.env.REVIEW_PERIOD_SECONDS || (isLocal ? 6 : 148));

  console.log(`network:       ${network.name} (chainId ${network.config.chainId})`);
  console.log(`deployer:      ${deployer.address}`);
  console.log(`balance:       ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} BTC`);

  const factory = await ethers.getContractFactory("MezoGigEscrow");
  const escrow = await factory.deploy(musdAddress, reviewPeriodSeconds);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  const tx = escrow.deploymentTransaction();
  const receipt = tx ? await tx.wait() : null;
  const deployInfo = {
    network: network.name,
    chainId: Number(network.config.chainId),
    escrow: address,
    musd: musdAddress,
    reviewPeriodSeconds,
    deployer: deployer.address,
    txHash: tx ? tx.hash : null,
    blockNumber: receipt ? receipt.blockNumber : null,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${network.name}.json`), JSON.stringify(deployInfo, null, 2));

  console.log(`\nMezoGigEscrow deployed to: ${address}`);
  console.log(`  MUSD token:       ${musdAddress}`);
  console.log(`  review period:    ${reviewPeriodSeconds}s`);
  console.log(`  explorer:         https://explorer.test.mezo.org/address/${address}`);
  console.log(`  deployment saved: deployments/${network.name}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
