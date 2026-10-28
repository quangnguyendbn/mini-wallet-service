/**
 * E2E API tests for the deposit → wager → withdrawal flow.
 *
 * Money is compared numerically, so DECIMAL scale does not matter. Contract:
 * - POST /deposits → 201 { id, pspRef, status: "Pending" }. Wallet is unchanged.
 * - POST /psp/callbacks → 2xx { status: "Completed" | "Failed" }, idempotent on retries.
 *   Unknown pspRef → 404 { error: "deposit not found" }.
 *   Wrong amount or an illegal state change → 409, and the balance does not change.
 *   A wrong amount leaves the deposit Pending so the original amount can still complete.
 * - POST /wallets/:walletId/wagers → 201.
 *   Insufficient funds → 422 { error: "insufficient_balance" }.
 * - POST /withdrawals → 201 { id, status: "Pending" } and the wallet is debited immediately.
 *   Short turnover → 422 { error: "insufficient_turnover", outstanding }.
 *   Turnover is checked before balance.
 */
import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import '../src/db/models';
import { dec } from '../src/lib/money';

const app = createApp();
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

function expectMoney(actual: string, expected: string): void {
  expect({ amount: dec(actual).toFixed(18) }).toEqual({ amount: dec(expected).toFixed(18) });
}

async function createMember(username: string) {
  const res = await request(app).post('/members').send({ username });
  expect(res.status).toBe(201);
  return {
    memberId: res.body.member.id as string,
    walletId: res.body.wallet.id as string,
  };
}

async function balanceOf(memberId: string): Promise<string> {
  const res = await request(app).get(`/members/${memberId}/wallet`);
  expect(res.status).toBe(200);
  return res.body.balance as string;
}

async function deposit(memberId: string, amount: string, turnoverMultiplier: number) {
  const res = await request(app).post('/deposits').send({ memberId, amount, turnoverMultiplier });
  expect(res.status).toBe(201);
  expect(typeof res.body.id).toBe('string');
  expect(typeof res.body.pspRef).toBe('string');
  expect(res.body.pspRef.length).toBeGreaterThan(0);
  expect(res.body.status).toBe('Pending');
  return { id: res.body.id as string, pspRef: res.body.pspRef as string };
}

async function complete(pspRef: string, amount: string) {
  const res = await request(app).post('/psp/callbacks').send({ pspRef, status: 'completed', amount });
  expect(res.status).toBeGreaterThanOrEqual(200);
  expect(res.status).toBeLessThan(300);
  return res;
}

async function credit(memberId: string, amount: string, turnoverMultiplier: number) {
  const created = await deposit(memberId, amount, turnoverMultiplier);
  await complete(created.pspRef, amount);
  return created;
}

beforeAll(async () => {
  await sequelize.authenticate();
});

