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
- 69 tests, 100 % statement / 100 % function / 100 % line coverage of the escrow, 92 % branches.
- Frontend: three tabs, no wallet needed to read, one-click faucet/MUSD links, invite links, role-aware UI.
- Docs: README (problem → solution → state machine → 5-minute test → security), SECURITY, TESTING,
  COVERAGE, SLITHER_REPORT, DEMO.
