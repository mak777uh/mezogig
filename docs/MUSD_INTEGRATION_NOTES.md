# Building on MUSD — integration notes (Mezo Testnet, Oct 2026)

These are notes from building **MezoGig**, a milestone escrow settled in MUSD. Everything below is
reproducible from this repository; anything we did not verify is marked **unverified**.

## 1. Asset assumptions

Verified on 2026-10-23 with `node scripts/check-musd.js` against Mezo Testnet, chainId **31611**:

| Property | Value |
|---|---|
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| name / symbol | `Mezo USD` / `MUSD` |
| decimals | **18** |
| EIP-2612 permit | **supported** (`DOMAIN_SEPARATOR` present; permit path covered by tests) |
| Escrow | `0x247b313d0eD3C532B16c7E5f9eA760272361600F` |

MUSD is a standard ERC-20 plus EIP-2612. MezoGig's accounting is correct **only under two asset
assumptions**:

1. **No fee-on-transfer.** A fee would make the credited amount smaller than the nominal amount. The
   Lean model proves the concrete failure: nominal `100`, credited `95` →
   `paidOut + refunded + remaining = 95 ≠ 100` (`MezoGig.fee_on_transfer_breaks_budget`). The general
   shortfall is `MezoGig.fee_shortfall`.
2. **No rebasing.** A non-zero balance delta makes a tracked `lockedAmount` stale
   (`MezoGig.rebasing_breaks_locked`).

This is a **model-level result, not bytecode verification**; we did not deploy a fee/rebasing variant.
MUSD fits both assumptions as observed. The contract also binds the token by an immutable address, so a
different token cannot be substituted later.

## 2. Permit (EIP-2612)

`createGigWithPermit` uses MUSD's permit so the client does not need a separate `approve`.

The Lean model (`lean/Escrow.lean`, `PermitModel`) proves:

- `nonce_strictly_increases` — a successful permit sets `nonces owner = nonce + 1`;
- `no_replay` — the same `(owner, nonce)` cannot be applied twice;
- `no_replay_reachable` — the property holds from every reachable permit state;
- `no_increment_allows_replay` — a model without the increment allows replay, so the bump is not
  decorative.

**Scope:** this models nonce monotonicity, not ECDSA. Signature recovery, `deadline`, `spender` and
`value` matching are **not** modelled here; MUSD/OpenZeppelin implements those. Treat this as permit
semantics, not cryptography.

## 3. How to get testnet MUSD

There is no direct MUSD faucet in the flow we used. Testnet MUSD is borrowed against test BTC:

- the docs state a **minimum loan size of 1,800 MUSD of borrowed debt**;
- with the **200 MUSD gas deposit**, total debt at opening is **at least 2,000 MUSD**;
- source: <https://testnet.mezo.org/docs/users/borrow/mint-musd>.

That is why the public escrow at `0x247b…600F` has `gigCount = 0`: **the portfolio demo runs on a local\nchain**; the public-testnet path requires borrowing against test BTC. Our full lifecycle runs on a\n**local Hardhat chain** (`npx hardhat node` + `npm run demo:local`). The public-testnet path requires
borrowing against test BTC and was not funded for this submission. This is a product-demo limitation,
not a contract limitation.

## 4. What the testnet does not have: MUSD Savings Vault

The testnet MUSD Savings Vault page describes sMUSD and links a vault address
`0xb4D498029af77680cD1eF828b967f010d06C51CC` via <https://testnet.mezo.org/earn/vaults/0xb4D498029af77680cD1eF828b967f010d06C51CC>. On **Mezo Testnet
(chainId 31611) that address has no code**:

```bash
node -e "const {ethers}=require('ethers');(async()=>{const p=new ethers.JsonRpcProvider('https://rpc.test.mezo.org');const c=await p.getCode('0xb4D498029af77680cD1eF828b967f010d06C51CC');console.log('chain', (await p.getNetwork()).chainId.toString(), 'code bytes', (c.length-2)/2)})()"
# chain 31611n code bytes 0
```

So do not use that address as a testnet vault. We kept the yield adapter only as an experiment against a
mock; it is **not** part of the submitted escrow. Whether a testnet vault exists under a different
address is **unverified**; the docs address is definitely not deployed on 31611.

## 5. Friction list (things we had to guess or discover)

1. **No single machine-readable contract map.** MUSD and the escrow addresses are in different docs/UI
   places; a JSON with `{chainId, token, decimals, permit, vault}` would remove a lookup.
2. **MUSD is not faucet-able directly.** The borrow path works, but the 1,800 + 200 minimum is the first
   thing a builder needs; it deserves a one-line "testnet MUSD quickstart".
3. **The Savings Vault docs page links a mainnet-oriented address** that has no code on testnet; add an
   explicit chain/deployment column or a "not deployed on testnet" banner.
4. **Permit support is implied by ERC-20 familiarity, not shown in the token table.** We verified it via
   `DOMAIN_SEPARATOR`; a `permit: yes/no` field in the token reference would save a call.
5. **The testnet explorer hostname was not always resolvable from our environment** (we used RPC and
   Sourcify instead). If this is environment-specific, a "known RPC/explorer endpoints" line helps.
   *Unverified whether this affects other regions.*
6. **No agent/MCP examples in the docs.** A contract with a JSON-RPC/MCP example is easier to compose
   than one with only a UI; even a 20-line `eth_call` snippet would help.
7. **Error/ABI discoverability.** The verified contract is on Sourcify, but the docs do not link a
   canonical ABI/address for the escrow pattern; builders re-derive it from source.

## Reproduce

```bash
git clone https://github.com/mak777uh/mezogig && cd mezogig
npm ci
ESCROW_ADDRESS=0x247b313d0eD3C532B16c7E5f9eA760272361600F node scripts/check-musd.js
cd lean && lake env lean Escrow.lean   # exit 0, 0 sorry
```


