import { randomUUID } from 'crypto';
import { Transaction } from 'sequelize';
import { FundingTransaction, Member, Wallet, WalletTx } from '../db/models';
import { FundingStatus } from '../db/models/fundingTransaction';
import { sequelize } from '../db/sequelize';
import { conflict, depositNotFound, memberNotFound, walletNotFound } from '../lib/errors';
import { dec, parsePositiveMoney, sameMoney } from '../lib/money';

const statusLabel: Record<FundingStatus, string> = {
  pending: 'Pending',
  completed: 'Completed',
  failed: 'Failed',
};

type DepositCallback = {
  pspRef: string;
  status: 'completed' | 'failed';
  amount: string;
};

type CreateDepositInput = {
  memberId: string;
  amount: string;
  turnoverMultiplier: number;
};

export class FundingService {
  fundingStatusLabel(status: FundingStatus): string {
    return statusLabel[status];
  }

  async createDeposit(input: CreateDepositInput): Promise<FundingTransaction> {
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

  async applyDepositCallback(input: DepositCallback): Promise<FundingTransaction> {
    return sequelize.transaction(async (transaction) => {
      const deposit = await this.lockDeposit(input.pspRef, transaction);
      if (deposit.status === input.status) {
        return deposit;
      }

      this.assertCallbackApplies(deposit, input);
      if (input.status === 'failed') {
        await deposit.update({ status: 'failed' }, { transaction });
        return deposit;
      }

      await this.creditDeposit(deposit, transaction);
      return deposit;
    });
  }

  private async lockDeposit(pspRef: string, transaction: Transaction): Promise<FundingTransaction> {
    const deposit = await FundingTransaction.findOne({
      where: { pspRef, type: 'deposit' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!deposit) {
      throw depositNotFound();
    }
    return deposit;
  }

  private assertCallbackApplies(deposit: FundingTransaction, input: DepositCallback): void {
    if (deposit.status !== 'pending') {
      throw conflict('illegal_transition');
    }
    if (!sameMoney(deposit.amount, input.amount)) {
      throw conflict('amount_mismatch');
    }
  }

  private async creditDeposit(deposit: FundingTransaction, transaction: Transaction): Promise<void> {
    const wallet = await Wallet.findByPk(deposit.walletId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!wallet) {
      throw walletNotFound();
    }

    const balance = dec(wallet.balance).plus(dec(deposit.amount)).toFixed(18);
    await WalletTx.create(
      {
        walletId: wallet.id,
        fundingTransactionId: deposit.id,
        type: 'deposit_credit',
        amount: deposit.amount,
      },
      { transaction },
    );
    await wallet.update({ balance }, { transaction });
    await deposit.update({ status: 'completed' }, { transaction });
  }
}

export const fundingService = new FundingService();
