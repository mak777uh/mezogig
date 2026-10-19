// Read-only proof that the escrow is wired to the real Mezo testnet MUSD token.
// No transactions, no keys needed (the balance line is only printed when a key is present).
//
//   node scripts/check-musd.js
//
const { ethers } = require("ethers");

const RPC = process.env.MEZO_RPC_URL || "https://rpc.test.mezo.org";
const MUSD = process.env.MUSD_ADDRESS || "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const ESCROW = process.env.ESCROW_ADDRESS || null;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  const token = new ethers.Contract(
    MUSD,
    [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function DOMAIN_SEPARATOR() view returns (bytes32)",
      "function balanceOf(address) view returns (uint256)",
      "function totalSupply() view returns (uint256)",
    ],
    provider
  );

  console.log(`RPC:      ${RPC}`);
  console.log(`chainId:  ${net.chainId}`);
  console.log(`MUSD:     ${MUSD}`);
  console.log(`  name:            ${await token.name()}`);
  console.log(`  symbol:          ${await token.symbol()}`);
  console.log(`  decimals:        ${await token.decimals()}`);
  console.log(`  totalSupply:     ${ethers.formatUnits(await token.totalSupply(), 18)}`);
  const ds = await token.DOMAIN_SEPARATOR();
  console.log(`  DOMAIN_SEPARATOR: ${ds}`);
  console.log(`  EIP-2612 permit:  ${ds && ds !== ethers.ZeroHash ? "supported" : "NOT supported"}`);

  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (key) {
    const wallet = new ethers.Wallet(key, provider);
    console.log(`\nagent wallet: ${wallet.address}`);
    console.log(`  BTC balance:  ${ethers.formatEther(await provider.getBalance(wallet.address))}`);
    console.log(`  MUSD balance: ${ethers.formatUnits(await token.balanceOf(wallet.address), 18)}`);
  }

  if (ESCROW) {
    const escrow = new ethers.Contract(
      ESCROW,
      [
        "function musd() view returns (address)",
        "function reviewPeriod() view returns (uint256)",
        "function gigCount() view returns (uint256)",
      ],
      provider
    );
    console.log(`\nescrow:   ${ESCROW}`);
    console.log(`  musd():        ${await escrow.musd()}`);
    console.log(`  reviewPeriod:  ${await escrow.reviewPeriod()} s`);
    console.log(`  gigCount:      ${await escrow.gigCount()}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
