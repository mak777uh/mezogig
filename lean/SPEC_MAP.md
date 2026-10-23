# SPEC_MAP — Lean theorem ↔ Solidity function ↔ JS test

Цель: показать, что каждое утверждение модели соответствует реальной функции контракта и
проверяется тестом на Solidity-коде. Ссылки на тесты — по именам `it(...)` и строкам
`test/*.js`.

| Что доказано в Lean | Функция Solidity | Тест, который проверяет то же на реальном коде |
|---|---|---|
| `Inv` / `inv_of_reachable`: `total milestones = funded` и `paidOut + refunded + remaining = funded` сохраняются всеми переходами | `createGig`/`_create`, `approveMilestone`, `claimMilestone`, `refundExpired`, `openDispute`, `resolveDispute`, `confirmCancel` | `MezoGigEscrow.test.js` — «cannot pay out more than the deposit (invariant across all milestones)» (L407), «fuzz: random amounts and random terminal paths never overpay» (L725); `Guards.test.js` — «lockedAmount tracks pending + submitted + disputed» (L84) |
| `no_money_creation`: `paidOut + refunded ≤ funded` | все выплатные пути (`approveMilestone`, `claimMilestone`, `refundExpired`, `resolveDispute`, `confirmCancel`) | `MezoGigEscrow.test.js` L407 и L725; в L407 после трёх выплат `paidOut == total`, `refunded == 0`, баланс контракта `0` |
| `budget_complete`: `Σ milestone.amount = funded` | `createGig` → `_validate`/`_create` (депозит ровно суммы) | `MezoGigEscrow.test.js` — «deposits the full sum and stores milestones» (L96, `gig.funded == total`) |
| `paid_not_pending_or_submitted`: `Paid` не проходит предусловие release | `approveMilestone` / `claimMilestone` (требуют `Submitted`), `openDispute` (нельзя на `Paid`) | `Guards.test.js` — «blocks actions on a completed gig» (L61), «a disputed milestone is frozen» (L98); `MezoGigEscrow.test.js` — «rejects double claim…» (L456), «cannot dispute a paid milestone» (L634) |
| `release_pays_exactly`: выплата = ровно `m.amount` | `approveMilestone`, `claimMilestone` (`amount = m.amount; paidOut += amount`) | `MezoGigEscrow.test.js` L407–L418: после трёх approve `paidOut == total`; события `MilestoneApproved`/`MilestoneClaimed` с `amount` |
| `release_pays_at_most_remaining`: выплата ограничена бюджетом (`m.amount ≤ remaining`) | те же + проверка инварианта баланса | `MezoGigEscrow.test.js` L407; `Guards.test.js` L84 (locked amount) |
| `dispute_split_correct`: `a + b = amount`, где `a = amount*bps/10000`, `b = amount-a` | `resolveDispute` (`toFreelancer = amount * freelancerBps / 10_000; toClient = amount - toFreelancer`) | `MezoGigEscrow.test.js` — «splits the milestone between both parties and settles exactly once» (L581, bps=3333), «supports 0% and 100% splits without paying twice» (L607), «fuzz: dispute splits never exceed the milestone amount» (L790) |
| `split_zero` / `split_full`: bps=0 → всё клиенту, bps=10000 → всё фрилансеру | `resolveDispute` при `freelancerBps=0`/`10000` | `MezoGigEscrow.test.js` L607–L621: при 0 `refunded == amount`, при 10000 `paidOut += amount` |
| `split_le_amount`: `a ≤ amount` при `bps ≤ 10000` | `resolveDispute` + `BadBps` при `bps > 10000` | `MezoGigEscrow.test.js` — «rejects out-of-range basis points» (L624, `10001` → `BadBps`); fuzz L790 |
| `bps_over_10000_breaks`: без `bps ≤ 10000` формула может дать `a > amount` (контрпример 10000/10001) | предусловие `if (freelancerBps > 10_000) revert BadBps()` | `MezoGigEscrow.test.js` L624–L631 |
| `resolve_inv`: resolve списывает ровно `amount`, `paidOut += a`, `refunded += b`, бюджет сохраняется | `resolveDispute` (settle + `_settleIfComplete`) | `MezoGigEscrow.test.js` L581–L599 (paidOut/refunded/status Resolved), L607–L621 |
| `refund_inv`: refund списывает ровно `m.amount`, `refunded += amount` | `refundExpired` | `MezoGigEscrow.test.js` — «refunds a milestone that missed its deadline» (L481), «rejects a refund of a submitted or paid milestone» (L506), «completes the gig when every milestone ends refunded» (L527) |
| `dispute_inv`: openDispute не меняет counters, disputed остаётся в `remaining` | `openDispute` (`status = Disputed`, без выплат) | `Guards.test.js` L84–L91: lockedAmount остаётся полной после submit и openDispute; L98 «a disputed milestone is frozen» |
| `floor_split_no_gain`: `Σ (total/n) ≤ total` | нет прямой функции в контракте; это свойство клиентского `splitAmount` (равные части) | `AgentConsole.test.js` — «splits an amount into equal milestone parts with exact total» (L21). Тест проверяет exact total на UI-разбиении; в Lean — более слабая/общая floor-граница `≤` |
| `ceil_split_breaks`: ceiling-разбиение `10/3` даёт `4+4+4=12 > 10` | контрпример к наивному округлению вверх; в контракте деление идёт вниз (`/`) | отдельного JS-теста нет — это отрицательный тест модели, доказывающий, что инвариант 4 не пустой |