beforeEach(async () => {
  await sequelize.truncate({ cascade: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('e2e baseline (implemented)', () => {
  it('GET /health reports ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('POST /members creates a member and a zero-balance wallet', async () => {
    const res = await request(app).post('/members').send({ username: 'alice01' });

    expect(res.status).toBe(201);
    expect(res.body.member.username).toBe('alice01');
    expect(res.body.wallet.balance).toBe('0.000000000000000000');

    const wallet = await request(app).get(`/members/${res.body.member.id}/wallet`);
    expect(wallet.status).toBe(200);
    expect(wallet.body).toEqual({
      id: res.body.wallet.id,
      memberId: res.body.member.id,
      balance: '0.000000000000000000',
    });
  });

  it('POST /members rejects an invalid username', async () => {
    const res = await request(app).post('/members').send({ username: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('GET /members/:memberId/wallet returns 404 when the wallet does not exist', async () => {
    const res = await request(app).get(`/members/${UNKNOWN_ID}/wallet`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'wallet not found' });
  });
});

describe('POST /deposits', () => {
  it('creates a pending deposit and does not move money', async () => {
    const { memberId } = await createMember('dep-pending');
    const first = await deposit(memberId, '100.50', 1);
    const second = await deposit(memberId, '10.00', 1);

    expect(first.id).not.toBe(second.id);
    expect(first.pspRef).not.toBe(second.pspRef);
    expectMoney(await balanceOf(memberId), '0');
  });

  it('defaults turnoverMultiplier to 1', async () => {
    const { memberId } = await createMember('dep-default');
    const created = await request(app).post('/deposits').send({ memberId, amount: '25.00' });
    expect(created.status).toBe(201);

    await complete(created.body.pspRef, '25.00');

    const withdrawal = await request(app).post('/withdrawals').send({ memberId, amount: '1.00' });
    expect(withdrawal.status).toBe(422);
    expect(withdrawal.body.error).toBe('insufficient_turnover');
    expectMoney(withdrawal.body.outstanding, '25.00');
  });

  it('rejects an invalid amount or turnover multiplier', async () => {
    const { memberId } = await createMember('dep-invalid');
    const bodies = [
      { memberId, amount: '0', turnoverMultiplier: 1 },
      { memberId, amount: '-10.00', turnoverMultiplier: 1 },
      { memberId, amount: 'abc', turnoverMultiplier: 1 },
      { memberId, amount: '10.00', turnoverMultiplier: -1 },
      { memberId, amount: '10.00', turnoverMultiplier: 1.5 },
    ];

    for (const body of bodies) {
      const res = await request(app).post('/deposits').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    }
  });

  it('rejects an unknown member', async () => {
    const res = await request(app).post('/deposits').send({
      memberId: UNKNOWN_ID,
      amount: '10.00',
      turnoverMultiplier: 1,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'member not found' });
  });
});

describe('POST /psp/callbacks', () => {
  it('does not double-credit when the same completed callback is delivered twice', async () => {
    const { memberId } = await createMember('cb-seq');
    const created = await deposit(memberId, '100.50', 1);

    const first = await complete(created.pspRef, '100.50');
    const second = await complete(created.pspRef, '100.50');

    expect(first.body.status).toBe('Completed');
    expect(second.body.status).toBe('Completed');
    expectMoney(await balanceOf(memberId), '100.50');
  });

  it('does not double-credit when the same completed callback arrives concurrently', async () => {
    const { memberId } = await createMember('cb-conc');
    const created = await deposit(memberId, '80.00', 1);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).post('/psp/callbacks').send({
          pspRef: created.pspRef,
          status: 'completed',
          amount: '80.00',
        }),
      ),
    );

    expect(results.every((res) => res.status >= 200 && res.status < 300)).toBe(true);
    expectMoney(await balanceOf(memberId), '80.00');
  });

  it('does not credit a failed payment and rejects a later completed callback', async () => {
    const { memberId } = await createMember('cb-fail');
    const created = await deposit(memberId, '60.00', 0);

    const failed = await request(app).post('/psp/callbacks').send({
      pspRef: created.pspRef,
      status: 'failed',
      amount: '60.00',
    });
    expect(failed.status).toBe(200);
    expect(failed.body.status).toBe('Failed');
    expectMoney(await balanceOf(memberId), '0');

    const retried = await request(app).post('/psp/callbacks').send({
      pspRef: created.pspRef,
      status: 'failed',
      amount: '60.00',
    });
    expect(retried.status).toBe(200);
    expectMoney(await balanceOf(memberId), '0');

    const completed = await request(app).post('/psp/callbacks').send({
      pspRef: created.pspRef,
      status: 'completed',
      amount: '60.00',
    });
    expect(completed.status).toBe(409);
    expectMoney(await balanceOf(memberId), '0');
  });

  it('rejects an unknown pspRef', async () => {
    const res = await request(app).post('/psp/callbacks').send({
      pspRef: 'missing-ref',
      status: 'completed',
      amount: '10.00',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'deposit not found' });
  });

  it('rejects a mismatched amount and still accepts the original amount afterwards', async () => {
    const { memberId } = await createMember('cb-amount');
    const created = await deposit(memberId, '100.00', 0);

    const mismatch = await request(app).post('/psp/callbacks').send({
      pspRef: created.pspRef,
      status: 'completed',
      amount: '90.00',
    });
    expect(mismatch.status).toBe(409);
    expectMoney(await balanceOf(memberId), '0');

    await complete(created.pspRef, '100.00');
    expectMoney(await balanceOf(memberId), '100.00');
  });

  it('does not credit a different member', async () => {
    const first = await createMember('cb-iso-a');
    const second = await createMember('cb-iso-b');
    await credit(first.memberId, '40.00', 0);

    expectMoney(await balanceOf(first.memberId), '40.00');
    expectMoney(await balanceOf(second.memberId), '0');
  });
});

describe('POST /wallets/:walletId/wagers', () => {
  it('debits the wallet', async () => {
    const { memberId, walletId } = await createMember('wag-ok');
    await credit(memberId, '100.00', 0);

    const res = await request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '10.00' });
    expect(res.status).toBe(201);
    expectMoney(res.body.amount, '10.00');
    expectMoney(await balanceOf(memberId), '90.00');
  });

  it('rejects a non-positive wager amount', async () => {
    const { walletId } = await createMember('wag-bad');
    const res = await request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '0' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects a wager when the balance is too low', async () => {
    const { memberId, walletId } = await createMember('wag-poor');
    const res = await request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '10.00' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'insufficient_balance' });
    expectMoney(await balanceOf(memberId), '0');
  });

  it('rejects a wager for an unknown wallet', async () => {
    const res = await request(app).post(`/wallets/${UNKNOWN_ID}/wagers`).send({ amount: '10.00' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'wallet not found' });
  });

  it('does not overdraw the wallet when wagers arrive concurrently', async () => {
    const { memberId, walletId } = await createMember('wag-conc');
    await credit(memberId, '100.00', 0);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '100.00' }),
      ),
    );

    const accepted = results.filter((res) => res.status >= 200 && res.status < 300);
    const rejected = results.filter((res) => res.status >= 400 && res.status < 500);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    expectMoney(await balanceOf(memberId), '0');
  });
});

