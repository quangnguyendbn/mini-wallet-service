# Mini Wallet Service

Backend Lead take-home. The task is described in [`CHALLENGE.md`](CHALLENGE.md).

## Done so far

Deposits, wagers, and withdrawals are implemented.

- `POST /deposits` creates a `Pending` funding row and a `pspRef`. The wallet balance does not change.
- `POST /psp/callbacks` locks that funding row, then the wallet. A matching `completed` callback credits the wallet once and writes one `deposit_credit` ledger row. A repeated callback does not credit again. A mismatched amount stays `Pending` and returns `409`. The same terminal status again returns `200`. An illegal status change returns `409`. An unknown `pspRef` returns `404`.
- `POST /wallets/:walletId/wagers` locks the wallet, writes a `wager_debit`, and rejects an overdraw.
- `POST /withdrawals` checks turnover before balance. A shortfall returns `422` with `outstanding`. A valid withdrawal debits the wallet immediately and stays `Pending`.
- `funding_transactions` stores deposits and withdrawals. `wallet_txs` is the ledger. Amounts are positive; the row type is the direction. `wallets.balance` is the signed sum of that ledger, updated in the same transaction. `funding_transaction_id` is unique, so one funding row cannot be credited twice.
- Turnover is `SUM(amount * turnover_multiplier)` of completed deposits against `SUM(amount)` of `wager_debit` rows, computed inside the wallet lock.
- Money is parsed and compared with `BigNumber`. `100.50` and `100.500` are the same amount.
- HTTP statuses live in `src/constants/httpCode.ts`, grouped by response class. Business failures go through `HttpError`.
- `MemberService`, `FundingService`, and `WagerService` are singletons. Sequelize queries sit in `src/repositories/`. Routes are mounted from `src/routes/index.ts`.

## Notes

- Trade-offs, locking, the amount-mismatch rule, and what comes next: [`DECISIONS.md`](DECISIONS.md).
- How a second PSP would plug in: [`DESIGN-PSP.md`](DESIGN-PSP.md). The callback route still accepts one mock body.

## Steps

`test/wallet-flow.e2e.test.ts` is the contract. Each step was built on the one before it.

1. **Foundation.** `src/lib/money.ts` parses a positive decimal and compares amounts with `BigNumber`. `src/lib/errors.ts` carries business errors. `src/app.ts` maps those to JSON. `ZodError` stays `400` with `error: "validation_error"`.
2. **Schema.** `funding_transactions` holds deposits and withdrawals. `wallet_txs` is the ledger: positive amounts, direction in `type`, unique nullable `funding_transaction_id`. Stored status is lowercase. JSON uses `Pending`, `Completed`, and `Failed`.
3. **Deposit.** `POST /deposits` returns `201` `{ id, pspRef, status: "Pending" }`. `pspRef` is `crypto.randomUUID()`. No wallet update and no ledger row. An unknown member returns `404`. A bad amount or multiplier returns `400`.
4. **PSP callback.** `POST /psp/callbacks` locks the funding row, then the wallet. A matching `completed` callback credits once. `failed` writes no credit. The same terminal status again is `200`. The opposite terminal status is `409`. A mismatched amount is `409` and the deposit stays `pending`.
5. **Wager.** `POST /wallets/:walletId/wagers` locks the wallet, writes a `wager_debit`, and returns `201`. Too little balance is `422` `insufficient_balance`. An unknown wallet is `404`. Ten concurrent wagers of `100` against a balance of `100` accept one request.
6. **Withdrawal.** `POST /withdrawals` checks turnover, then balance. A shortfall is `422` `insufficient_turnover` with `outstanding`. A valid withdrawal returns `201` `{ id, status: "Pending" }` and debits immediately. Approval is not built. `DESIGN-PSP.md` describes the adapter a second PSP would use.

## Stack

TypeScript, Express, Sequelize, PostgreSQL, Jest. Money is `DECIMAL(36,18)` in Postgres, strings in JS/JSON, and all arithmetic goes through `bignumber.js` (see `src/lib/money.ts`).

## Setup

Requires Node 20+ and Docker.

```bash
cp .env.example .env
npm install
npm run db:up        # starts Postgres on localhost:5439 (dev + test databases)
npm run db:migrate   # migrates the dev database
npm test             # migrates the test database and runs the test suite
npm run dev          # starts the API on :3000
```

If port 5439 clashes with something on your machine, change it in `docker-compose.yml` and `.env`.

## Layout

```
.
├── src/
│   ├── app.ts           # express app factory
│   ├── index.ts         # entrypoint
│   ├── config.ts
│   ├── constants/       # HTTP_CODE and other shared constants
│   ├── lib/money.ts     # BigNumber helpers - use these for all money math
│   ├── db/
│   │   ├── sequelize.ts
│   │   ├── cli-config.js
│   │   ├── migrations/
│   │   └── models/
│   ├── repositories/    # Sequelize access
│   ├── routes/          # mounted from routes/index.ts
│   └── services/        # singleton services
├── test/
├── CHALLENGE.md         # original brief
├── DECISIONS.md         # locking, schema, turnover, next steps
└── DESIGN-PSP.md        # second PSP adapter, not implemented
```

## Conventions to keep

- Money never touches JS `number`. Strings at the boundaries, BigNumber in between.
- Any operation writing more than one row runs in a single DB transaction (see `MemberService.createMember`).
- Routes validate input with zod and delegate to services; business logic lives in services, not routes.
- New tables are created via migrations, not `sync()`.