## Важные оговорки

- `remaining` в Lean считается по `credit`: `Pending + Submitted + Disputed` (disputed ещё в
  бюджете, пока арбитр не resolved). Это совпадает с `lockedAmount` в `Guards.test.js` L84:
  locked = pending + submitted + disputed.
- Lean-модель не верифицирует байткод, `uint128`-overflow, токен-переводы, time/deadline и
  reentrancy. Это model-level спецификация арифметики и статусов.
- Тесты — Solidity/Hardhat; они проверяют поведение контракта, а не компиляцию Lean. Связка
  «теорема ↔ функция ↔ тест» показывает, что модельные утверждения не оторваны от кода.

## Asset assumptions and EIP-2612 permit

| Что доказано в Lean | Функция/слой Solidity | Тест / проверка |
|---|---|---|
| `AssetAssumptions.no_fee_preserves_budget`: при `credited = nominalFunded` инвариант счёта совпадает с номинальным бюджетом | MUSD ERC-20 `transferFrom` в `createGig` / `fundGig`; стандартный ERC-20 без fee | `MezoGigEscrow.test.js` L96 (депозит ровно суммы); отдельного fee-теста нет — допущение явно в docstring |
| `fee_on_transfer_breaks_budget`: nominal 100, credited 95 → `paidOut+refunded+remaining=95≠100` | гипотетический fee-on-transfer токен (не MUSD) | контрпример в Lean; в JS не тестируется, потому что контракт рассчитан на MUSD |
| `fee_shortfall`: любой положительный fee даёт недобор относительно номинала | то же | Lean-теорема; граница модели |
| `rebasing_breaks_locked`: при `delta ≠ 0` фактический баланс ≠ учтённый | гипотетический rebasing-токен (не MUSD) | Lean-наблюдение; `lockedAmount` в `Guards.test.js` L84 проверяет только не-rebasing MUSD |
| `PermitModel.nonce_strictly_increases`: успешный permit увеличивает nonce ровно на 1 | `MezoGigEscrow.createGigWithPermit` → `IERC20PermitLike.permit` у MUSD | `MezoGigEscrow.test.js` — «supports EIP-2612 permit creation without a separate approve» (L227), `nonce` читается из `musd.nonces` (L251) |
| `PermitModel.no_replay` / `no_replay_reachable`: та же подпись `(owner, nonce)` не проходит второй раз | `permit` EIP-2612 (nonce в подписи; повторный вызов с тем же nonce невозможен) | тот же тест L227–L266; «tolerates a permit that was front-run when allowance already exists» (L268) — отдельный сценарий |
| `PermitModel.no_increment_allows_replay`: модель без инкремента nonce допускает повтор | контрпример к наивной реализации permit | Lean-контрпример; доказывает, что инкремент не декоративный |

**Оговорка:** EIP-2612-модель — семантика nonce, не ECDSA. Она не проверяет подпись, deadline,
spender/value; это делает MUSD/OpenZeppelin `ERC20Permit`.

