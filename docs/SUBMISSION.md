# SUBMISSION — MezoGig (AKINDO “Build with MUSD and MEZO”)

> Everything needed to judge the project without reading the source first. Placeholders marked
> `<…>` are filled the moment the testnet deployment lands; the local evidence is already final.

## 1. What is submitted

| Item | Value |
|---|---|
| Project | **MezoGig** — milestone escrow for freelance gigs, settled in MUSD |
| Network | Mezo Testnet, chainId **31611** (testnet only, no real money) |
| Main artifact | `mezogig-release.zip` (source + docs, no `node_modules`/`.env`/build output) |
| Repository | **public** — <https://github.com/mak777uh/mezogig> (MIT, branch `main`) |
| Contract | `contracts/MezoGigEscrow.sol` (solc 0.8.28, optimizer 200, `evmVersion london`) |
| Contract address | **`0x247b313d0eD3C532B16c7E5f9eA760272361600F`** |
| Explorer | `https://explorer.test.mezo.org/address/0x247b313d0eD3C532B16c7E5f9eA760272361600F` |
| Verification | **Sourcify `exact_match`** (creation + runtime, matchId `56559336`) — [public record](https://repo.sourcify.dev/contracts/full_match/31611/0x247b313d0eD3C532B16c7E5f9eA760272361600F/) |
| MUSD token | [`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`](https://explorer.test.mezo.org/address/0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503) (18 dec, EIP-2612) |
| Review period | **148 s** (short on purpose: the auto-claim path must be testable in minutes) |
| Live demo | **<https://mak777uh.github.io/mezogig/>** (GitHub Pages; Mezo Testnet wired in) |

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

## 5.1 View the frontend locally in 2 minutes (hosting not required)

```bash
cd frontend
npm ci          # or: npm install
npm run dev     # opens http://127.0.0.1:5173 — Mezo Testnet is already wired in
```

Production build (static files, works on any http server):

```bash
npm run build          # -> frontend/dist
npx vite preview       # or: npx serve dist
```

Screenshots (taken from the real build with the deployed address baked in — see the footer):

| File | What it shows |
|---|---|
| [`docs/screens/01-my-gigs.png`](screens/01-my-gigs.png) | Gigs list loaded from `GigCreated` events, client/freelancer filters, wallet connect, contract link in the footer |
| [`docs/screens/02-create-gig.png`](screens/02-create-gig.png) | Create-gig form: freelancer + arbiter + brief, two milestones with amounts and deadlines, total deposit, **Approve MUSD → Create gig** |
| [`docs/screens/03-connect-wallet.png`](screens/03-connect-wallet.png) | Wallet modal (RainbowKit) — Mezo Testnet is the only chain configured |
| [`docs/screens/04-help.png`](screens/04-help.png) | “How to test in 5 min” tab — the judge path with faucet and MUSD links |

The frontend falls back to injected wallets when no WalletConnect project id is configured, so a clean
`npm run dev` shows zero console errors.

## 5.2 Check everything with one command

```bash
# 1) deployed contract + real MUSD parameters (read-only, no gas, no wallet)
ESCROW_ADDRESS=0x247b313d0eD3C532B16c7E5f9eA760272361600F node scripts/check-musd.js
```

Expected output:

```
chainId:  31611
MUSD:     0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
  name:            Mezo USD
  symbol:          MUSD
  decimals:        18
  EIP-2612 permit:  supported
escrow:   0x247b313d0eD3C532B16c7E5f9eA760272361600F
  musd():        0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
  reviewPeriod:  148 s
  gigCount:      0
```

```bash
# 2) the test suite and coverage (69 tests, no network needed)
npm ci && npm test
npm run coverage

# 3) the verification record (Sourcify exact_match)
cat deployments/mezoTestnet.json
```

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
| Frontend deployed for free | **live**: <https://mak777uh.github.io/mezogig/> (GitHub Pages workflow `.github/workflows/pages.yml`; public values in `frontend/.env.production`) |
| Public repo, MIT, README with problem/solution/state machine/addresses/5-min test/tests/Security | **live**: <https://github.com/mak777uh/mezogig> + README.md + LICENSE + docs/ |
| Contract verified on explorer | Sourcify **exact_match** on chain 31611 (the Mezo explorer has no Etherscan API — see §4) |
| A couple of real test orders on-chain | **Gap:** MUSD borrow skipped → no public-testnet orders; local + fork runs provided instead (see §3.3) |
| No private keys in the repo | `.env` gitignored, only `.env.example` committed; keys live in `env\secrets\` outside the repo; checked with `git status --ignored` |
| Optional 1–2 min video | script below, recording pending deployment |

## 7. Honest gaps

1. **No public-testnet lifecycle transactions.** The deploy is real; the orders are local/fork because MUSD
   on the testnet requires a collateralised borrow (min. 2000 MUSD debt). This is stated openly rather than
   dressed up.
2. **Public GitHub repository — done.** <https://github.com/mak777uh/mezogig> (public, MIT, branch `main`);
   GitHub Pages serves the live demo at <https://mak777uh.github.io/mezogig/>. `.env` is gitignored and absent
   from the public tree (verified with the GitHub API: `/contents/.env` → 404).
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

## 9. AKINDO contest pack — “Build with MUSD and MEZO” (Wave 1)

Contest page: <https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10> (`akindo.io/…` without `app.` is a 404).
Facts below were read from the live page on 2026-10-19 with a CDP browser (the page is client-rendered;
`curl` cannot read it).

### 9.1 Facts

| Item | Value |
|---|---|
| Pool | **$7,000 in MEZO** — Wave 1 **$2,000**, Wave 2 $5,000; rewards are **proportional to points**, no fixed top-3 |
| Wave 1 build period | Oct 16 – **Oct 26, 2026** |
| Submit deadline | **2026-10-26 18:00 MSK = 15:00 UTC** |
| Judging (Wave 1) | Oct 27 – Nov 1; winners announced online **Nov 23** |
| Payout | MEZO at the 14-day TWAP on the day KYB completes; **KYB required** (W9/W8-BEN, government ID, proof of address, wallet) |
| Tracks | Track 1 DeFi (borrowing/lending/looping/yield) · Track 2 Access & Distribution (bots, matching, marketplaces, wallets) — “pick one, or submit to both” |
| Chains | Mezo, Ethereum, Base, BNB Chain — **Mezo testnet accepted** |
| Hard requirement | MUSD and/or MEZO integration + working deployment + built during the hackathon (or a new integration on an existing product) |

### 9.2 How it is judged

Two stages: **AKINDO screening** (integration present, working deployment on a supported chain, **all
submission materials provided** — otherwise not forwarded) → **Mezo core team scoring**:

| Criterion | Weight |
|---|---|
| Mezo Integration (depth of MUSD/MEZO use) | **30 %** |
| Product & Business Viability (problem-solution fit, complementarity with Mezo) | **30 %** |
| Technical Implementation (code quality, architecture, security, composable & deployable) | **20 %** |
| User Experience (design, usability, accessibility) | **10 %** |
| Submission Materials Quality (demo clarity, pitch) | **10 %** |

An organiser reply in the Comments tab states the practical bar: *“it works as expected; users can fully
test all features; no clear security flaws”* — exactly the line this project is built around.

### 9.3 Materials checklist (what the form expects vs what we have)

| Material | Required | Status |
|---|---|---|
| **Live project link** (testnet/mainnet) | yes — screening item | ✅ <https://mak777uh.github.io/mezogig/> (+ explorer: <https://explorer.test.mezo.org/address/0x247b313d0eD3C532B16c7E5f9eA760272361600F>) |
| **Public GitHub repository** | yes — screening item | ✅ <https://github.com/mak777uh/mezogig> (public, MIT, `.env` absent) |
| **Project/product deck** | yes | ⏳ build from `docs/` (pptx → pdf) |
| **2-minute pitch video** | yes | ⏳ build: real UI screenshots + deck slides, captioned, ffmpeg |
| Submission form fields (16) | yes | ✅ drafts below |
| KYB | only if selected | ⚠️ owner decision (W9/W8-BEN, ID, address, wallet) |
| Jurisdiction | yes | ⚠️ prohibited list (China, Iran, Iraq, Cuba, DPRK, Syria, DRC, Donetsk/Luhansk/Crimea) **plus a sanctions catch-all** → owner confirms before registering |

Registration (not done): AKINDO account — sign-in is **email address + magic link** (no wallet/Google/X);
join Mezo Discord; answer registration questions (full name, email, Telegram, Discord, GitHub, experience
level, focus area, product status, location, post-hackathon intent); accept the Terms.

### 9.4 Draft form answers (EN)

| Field | Draft |
|---|---|
| Project name | **MezoGig** |
| Category (3–5 words) | Milestone escrow payments |
| TL;DR (one sentence) | MezoGig is milestone escrow for freelance work: the client locks the whole budget in MUSD, each milestone is released on delivery, and a disputed milestone is split by an arbiter. |
| How it works (problem, function, MUSD/MEZO position) | Freelancers who deliver first risk not being paid; clients who pay first risk losing the money. MezoGig holds the entire gig budget in an escrow contract and releases it milestone by milestone: the freelancer submits with a proof link, the client approves, and after a review period the freelancer can claim automatically; undelivered milestones are refunded after their deadline; either party can open a dispute and the arbiter splits that milestone; both parties can cancel by mutual signature. MUSD is the settlement asset — a BTC-backed stablecoin removes the volatility problem that makes crypto payments unusable for real work, and EIP-2612 permit lets the client fund a gig in one transaction. (MEZO is not required by the contract; a future version can use it for fee discounts.) |
| Target group | Freelancers and small agencies working for crypto-native clients in the Bitcoin/Mezo economy, plus DAOs outsourcing bounded tasks; desktop first; any region where a stable USD unit matters. |
| Tech stack | Solidity 0.8.28 (OpenZeppelin 5, SafeERC20, ReentrancyGuard, EIP-2612), Hardhat, 69 tests (fuzz invariants + reentrancy attacks), Slither; Vite + React + wagmi/viem + RainbowKit; Mezo testnet chainId 31611, MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`. |
| Track | **Track 2 — Access & Distribution** (MUSD as a payment rail for work); optionally “both”. |
| Chain deployed on | Mezo testnet (chainId 31611) |
| Project status | Entirely new — built during Wave 1. |
| Project readiness | Testnet deployment (contract verified via Sourcify `exact_match`). |
| Future milestones | 1) hosted frontend + wallet UX polish (2 weeks); 2) mainnet deployment + security hardening/third-party review (4 weeks); 3) dispute v2 — staked arbiters and public reputation (8 weeks). |
| Team info | [owner name] — operator/product; AI agent team — engineering; X/LinkedIn: [fill] |

