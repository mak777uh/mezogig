# MezoGig — milestone escrow for freelance work, settled in MUSD on Mezo

> Hackathon project for **AKINDO “Build with MUSD and MEZO”**.
> Testnet only. No real money, no platform fee, no admin keys.

## The problem

Freelancers who take work from strangers have no payment guarantee. If they deliver first, the client can
disappear. If the client pays first, the money is gone before the work exists. On-chain escrow fixes the
incentive problem, but “send the whole budget to a contract and hope” is not enough: real gigs are split
into **milestones**, and each milestone can go wrong in its own way (not delivered, delivered late,
delivered but disputed).

There is a second problem specific to crypto freelancing: the budget is usually quoted in a volatile asset.
Mezo solves it with **MUSD**, a BTC-collateralised stablecoin on Mezo. A freelancer can be paid in a
stable unit while the client keeps their BTC exposure, and the escrow contract never touches BTC at all —
it only moves MUSD.

## The solution

`MezoGigEscrow` is one small contract that holds the **entire gig budget up-front** and releases it one
milestone at a time:

| Step | Who | What happens |
|---|---|---|
| `createGig` / `createGigWithPermit` | client | Deposits `sum(amounts)` MUSD in one transfer. Each milestone gets an amount and a deadline. |
| `submitMilestone` | freelancer | Delivers before the deadline, attaches a proof URI. |
| `approveMilestone` | client | Accepts; the milestone amount goes to the freelancer. |
| `claimMilestone` | freelancer | If the client stays silent for `reviewPeriod`, the freelancer claims automatically. |
| `refundExpired` | client | Milestone not submitted before its deadline → the client gets it back. |
| `openDispute` | either party | Freezes a milestone for the arbiter (chosen at gig creation). |
| `resolveDispute` | arbiter | Splits the milestone: `bps` to the freelancer, the rest back to the client. |
| `proposeCancel` / `confirmCancel` / `revokeCancel` | both parties | Mutual cancellation: both signatures required, pending funds return to the client. |

Every state change emits an event, and every payout is bounded by the milestone amount, so **the contract
can never pay out more than it took in**.

### State machine

```
gig:        Active ──▶ Completed
              └────▶ Cancelled (mutual, both signatures)

milestone:  Pending ──submit──▶ Submitted ──approve──────▶ Paid
               │                    │  └──claim (after review)──▶ Paid
               │                    └──openDispute──▶ Disputed ──resolve──▶ Resolved
               ├──deadline passed──▶ Refunded
               └──openDispute──────▶ Disputed
```

## Deployed contracts

| Network | Contract | Address |
|---|---|---|
| Mezo Testnet (chainId 31611) | `MezoGigEscrow` | **`0x…` — see `deployments/mezoTestnet.json`** |
| Mezo Testnet | MUSD (ERC-20, 18 dec, permit) | [`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`](https://explorer.test.mezo.org/address/0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503) |

Live demo (GitHub Pages): **`https://<your-user>.github.io/mezogig/`** — see `frontend/README` for the
one-command build.

## Test it in ~5 minutes

1. **Add Mezo Testnet** to your wallet:
   - RPC `https://rpc.test.mezo.org`
   - chainId `31611`
   - symbol `BTC`
   - explorer `https://explorer.test.mezo.org`
2. **Get test BTC** from the faucet: <https://faucet.test.mezo.org>.
3. **Get test MUSD**: go to <https://testnet.mezo.org>, borrow MUSD against your test BTC
   (minimum 2000 MUSD debt). MUSD on testnet is `0x1189…c503`.
4. Open the demo, connect the wallet, press **Create gig**:
   - freelancer = a second wallet (or a teammate’s address),
   - two milestones, e.g. `100` and `150` MUSD, deadlines a few minutes apart,
   - arbiter = any third address (or `0x0` to disable disputes).
   - Press **Approve MUSD**, then **Create gig**.
5. Copy the **invite link** (top right of the gig card) and open it with the freelancer wallet:
   **Submit** the milestone with any proof link. Back on the client wallet: **Approve & pay** — MUSD moves
   immediately.
6. Try the trustless paths:
   - submit, wait out the demo review period (a few minutes), then **Claim**;
   - let a deadline pass and use **Refund**;
   - open a **Dispute** and resolve it from the arbiter wallet with e.g. `5000` bps (50/50);
   - propose **cancel** from one wallet and accept from the other.

The demo deployment uses a **short review period** (see `REVIEW_PERIOD_SECONDS` in the deploy step) so the
auto-claim can be tested without waiting days.

## Repository layout

```
contracts/
  MezoGigEscrow.sol        # the escrow contract (no owner, no fee, immutable token)
  mocks/MockMUSD.sol       # local-only ERC-20 + permit used by tests
test/
  MezoGigEscrow.test.js    # 52 tests: happy paths, negative cases, accounting invariants, fuzz
scripts/
  deploy.js                # deploys and writes deployments/<network>.json
  export-abi.js            # copies the ABI into the frontend
  demo.js                  # local end-to-end flow against `hardhat node`
frontend/                  # Vite + React + wagmi/viem + RainbowKit, Mezo Testnet wired in
deployments/               # deploy receipts (address, tx, review period)
docs/
  SECURITY.md              # threat model, invariants, Slither report summary
  TESTING.md               # how to run tests and coverage
```

## Run tests

```bash
npm install
npm run compile
npm test          # 52 passing
npm run coverage  # statement/branch/function coverage report
```

## Deploy

```bash
cp .env.example .env       # put a THROWAWAY testnet key in DEPLOYER_PRIVATE_KEY
npm run deploy:mezo
# -> deployments/mezoTestnet.json (address + tx hash)
node scripts/export-abi.js
cd frontend && cp .env.example .env   # set VITE_ESCROW_ADDRESS, VITE_DEPLOY_BLOCK
npm install && npm run build
```

Verify the contract on the explorer (Blockscout-compatible endpoint):

```bash
npx hardhat verify --network mezoTestnet <ESCROW_ADDRESS> <MUSD_ADDRESS> <REVIEW_PERIOD_SECONDS>
```

Publish the frontend for free with GitHub Pages:

```bash
cd frontend && npm run build
# push dist/ to gh-pages, or use the included .github/workflows/pages.yml
```

## Security

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full threat model. Summary:

- **No owner, no admin, no fee, no upgradeability.** The only ways MUSD leaves the contract are the five
  payout paths above, each of which is bounded by a single milestone’s amount and guarded by a role and a
  state check.
- **Accounting invariant:** `paidOut + refunded ≤ funded`, and each milestone settles exactly once
  (status machine). Fuzz tests assert this over randomized amounts, splits and terminal paths.
- **Checks-effects-interactions** on every payout, `nonReentrant` on all state-changing functions,
  `SafeERC20` for token transfers, token address `immutable`.
- **No arbitrary calls, no `delegatecall`, no `selfdestruct`, no `tx.origin`.**
- MIT licensed; testnet only; nothing here is an audited production product.

## License

MIT — see `LICENSE`.
