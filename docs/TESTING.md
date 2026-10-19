# Testing

## How to run

```bash
npm install
npm run compile
npm test
```

## What is covered

`test/MezoGigEscrow.test.js` — **52 tests**:

| Group | What it checks |
|---|---|
| deployment | MUSD/review period immutable; zero address and out-of-range review period rejected; no `owner`/`withdraw`/`setReviewPeriod` in the ABI |
| createGig | full sum deposited; milestones stored; event args; length mismatch; empty list; zero amount; past deadline; non-increasing deadlines; freelancer == client; zero addresses; arbiter == party; milestone cap; missing allowance; **EIP-2612 permit path**; **front-run permit tolerated** |
| submitMilestone | happy path + event; stranger; client; after deadline; double submit; bad index; non-existent gig |
| approveMilestone | payment; gig completes on last milestone; stranger/freelancer rejected; pending and double approval rejected; **sum of payouts == deposit** |
| claimMilestone | blocked before review period; works after; `claimableAt`; wrong role; double claim; cannot combine with approval |
| refundExpired | happy path; before deadline; submitted/paid milestone; wrong role; gig completes when all refunded |
| disputes | no arbiter; either party; stranger; non-arbiter resolution; 33.33 % split math; 0 % and 100 %; out-of-range bps; paid milestone not disputable |
| mutual cancel | both signatures refund everything; proposer revoke; wrong confirmer; no proposal; blocked while submitted; cancel after settling |
| invariants | contract balance == Σ locked; **fuzz: 12 randomized gigs × random amounts/terminal paths** (approve / auto-claim / dispute / refund) always satisfy `paidOut + refunded == funded`; **fuzz: split never exceeds the milestone** |

## Coverage

```bash
npm run coverage
```

`solidity-coverage` runs the same suite with instrumentation. Because the instrumentation pushes the legacy
codegen past the EVM stack limit on london, coverage uses `hardhat.config.coverage.js` with `viaIR: true`.
Production deploys keep the standard london/no-IR settings from `hardhat.config.js`.

The report is written to `coverage/index.html` and `coverage.json`; the summary is in
[`COVERAGE.md`](COVERAGE.md).

## Why these tests matter for the judges

The security property that matters is “the contract can never pay out more than it took in, and no
milestone can be paid twice”. The fuzz tests hammer exactly that: randomized amounts, randomized terminal
paths (approve, auto-claim after the review period, dispute with a random split, refund after a missed
deadline), and an assertion that every unit of every gig leaves the contract exactly once.