### 9.5 Competitive snapshot (14 submissions, Wave 1)

| Project | One-liner | Type |
|---|---|---|
| Liqvera | verifiable BTC market data, paid per report in MUSD via x402 | x402 / data — strongest materials (live demo, deck, proof tx) |
| Lockwatch | unlock/expiry protection for veBTC/veMEZO and MUSD redemptions | alerts |
| Vigil | Telegram alerts + pre-signed rescue before liquidation/redemption | alerts |
| Remitsheet for Mezo | pay a spreadsheet in MUSD/MEZO/BTC in one transaction | payments |
| Mezo Flow | Bitcoin-backed capital across chains | DeFi |
| MUSD Books | verifiable MUSD statements and invoice payments | payments/bookkeeping |
| kept (hidden) | unnamed submission | ? |
| Trove Guardian | Telegram bot + dashboard warning before liquidation | alerts |
| MUSD Subs | recurring MUSD subscriptions with revenue splits | payments |
| MUSD Pay Links | MUSD payment links/QR with pre-payment checks | payments |
| TAWFIK… (“Good”) | low-signal submission | — |
| MUSD Yield Vault | automated yield on idle MUSD | DeFi |
| MezoRoute | compare MUSD routes by BTC risk, borrow+deploy in one tx, **live on mainnet** | DeFi |
| TAWFIK… (ChatGPT assistant) | off-topic | — |

Pattern: the field is crowded with **alerts and simple payment links**, thin on escrow/arbitration. Our edge:
**Mezo Integration 30 %** (MUSD settlement, permit funding, immutable token, verified contract),
**Product 30 %** (real freelance market, counterparty risk, no platform fee), **Technical 20 %** (69 tests,
fuzz invariants, reentrancy attacks, Slither). Materials (10 % + screening gate) are the part to finish.

### 9.6 Open decisions (for the operator)

1. **KYB + jurisdiction** — confirm eligibility before registration (sanctions catch-all).
2. **Team identity** — the form needs member names and X/LinkedIn.
3. **Deck and video** — approve the plan (deck + captioned screencast) or provide the owner’s materials.
4. **Registration** — AKINDO account (email magic link) + Mezo Discord are required; nothing is submitted
   without the operator’s explicit go.

