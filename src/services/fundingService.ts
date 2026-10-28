import { randomUUID } from 'crypto';
import { FundingTransaction, Member, Wallet } from '../db/models';
import { FundingStatus } from '../db/models/fundingTransaction';
import { memberNotFound, walletNotFound } from '../lib/errors';
import { parsePositiveMoney } from '../lib/money';

const statusLabel: Record<FundingStatus, string> = {
  pending: 'Pending',
  completed: 'Completed',
  failed: 'Failed',
};

export function fundingStatusLabel(status: FundingStatus): string {
  return statusLabel[status];
}

export async function createDeposit(input: {
  memberId: string;
  amount: string;
  turnoverMultiplier: number;
}): Promise<FundingTransaction> {
  const member = await Member.findByPk(input.memberId);
  if (!member) {
    throw memberNotFound();
  }

  const wallet = await Wallet.findOne({ where: { memberId: member.id } });
  if (!wallet) {
    throw walletNotFound();
  }

  const amount = parsePositiveMoney(input.amount);
  return FundingTransaction.create({
    memberId: member.id,
    walletId: wallet.id,
    type: 'deposit',
    status: 'pending',
    amount: amount.toFixed(18),
    turnoverMultiplier: input.turnoverMultiplier,
    pspRef: randomUUID(),
  });
}
