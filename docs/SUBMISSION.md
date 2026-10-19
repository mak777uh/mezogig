# SUBMISSION — MezoGig (AKINDO “Build with MUSD and MEZO”)

> Everything needed to judge the project without reading the source first. Placeholders marked
> `<…>` are filled the moment the testnet deployment lands; the local evidence is already final.

## 1. What is submitted

| Item | Value |
|---|---|
| Project | **MezoGig** — milestone escrow for freelance gigs, settled in MUSD |
| Network | Mezo Testnet, chainId **31611** (testnet only, no real money) |
| Main artifact | `mezogig-release.zip` (source + docs, no `node_modules`/`.env`/build output) |
| Repository | local git, 6 commits, MIT — public GitHub pending owner access |
| Contract | `contracts/MezoGigEscrow.sol` (solc 0.8.28, optimizer 200, `evmVersion london`) |
| Contract address | **`0x247b313d0eD3C532B16c7E5f9eA760272361600F`** |
| Explorer | `https://explorer.test.mezo.org/address/0x247b313d0eD3C532B16c7E5f9eA760272361600F` |
| Verification | **Sourcify `exact_match`** (creation + runtime, matchId `56559336`) — [public record](https://repo.sourcify.dev/contracts/full_match/31611/0x247b313d0eD3C532B16c7E5f9eA760272361600F/) |
| MUSD token | [`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`](https://explorer.test.mezo.org/address/0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503) (18 dec, EIP-2612) |
| Review period | **148 s** (short on purpose: the auto-claim path must be testable in minutes) |
| Live demo | build ready in `frontend/dist` with the real escrow address; hosting pending (GitHub Pages workflow included, Vercel alternative documented) |

## 2. What it does (one paragraph)

The client deposits the **entire gig budget up-front** in MUSD. Each milestone has an amount and a deadline.
The freelancer submits a milestone with a proof link; the client approves and the milestone amount is paid
immediately. If the client stays silent for the review period, the freelancer claims automatically. If a
milestone is not submitted before its deadline, the client refunds it. Either party can open a dispute; the
arbiter chosen at gig creation splits that milestone by basis points. Both parties can cancel by mutual
signature, and the remaining funds go back to the client. There is no owner, no platform fee, no
upgradeability, and no way to withdraw funds outside these paths.

## 3. Transaction evidence

### 3.1 Deployment (Mezo Testnet)

| Step | Value |
|---|---|
| `MezoGigEscrow` deployed at | `0x247b313d0eD3C532B16c7E5f9eA760272361600F` |
| Deployment tx | `0xc9ea76977cd4840160378e2ce3d52269a22dc090f5b3daeed0ec68a562ad7e44` |
| Block / gas used | `16247351` / `2393779` |
| Deployer | `0x0A66a9dEF221Efc698b6bbecA82cAE6729A8aba8` (team testnet wallet) |
| Verification | **Sourcify `exact_match`** (creation + runtime), matchId `56559336`, verification job `9c50c6a0-2e7f-4032-93ed-39717c84e10f` — [repo record](https://repo.sourcify.dev/contracts/full_match/31611/0x247b313d0eD3C532B16c7E5f9eA760272361600F/) |

> Note: the Mezo testnet explorer (Blockscout) does **not** expose the Etherscan-compatible API
> (`/api` returns 404), so `hardhat verify` cannot talk to it. The chain **is** supported by Sourcify
> (`{"name":"Mezo Testnet","chainId":31611,"supported":true,"etherscanAPI":false}`), and the contract is
> verified there with an exact match on both creation and runtime bytecode. Sourcify is the canonical
> public verification record for this deployment; the explorer page still shows the deployed bytecode.
> Reproduce: `npm run verify:sourcify`.

### 3.2 Contract state after deployment (read calls, no gas needed)

```bash
# review period (expected 148)
cast call 0x247b313d0eD3C532B16c7E5f9eA760272361600F "reviewPeriod()(uint256)" --rpc-url https://rpc.test.mezo.org
# MUSD token (expected 0x1189…c503)
cast call 0x247b313d0eD3C532B16c7E5f9eA760272361600F "musd()(address)" --rpc-url https://rpc.test.mezo.org
# gigs created so far (expected 0)
cast call 0x247b313d0eD3C532B16c7E5f9eA760272361600F "gigCount()(uint256)" --rpc-url https://rpc.test.mezo.org
```

### 3.3 Full lifecycle run — local Hardhat chain (honest label)

MUSD borrowing on the testnet was deliberately skipped for the submission (it needs a BTC collateral
position and a minimum 2000 MUSD debt — unnecessary risk for a demo). The full lifecycle is therefore
demonstrated on a **local Hardhat chain**. The integration with the real MUSD token is verified separately
by read-only calls against the deployed token (§3.4).

Local run (see `docs/DEMO.md` for the task-by-task breakdown):

| Path | Hash (local chain) |
|---|---|
| `createGig` #1 | `0x1bdd38d586dc01933320ea594d7e724cda4a9721a2b93fb55f48f9719f46a75a` |
| `submitMilestone` #1.0 | `0x309a597b4e0f1a94dbe4c13ed87a7744b8fa84b186cd56198aa40f6257eae367` |
| `approveMilestone` #1.0 | `0xa916d7a9b81cf95e610d540e4351c4931c1d92a6f4cad1c513ffcf49177792b2` |
| `claimMilestone` #1.1 (auto after review) | `0x73fb183a8c7ab5abea33af7b84f52c94ad6e8c058303979eb58ea36018e49cb2` |
| `openDispute` #2.0 | `0x8ea26c9fbe79a6d24ca3088d28cf87c08eacbd85366f5db1749c0bcfd7448a5b` |
| `resolveDispute` #2.0 (50/50) | `0x8635a0b310ec68d7fab39bce593f8ddc3c6f3bd2c62ec642e84ce189d24bc38d` |
| `proposeCancel` #3 | `0xf2412a211b273c8c3eca53deec10fe6935ba74f8fafc7435574b102d061b1279` |
| `confirmCancel` #3 | `0x7c1ad062f91384c694980f56966b853c8390093cef84a0699eda3c61cdb16103` |

After the run the escrow held **0 MUSD**: every unit of the deposit was settled exactly once.

## 4. How the contract is verified (and how to reproduce it)

The Mezo testnet explorer is Blockscout **without the Etherscan-compatible API** (`/api` → 404), so
`hardhat verify` cannot verify there. The chain is supported by Sourcify, and the deployment is verified
with an **exact match on creation and runtime bytecode**:

| Field | Value |
|---|---|
| Verification service | Sourcify v2, chain **31611** |
| Result | `exact_match` (creation + runtime), matchId `56559336` |
| Public record | <https://repo.sourcify.dev/contracts/full_match/31611/0x247b313d0eD3C532B16c7E5f9eA760272361600F/> |
| Reproduce | `npm run verify:sourcify` (reads `artifacts/build-info`, posts standard JSON to `/v2/verify/31611/<address>`, polls the job) |

Constructor arguments used at deployment (for any manual re-verification):

| Field | Value |
|---|---|
| Compiler | `0.8.28+commit.7893614a` |
| Optimization | enabled, 200 runs |
| EVM version | `london` |
| Constructor arg 1 (`address`) | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| Constructor arg 2 (`uint256`) | `148` |

## 5. Judge path — 5 minutes

1. Add Mezo Testnet to the wallet: RPC `https://rpc.test.mezo.org`, chainId `31611`, symbol `BTC`,
   explorer `https://explorer.test.mezo.org`.
2. Get test BTC: `https://faucet.test.mezo.org` (BTC tab).
3. Get test MUSD: `https://testnet.mezo.org` → borrow MUSD against test BTC (min. 2000 MUSD debt).
4. Open the frontend, connect, **Create gig**: freelancer = second wallet, two milestones,
   arbiter = third wallet (or `0x0` to disable disputes). Approve MUSD → Create gig.
5. Copy the **invite link**, open it with the freelancer wallet, **Submit** a milestone.
6. Client: **Approve & pay** (money moves). Freelancer: **Claim** after the 148 s review period.
   Client: **Refund** after a missed deadline. Either: **Open dispute** → arbiter **Resolve split**.
   Either: **Propose cancel** → other party **Accept cancel**.
7. No wallet? The UI still lists gigs and every field via read-only calls.

## 6. Requirement → evidence

| Brief requirement | Evidence |
|---|---|
| `createGig` with milestones + full deposit | contract + test “deposits the full sum and stores milestones”; UI “Create gig” |
| `createGigWithPermit` (no separate approve) | contract + test “supports EIP-2612 permit creation…”; UI approve-then-create path also available |
| `submitMilestone` / `approveMilestone` | tests + local run hashes above |
| Auto-acceptance after REVIEW_PERIOD + `claimMilestone` | test “is blocked before the review period and works after it”; local run `claimMilestone` hash; demo period 148 s |
| `refundExpired` | test “refunds a milestone that missed its deadline” |
| `openDispute` / arbiter split | tests “splits the milestone…”, “0 % and 100 % splits”, “rejects out-of-range bps” |
| `cancelGig` by mutual agreement | tests “refunds every pending milestone once both parties agree”, proposer revoke, wrong confirmer |
| Events on every step | 11 events, asserted in tests (`GigCreated`, `MilestoneSubmitted`, `MilestoneApproved`, `MilestoneClaimed`, `MilestoneRefunded`, `DisputeOpened`, `DisputeResolved`, `CancelProposed`, `CancelRevoked`, `GigCancelled`) |
| No owner / no fee / no foreign withdrawals | test “has no owner / admin surface” + `docs/SECURITY.md` |
| Checks-effects-interactions, `nonReentrant`, SafeERC20, role/state checks, no double payout, payouts ≤ deposit | code + `test/Reentrancy.test.js` (6 attacks) + fuzz invariant `paidOut + refunded == funded` |
| Slither report attached | `docs/SLITHER_REPORT.md` (6 findings dispositioned) + `slither-report.json` |
| Tests > 90 % coverage | **100 % stmts / 92.03 % branch / 100 % funcs** — `docs/COVERAGE.md` |
| Frontend: create / my gigs / gig card with role buttons / invite link | `frontend/src/App.tsx`; build passes (`npm run build`) |
| MUSD balance + “how to get test MUSD” | UI header balance + faucet/MUSD links in footer and “How to test in 5 min” tab |
| Demo mode with short review period | deployment `REVIEW_PERIOD_SECONDS=148`; UI counts down to claimable |
| Frontend deployed for free | GitHub Pages workflow `.github/workflows/pages.yml` (pending repo access); Vercel instructions in README |
| Public repo, MIT, README with problem/solution/state machine/addresses/5-min test/tests/Security | README.md + LICENSE + docs/ |
| Contract verified on explorer | Sourcify **exact_match** on chain 31611 (the Mezo explorer has no Etherscan API — see §4) |
| A couple of real test orders on-chain | **Gap:** MUSD borrow skipped → no public-testnet orders; local + fork runs provided instead (see §3.3) |
| No private keys in the repo | `.env` gitignored, only `.env.example` committed; keys live in `env\secrets\` outside the repo; checked with `git status --ignored` |
| Optional 1–2 min video | script below, recording pending deployment |

## 7. Honest gaps

1. **No public-testnet lifecycle transactions.** The deploy is real; the orders are local/fork because MUSD
   on the testnet requires a collateralised borrow (min. 2000 MUSD debt). This is stated openly rather than
   dressed up.
2. **Public GitHub repository pending** — no token/account available in this environment; the zip is the
   primary artifact, the local git history is intact, and the Pages workflow is ready to publish once a
   repo exists.
3. **Video optional** — 90-second script: create gig (15 s) → submit as freelancer (10 s) → approve and show
   balance change (15 s) → claim after countdown (15 s) → dispute + split (20 s) → show `lockedAmount == 0`
   and the explorer page (15 s).

## 8. File map for reviewers

```
contracts/MezoGigEscrow.sol   the escrow (one contract, ~490 lines)
contracts/mocks/              MockMUSD + ReentrantMUSD (tests only, never deployed)
test/                         69 tests: lifecycle, guards, reentrancy, fuzz invariants
frontend/                     Vite + React + wagmi/viem + RainbowKit (Mezo Testnet wired in)
scripts/                      deploy, demo, fork-demo, export-abi, verify-args.sh
docs/                         SECURITY, TESTING, COVERAGE, SLITHER_REPORT, DEMO, JUDGE_CHECKLIST, SUBMISSION
deployments/                  deploy receipt (address, tx hash, review period)
```