describe('POST /withdrawals', () => {
  it('debits the wallet immediately when the turnover requirement is zero', async () => {
    const { memberId } = await createMember('wd-open');
    await credit(memberId, '80.00', 0);

    const res = await request(app).post('/withdrawals').send({ memberId, amount: '30.00' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Pending');
    expect(typeof res.body.id).toBe('string');
    expectMoney(await balanceOf(memberId), '50.00');
  });

  it('blocks withdrawal until accrued turnover covers the requirement, then debits', async () => {
    const { memberId, walletId } = await createMember('wd-lock');
    // Multiplier 0 leaves balance behind. A required wager on a multiplier-1 deposit
    // would otherwise spend the whole wallet, and there is no win/credit endpoint.
    await credit(memberId, '100.00', 0);
    await credit(memberId, '50.00', 1);
    expectMoney(await balanceOf(memberId), '150.00');

    const partial = await request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '20.00' });
    expect(partial.status).toBe(201);

    const blocked = await request(app).post('/withdrawals').send({ memberId, amount: '40.00' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error).toBe('insufficient_turnover');
    expectMoney(blocked.body.outstanding, '30.00');
    expectMoney(await balanceOf(memberId), '130.00');

    const rest = await request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '30.00' });
    expect(rest.status).toBe(201);

    const ok = await request(app).post('/withdrawals').send({ memberId, amount: '40.00' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('Pending');
    expect(typeof ok.body.id).toBe('string');
    expectMoney(await balanceOf(memberId), '60.00');
  });

  it('reports outstanding turnover before it reports insufficient balance', async () => {
    const { memberId } = await createMember('wd-order');
    await credit(memberId, '30.00', 1);

    const res = await request(app).post('/withdrawals').send({ memberId, amount: '999.00' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('insufficient_turnover');
    expectMoney(res.body.outstanding, '30.00');
    expectMoney(await balanceOf(memberId), '30.00');
  });

  it('rejects a withdrawal larger than the balance once turnover is met', async () => {
    const { memberId } = await createMember('wd-funds');
    await credit(memberId, '20.00', 0);

    const res = await request(app).post('/withdrawals').send({ memberId, amount: '50.00' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'insufficient_balance' });
    expectMoney(await balanceOf(memberId), '20.00');
  });

  it('rejects a non-positive withdrawal amount', async () => {
    const { memberId } = await createMember('wd-bad');
    const res = await request(app).post('/withdrawals').send({ memberId, amount: '0' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
