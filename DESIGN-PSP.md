# Designing for the 50th PSP

A junior should add a provider by writing one adapter and one config block. They should not edit the ledger, the row locks, or the deposit state machine.

```
POST /psp/:pspCode/callbacks
        │
        ▼
PspRegistry.get(pspCode)          config: secret, amount unit, status map
        │
        ▼
adapter.verify(rawBody, headers)  reject before any database write
        │
        ▼
adapter.parse(rawBody)            NormalizedCallback
        │
        ▼
FundingService.applyDepositCallback
```

Money movement only accepts this shape:

```ts
type NormalizedCallback = {
  pspRef: string;
  status: 'completed' | 'failed';
  amount: string; // major units, decimal string
};

interface PspAdapter {
  verify(rawBody: Buffer, headers: IncomingHttpHeaders): void;
  parse(rawBody: Buffer): NormalizedCallback;
}
```

`verify` owns the signature scheme. `parse` owns that provider's quirks: status words (`success`, `paid`, `ok`), amounts in minor units, and fields that arrive under another name. Both live in `src/psp/adapters/<code>.ts`. The route loads the adapter, verifies, parses, then calls the funding service. The service stays the code that already locks the funding row and credits the wallet once.

Config selects the adapter and its quirks. Secrets come from the environment, not from the file.

```yaml
psps:
  mock:
    adapter: mock
    webhookSecretEnv: PSP_MOCK_SECRET
    amountUnit: major          # minor means divide by 10^decimals
    decimals: 2
    statusMap:
      completed: completed
      failed: failed
      success: completed       # some providers
```

A new PSP is a new adapter class plus a config entry. The registry maps `pspCode` to that class. Unknown codes return 404 and do not touch a wallet.

CI does not call the provider. Each adapter ships fixtures: the raw body, the headers, and the `NormalizedCallback` we expect. The test signs the body with the test secret, checks that `verify` accepts it and rejects a bad signature, then checks that `parse` matches the fixture. Captured production payloads, with secrets removed, become extra fixtures when a provider misbehaves. Idempotency and concurrency stay tests of `applyDepositCallback` against the normalized event, so a new PSP cannot weaken those guarantees.
