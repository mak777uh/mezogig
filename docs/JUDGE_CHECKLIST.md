# Judge checklist — criterion → evidence

The AKINDO brief names three criteria: **it works as described**, **anyone can test every function**,
**no obvious security holes**, and asks for a small but polished product. This is the mapping.

## 1. “It works as described”

| Claim | Evidence |
|---|---|
| Up-front funding of the whole gig, per-milestone release | `createGig` transfers `sum(amounts)` in one `safeTransferFrom`; `test/MezoGigEscrow.test.js` → “deposits the full sum and stores milestones” |
| Freelancer submits, client approves, money moves | “lets the freelancer submit before the deadline”, “pays the freelancer and marks the gig completed on the last milestone” |
| Automatic acceptance after a review period | “is blocked before the review period and works after it”; the local demo exercises it with a 6 s period |
| Refund of undelivered milestones | “refunds a milestone that missed its deadline”, “completes the gig when every milestone ends refunded” |
| Dispute with a percentage split by an arbiter | “splits the milestone between both parties and settles exactly once”, “supports 0 % and 100 % splits” |
| Mutual cancellation with both signatures | “refunds every pending milestone once both parties agree”, “allows the proposer to revoke” |
| No fee, no owner, no withdrawal of other people’s money | “has no owner / admin surface” (ABI assertion) + `docs/SECURITY.md` trust model |
| The token really is the testnet MUSD (18 decimals, permit) | on-chain checks documented in `docs/DEMO.md`: `decimals()=18`, `symbol()=MUSD`, `DOMAIN_SEPARATOR` present; EIP-2612 path covered by “supports EIP-2612 permit creation without a separate approve” |
| Whole flow really settles to zero | local e2e run: escrow MUSD balance **0** after three gigs (`docs/DEMO.md`) |

## 2. “Anyone can test every function”

- **Live demo** (frontend on GitHub Pages, Mezo Testnet wired in): create gig with milestones, invite link,
  role-based buttons for submit / approve / claim / refund / dispute / resolve / propose-cancel / confirm-cancel.
- **Faucet + MUSD instructions** are in the UI (“How to test in 5 min” tab) and in the README.
- **No allowlist, no permissions**: every function is callable by whoever holds the right role, and the roles
  are just addresses chosen at gig creation. A judge can be client, freelancer and arbiter with three
  wallets — or reuse one wallet for two roles where the contract allows it (it does not allow
  client == freelancer, by design).
- **Read-only inspection** needs no wallet: `getGig`, `getMilestone`, `lockedAmount`, `claimableAt`,
  `gigCount`, plus all events (`GigCreated`, `MilestoneSubmitted`, `MilestoneApproved`, …).
- **Demo speed:** the deployed contract uses a short review period (148 s) so the auto-claim path can be
  tested in a couple of minutes instead of days.

## 3. “No obvious security holes”

| Question a judge will ask | Answer / evidence |
|---|---|
| Can anyone drain the escrow? | No owner, no arbitrary transfer; payouts are bounded by milestone amount and gated by role + state. `docs/SECURITY.md` §Trust model. |
| Can a milestone be paid twice? | Status machine + terminal states; test “rejects approval of a pending milestone and double approval”, fuzz invariant `paidOut + refunded == funded`. |
| Can the total payout exceed the deposit? | Fuzz test over randomized amounts/splits/paths asserts `paidOut + refunded == funded` and contract balance returns to 0. |
| Reentrancy? | `nonReentrant` on every state-changing function + CEI; `test/Reentrancy.test.js` attacks six payout paths with a malicious ERC-20; all rejected. |
| Can the arbiter steal? | The arbiter can only split a *disputed* milestone, once, with `bps ≤ 10000`; remainder always returns to the client. |
| Can a party grief by never acting? | Client silence → freelancer auto-claims after the review period; freelancer silence → client refunds after the deadline; both sides always have an exit. |
| Deadlines and timestamps abuse? | Submission only before the deadline, refund only after it; timestamps documented in `docs/SLITHER_REPORT.md` as by-design. |
| Integer/rounding? | 0.8.28 checked arithmetic; `amount * bps / 10000` and `client = amount - freelancer` → exact sum; 0 % / 100 % covered by tests. |
| Token weirdness? | Immutable MUSD address + `SafeERC20`; `docs/SECURITY.md` lists the fee-on-transfer limitation explicitly. |
| Static analysis? | Slither 0.11.6, 6 findings all dispositioned (`docs/SLITHER_REPORT.md`), no high/medium. |

## “Small but polished”

- One contract, ~490 lines, 8 user-facing actions, 11 events, custom errors, no dependencies beyond
  OpenZeppelin.
- 90 tests (69 contract + 10 Agent Console + 8 MCP + 3 pin-proof), 100 % statement / 100 % function / 100 % line coverage of the escrow, 92 % branches.
- Frontend: three tabs, no wallet needed to read, one-click faucet/MUSD links, invite links, role-aware UI.
- Agent Console (23.10): `npm run agent -- verify --json` is a **no-wallet** check (chainId 31611, musdMatches true, reviewPeriod 148, gigCount 0); `status --json`, `jobs list`, `job get`, `watch` are read-only; lifecycle commands are `--dry-run` calldata builders by default. MCP: `node mcp/escrow-server.js` exposes `create_gig`, `fund_gig`, `submit_milestone`, `approve_milestone`, `open_dispute`, `gig_status`, `list_gigs`; writes default to `dry_run=true`. Pin: `node scripts/pin-proof.js <file>`. 8 MCP + 3 pin tests.
- Docs: README (problem → solution → state machine → 5-minute test → security), SECURITY, TESTING,
  COVERAGE, SLITHER_REPORT, DEMO, SUBMISSION_UPDATE_2026-10-23.

## Open items for the submission owner (not claimed as done)

1. **Full lifecycle on the public testnet still needs MUSD.** Testnet MUSD requires borrowing against test BTC (minimum 2000 MUSD debt), so the public contract has `gigCount = 0` and the full loop is demonstrated on a local chain (`docs/DEMO.md`). Decision: keep this honest local demo + read-only CLI path, or fund a public gig (requires test BTC/MUSD; not done).
2. **Video is still the 19.10 version.** The deck now has 9 slides and includes the Agent Console; the 113-second video does not show it. Decision: keep as is (deck covers it) or re-record.
3. **AKINDO submission record** `VwpAxg884FA2Mw6E` still contains the 19.10 comment; the 23.10 delta is in `docs/SUBMISSION_UPDATE_2026-10-23.md` and was posted as a wave comment. The owner updates the record via the AKINDO UI.

