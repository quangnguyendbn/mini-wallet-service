import BigNumber from 'bignumber.js';

// Money invariants for this codebase:
// - Money is stored as DECIMAL(36,18) in Postgres and travels as strings in JS/JSON.
// - All arithmetic on money MUST go through BigNumber. Never use JS number math on money.
BigNumber.config({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_DOWN });

export function dec(value: string | number | BigNumber): BigNumber {
  const bn = new BigNumber(value);
  if (!bn.isFinite()) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return bn;
}

export const ZERO = dec(0);

// DECIMAL(36,18): at most 18 digits before the point and 18 after it.
const POSITIVE_MONEY = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/;

export function parsePositiveMoney(value: string): BigNumber {
  if (!POSITIVE_MONEY.test(value)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  const amount = dec(value);
  if (!amount.gt(ZERO)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return amount;
}

export function sameMoney(left: string, right: string): boolean {
  return dec(left).eq(dec(right));
}
