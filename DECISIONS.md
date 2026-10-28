# Decisions

`test/wallet-flow.e2e.test.ts` is the contract. That file stays as written. Each section below is implemented only after the previous one matches its tests.

Auth, deployment, and Docker hardening stay out. The readme does not score them.

## 1. Foundation

Update `src/lib/money.ts` and `src/app.ts`. Add `src/lib/errors.ts`.

`money.ts` gains a parser for a positive decimal string and a `BigNumber` equality check. `100.50` and `100.500` are the same amount. Arithmetic stays on `BigNumber`. Route inputs stay strings.

`errors.ts` holds business errors that carry an HTTP status. `app.ts` maps those errors to JSON. `ZodError` still returns `400` with `error: "validation_error"`.

## 2. Schema

Add two migrations and two models. Update `src/db/models/index.ts`.

`funding_transactions` stores deposits and withdrawals.

| Column | Meaning |
|---|---|
| `id` | UUID |
| `member_id`, `wallet_id` | Owner |
| `type` | `deposit` or `withdrawal` |
| `status` | `pending`, `completed`, `failed` |
| `amount` | `DECIMAL(36,18)`, the amount the member asked for |
| `turnover_multiplier` | Deposits only. Default 1 |
| `psp_ref` | Unique. Deposits only |

`wallet_txs` is an append-only ledger.

| Column | Meaning |
|---|---|
| `wallet_id` | Wallet whose balance changed |
| `funding_transaction_id` | Unique, nullable. Set for deposits and withdrawals. Null for wagers |
| `type` | `deposit_credit`, `wager_debit`, `withdrawal_debit` |
| `amount` | Always positive. Direction comes from `type` |

`wallets.balance` stays a read cache. It is updated in the same transaction as the ledger row, and the new balance equals the ledger sum. The unique `funding_transaction_id` makes a second credit for one deposit impossible.

Stored status values are lowercase. JSON responses use `Pending`, `Completed`, and `Failed`, which is what the tests assert. Callback requests send `completed` or `failed`.

## 3. Deposit

Add `src/routes/deposits.ts` and `src/services/fundingService.ts`. Mount the route in `app.ts`.

`POST /deposits` returns `201` and `{ id, pspRef, status: "Pending" }`. `pspRef` is `crypto.randomUUID()`. No wallet update and no ledger row.

`turnoverMultiplier` defaults to `1`. An unknown member returns `404` `{ error: "member not found" }`. A non-positive amount, or a multiplier that is not an integer ≥ 0, returns `400`.

## 4. PSP callback

Add `src/routes/psp.ts`. The transition lives in `fundingService`.

Lock the funding row with `SELECT … FOR UPDATE`, then lock the wallet. Lock order is always funding row, then wallet.

| Incoming state | Result |
|---|---|
| `pending` + `completed`, amount matches | One credit, status `completed`, response `2xx` and `Completed` |
| `pending` + `failed` | Status `failed`, no credit, response `200` and `Failed` |
| Same terminal status again | `2xx`, no second ledger row |
| `completed` then `failed`, or `failed` then `completed` | `409`, balance unchanged |
| Unknown `pspRef` | `404` `{ error: "deposit not found" }` |
| Amount differs | `409`, deposit stays `pending`, balance unchanged. A later callback with the original amount can still complete |

A mismatched amount does not move money and does not change state. The PSP does not get to choose a different credit. A corrected retry can still finish the original deposit.

## 5. Wager

Add `src/routes/wagers.ts` and `src/services/wagerService.ts`.

`POST /wallets/:walletId/wagers` locks the wallet. Enough balance returns `201` with `amount`, writes a `wager_debit`, and decreases `wallets.balance`. Too little balance returns `422` `{ error: "insufficient_balance" }`. An unknown wallet returns `404` `{ error: "wallet not found" }`.

Ten concurrent wagers of `100` against a balance of `100` accept one request. The balance ends at `0`.

## 6. Withdrawal and notes

Add `src/routes/withdrawals.ts`. Turnover and the debit live in `fundingService`. `DESIGN-PSP.md` is written at the repo root when this section is implemented.

Check turnover first, then balance.

- Required = sum of `amount × turnoverMultiplier` over `completed` deposits.
- Accrued = sum of `wager_debit` amounts.
- Short turnover returns `422` `{ error: "insufficient_turnover", outstanding }`.
- Turnover met but balance short returns `422` `{ error: "insufficient_balance" }`.
- A valid withdrawal returns `201` `{ id, status: "Pending" }`, debits the wallet immediately, writes a ledger row, and inserts a `pending` withdrawal. Approval is not built.

Turnover is computed with `SUM` inside the transaction that holds the wallet lock. Cached counters are a later optimization if volume requires them.

`DESIGN-PSP.md` describes a `PspAdapter` with `verify` and `parse`, producing a normalized event: `pspRef`, `completed | failed`, and a decimal string amount. The route verifies and normalizes, then calls the funding service. Per-PSP config holds the secret, the status map, and the amount unit. CI uses signed payload fixtures. It does not call a live PSP.

## AI use

The plan, the locking and amount-mismatch choices, and this file were drafted with Cursor Grok. The implementation that follows is reviewed against `wallet-flow.e2e.test.ts` and the readme.
