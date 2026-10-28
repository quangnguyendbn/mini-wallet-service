# Mini Wallet Service

Backend Lead take-home. The task is described in [`CHALLENGE.md`](CHALLENGE.md).

## Done so far

Deposits can be created and completed. Wagers and withdrawals are not built yet.

- `POST /deposits` creates a `Pending` funding row and a `pspRef`. The wallet balance does not change.
- `POST /psp/callbacks` locks that funding row, then the wallet. A matching `completed` callback credits the wallet once and writes one `deposit_credit` ledger row. A repeated callback does not credit again. A mismatched amount stays `Pending`. An illegal status change returns `409`.
- `funding_transactions` stores deposits and withdrawals. `wallet_txs` is the append-only ledger. `funding_transaction_id` is unique, so one funding row cannot be credited twice.
- Money is parsed and compared with `BigNumber`. `100.50` and `100.500` are the same amount.
- HTTP statuses live in `src/constants/httpCode.ts`, grouped by response class. Business failures go through `HttpError`.
- `MemberService` and `FundingService` are singletons. Sequelize queries sit in `src/repositories/`.

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
src/
├── app.ts               # express app factory
├── index.ts             # entrypoint
├── config.ts
├── constants/           # HTTP_CODE and other shared constants
├── lib/money.ts         # BigNumber helpers - use these for all money math
├── db/
│   ├── sequelize.ts
│   ├── cli-config.js    # sequelize-cli config (used by npm run db:migrate)
│   ├── migrations/
│   └── models/
├── repositories/        # Sequelize access
├── routes/
└── services/            # singleton services
test/
```

## Conventions to keep

- Money never touches JS `number`. Strings at the boundaries, BigNumber in between.
- Any operation writing more than one row runs in a single DB transaction (see `MemberService.createMember`).
- Routes validate input with zod and delegate to services; business logic lives in services, not routes.
- New tables are created via migrations, not `sync()`.
