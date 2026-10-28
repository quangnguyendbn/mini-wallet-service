# Decisions

Money correctness comes first. Auth, deployment, and Docker hardening are out of scope for this exercise.

## Locking

A completed PSP callback locks the funding row with `SELECT … FOR UPDATE`, then locks the wallet. The order is always funding row, then wallet. The second concurrent callback blocks on the funding row, sees `completed`, and returns without a second credit. A unique `wallet_txs.funding_transaction_id` is the backstop: Postgres rejects a second ledger row for the same funding transaction even if the application check is wrong.

Wagers and withdrawals lock only the wallet. They do not lock a funding row first, so they cannot deadlock with a callback that already holds one. Two wagers on the same wallet queue on that row. The second reads the balance the first committed.

## Callback amount

The callback amount must equal the deposit amount. `100.50` and `100.500` match, compared with `BigNumber`. A different amount returns `409` and leaves the deposit `pending`, so a corrected retry can still complete it. The PSP does not get to choose a different credit.

The same terminal status again (`completed` then `completed`, or `failed` then `failed`) returns `200` and does not write another ledger row. The opposite terminal status returns `409` and does not move money. An unknown `pspRef` returns `404`.

## Schema

Deposits and withdrawals share `funding_transactions`. A deposit requires `psp_ref` and `turnover_multiplier`. A withdrawal leaves both null. Status in the database is lowercase. JSON uses `Pending`, `Completed`, and `Failed`.

`wallet_txs` is the ledger. Amounts are always positive. Direction is the row type: `deposit_credit`, `wager_debit`, `withdrawal_debit`. The wallet balance is the signed sum of that ledger. `wallets.balance` is a read cache updated in the same transaction as the ledger row.

Turnover is not stored as a counter. Inside the transaction that holds the wallet lock, required turnover is `SUM(amount * turnover_multiplier)` over completed deposits, and accrued turnover is `SUM(amount)` over `wager_debit` rows. The check runs before the balance check. A shortfall returns `422` with `outstanding`. Cached counters are a later optimization if that `SUM` becomes hot.

## What I would do next

Money first. Auth, Docker, and a queue do not fix a wrong balance.

### Money

- Revoke `UPDATE` and `DELETE` on `wallet_txs`. Append-only is an application rule today.
- Require an idempotency key on `POST /withdrawals`. A retry of a successful withdrawal currently debits again, because a withdrawal has no `pspRef` to reject the duplicate.
- Reconcile `wallets.balance` against the signed ledger and alert when they differ. The e2e test checks one flow. Production needs a job.
- Approve or reject a pending withdrawal. Approval completes it. Rejection writes a `withdrawal_credit` in the same transaction as the status change. The original debit stays.
- Update the balance in SQL (`balance = balance + amount`) inside the transaction that already holds the wallet lock.

### PSP

- Build the adapter registry in `DESIGN-PSP.md`: `verify`, then `parse`, then `FundingService`. The callback route still accepts one mock body.
- Keep the raw body for the signature. `express.json()` parses the body first, so an adapter cannot verify a signature today.
- Reject a callback that is too old, or whose signature was already used, before it reaches the state machine.

### Turnover

- Index the two `SUM` queries: completed deposits by member, and `wager_debit` rows by wallet.
- If those sums get hot, keep a counter updated in the same transaction as the ledger row. The counter is a cache. The ledger stays the source of truth.

### Outside this exercise

- Authenticate the caller and check that the wallet belongs to that member. `GET` wallet is open today.
- Log and count `amount_mismatch`, `illegal_transition`, and duplicate callbacks. Do not log a PSP secret.

## AI use

Human-in-the-loop. AI handled analysis and acceleration. Technical ownership stays with me.

```
AI
 ↓
Explore multiple solutions
 ↓
Trade-off analysis
 ↓
Developer / Tech Lead
 ↓
Architecture Decision
 ↓
AI-assisted implementation
 ↓
AI-assisted validation
 ↓
Human approval
```

I chose the architecture after that trade-off pass: lock the funding row before the wallet, leave a mismatched callback amount pending, and compute turnover with `SUM` inside the wallet lock. I also set the structure: HTTP status constants, singleton services, repositories, the route index, and the turnover SQL as named constants. AI then implemented the deposit, callback, wager, and withdrawal flow, and drafted `DESIGN-PSP.md` and this file. Validation is `test/wallet-flow.e2e.test.ts`. I approved each step before the next one was built.
