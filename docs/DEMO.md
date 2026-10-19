# Demo evidence

Two things are needed for the submission: a working public deployment, and proof that the flows were
actually executed. This file records both.

## 1. Local end-to-end run (verified, 2026-10-19)

Reproduce with:

```bash
npm run node                              # terminal 1
# terminal 2
REVIEW_PERIOD_SECONDS=6 npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/demo.js --network localhost
```

Result (`exit 0`, contract balance after the run: **0 MUSD** — every unit was settled exactly once):

| Gig | Path exercised | Outcome |
|---|---|---|
| #1 | `createGig` → `submitMilestone` → `approveMilestone` (milestone 1); `submitMilestone` → `claimMilestone` after the 6 s review period (milestone 2) | Completed, 250 MUSD paid out |
| #2 | `submitMilestone` → `openDispute` → `resolveDispute(5000)` (50/50 split) | Completed, 100 paid / 100 refunded |
| #3 | `createGig` → `proposeCancel` → `confirmCancel` (mutual) | Cancelled, 100 refunded |

Deployed locally (ephemeral Hardhat chain, not public):

```
escrow 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
musd   0x5FbDB2315678afecb367f032d93F642f64180aa3  (MockMUSD)
reviewPeriod 6 s
```

Transaction hashes of that run (local chain, reproducible by anyone running the commands above):

```
createGig #1            0x1bdd38d586dc01933320ea594d7e724cda4a9721a2b93fb55f48f9719f46a75a
submitMilestone #1.0    0x309a597b4e0f1a94dbe4c13ed87a7744b8fa84b186cd56198aa40f6257eae367
approveMilestone #1.0   0xa916d7a9b81cf95e610d540e4351c4931c1d92a6f4cad1c513ffcf49177792b2
submitMilestone #1.1    0xec9e923b64fccd7ffa8df1f879d9710deba7979def81d89c82130779b83025e0
claimMilestone #1.1     0x73fb183a8c7ab5abea33af7b84f52c94ad6e8c058303979eb58ea36018e49cb2
createGig #2            0xe14fa3ffa46879b71123b96522bb6048ff0668d222de14ed43b7516c4db196eb
submitMilestone #2.0    0x494111bd4ca9993094c0ccf5d664d2facbae4d9d65d5da0fe9b112a6cf22ad70
openDispute #2.0        0x8ea26c9fbe79a6d24ca3088d28cf87c08eacbd85366f5db1749c0bcfd7448a5b
resolveDispute #2.0     0x8635a0b310ec68d7fab39bce593f8ddc3c6f3bd2c62ec642e84ce189d24bc38d
createGig #3            0x3645508072d4e6d55f395be8a39c820f967849b636ebe498bb4fc73d78bbe8ad
proposeCancel #3        0xf2412a211b273c8c3eca53deec10fe6935ba74f8fafc7435574b102d061b1279
confirmCancel #3        0x7c1ad062f91384c694980f56966b853c8390093cef84a0699eda3c61cdb16103
```

## 2. Public Mezo Testnet run (required by the submission, pending deployer key)

The deployment needs a throwaway testnet wallet funded with test BTC, plus optionally two more keys so that
“client / freelancer / arbiter” are distinct signers (see `scripts/demo.js` which uses signers 0–2).

Checklist once the key is available:

```bash
cp .env.example .env
# DEPLOYER_PRIVATE_KEY=<throwaway key>, MUSD_ADDRESS=0x1189…c503, REVIEW_PERIOD_SECONDS=148
# FREELANCER_PRIVATE_KEY / ARBITER_PRIVATE_KEY are optional for scripts/demo.js on testnet
npm run deploy:mezo
npx hardhat verify --network mezoTestnet <escrow> 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503 148
node scripts/export-abi.js
cd frontend && npm run build   # then publish dist/ (GitHub Pages workflow included)
```

Then replace the placeholder rows in the root `README.md`:

| Placeholder | Fill with |
|---|---|
| `deployments/mezoTestnet.json → escrow` | deployed address |
| `deployments/mezoTestnet.json → txHash` | creation transaction |
| 2–3 `GigCreated` / `MilestoneApproved` / `DisputeResolved` hashes | real testnet txs from the demo run |
| `https://<your-user>.github.io/mezogig/` | the published frontend URL |

## 3. What a judge can do without any of that

Open the frontend, connect a wallet on Mezo Testnet, and run the loop from the “How to test in 5 min” tab:
create → submit → approve, plus the auto-claim (short review period), the refund and the dispute split.
Every step is a plain contract call; the UI shows the transaction hash and a link to the explorer.
