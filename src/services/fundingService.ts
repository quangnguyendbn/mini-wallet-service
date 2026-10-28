import { randomUUID } from 'crypto';
import { Transaction } from 'sequelize';
import { FundingTransaction } from '../db/models';
import { FundingStatus } from '../db/models/fundingTransaction';
import { sequelize } from '../db/sequelize';
import { conflict, depositNotFound, insufficientBalance, insufficientTurnover, memberNotFound, walletNotFound } from '../lib/errors';
import { ZERO, dec, parsePositiveMoney, sameMoney } from '../lib/money';
import { FundingTransactionRepository } from '../repositories/fundingTransactionRepository';
import { MemberRepository } from '../repositories/memberRepository';
import { WalletRepository } from '../repositories/walletRepository';
import { WalletTxRepository } from '../repositories/walletTxRepository';

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

type CreateWithdrawalInput = {
  memberId: string;
  amount: string;
};

export class FundingService {
  private static instance: FundingService | undefined;

  private constructor(
    private readonly members: MemberRepository,
    private readonly wallets: WalletRepository,
    private readonly fundingTransactions: FundingTransactionRepository,
    private readonly walletTxs: WalletTxRepository,
  ) {}

  static getInstance(): FundingService {
    FundingService.instance ??= new FundingService(
      MemberRepository.getInstance(),
      WalletRepository.getInstance(),
      FundingTransactionRepository.getInstance(),
      WalletTxRepository.getInstance(),
    );
    return FundingService.instance;
  }

  fundingStatusLabel(status: FundingStatus): string {
    return statusLabel[status];
  }

  async createDeposit(input: CreateDepositInput): Promise<FundingTransaction> {
    const member = await this.members.findById(input.memberId);
    if (!member) {
      throw memberNotFound();
    }

    const wallet = await this.wallets.findByMemberId(member.id);
    if (!wallet) {
      throw walletNotFound();
    }

    const amount = parsePositiveMoney(input.amount);
    return this.fundingTransactions.create({
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
      const deposit = await this.fundingTransactions.lockDepositByPspRef(input.pspRef, transaction);
      if (!deposit) {
        throw depositNotFound();
      }
      if (deposit.status === input.status) {
        return deposit;
      }

      this.assertCallbackApplies(deposit, input);
      if (input.status === 'failed') {
        await this.fundingTransactions.updateStatus(deposit, 'failed', transaction);
        return deposit;
      }

      await this.creditDeposit(deposit, transaction);
      return deposit;
    });
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
    const wallet = await this.wallets.lockById(deposit.walletId, transaction);
    if (!wallet) {
      throw walletNotFound();
    }

    const balance = dec(wallet.balance).plus(dec(deposit.amount)).toFixed(18);
    await this.walletTxs.create(
      {
        walletId: wallet.id,
        fundingTransactionId: deposit.id,
        type: 'deposit_credit',
        amount: deposit.amount,
      },
      transaction,
    );
    await this.wallets.updateBalance(wallet, balance, transaction);
    await this.fundingTransactions.updateStatus(deposit, 'completed', transaction);
  }

  async createWithdrawal(input: CreateWithdrawalInput): Promise<FundingTransaction> {
    const amount = parsePositiveMoney(input.amount).toFixed(18);
    return sequelize.transaction(async (transaction) => {
      const member = await this.members.findById(input.memberId, transaction);
      if (!member) {
        throw memberNotFound();
      }

      const wallet = await this.wallets.lockByMemberId(member.id, transaction);
      if (!wallet) {
        throw walletNotFound();
      }

      await this.assertTurnoverMet(member.id, wallet.id, transaction);
      if (dec(wallet.balance).lt(dec(amount))) {
        throw insufficientBalance();
      }

      const withdrawal = await this.fundingTransactions.create(
        {
          memberId: member.id,
          walletId: wallet.id,
          type: 'withdrawal',
          status: 'pending',
          amount,
          turnoverMultiplier: null,
          pspRef: null,
        },
        transaction,
      );
      await this.walletTxs.create(
        {
          walletId: wallet.id,
          fundingTransactionId: withdrawal.id,
          type: 'withdrawal_debit',
          amount,
        },
        transaction,
      );
      const balance = dec(wallet.balance).minus(dec(amount)).toFixed(18);
      await this.wallets.updateBalance(wallet, balance, transaction);
      return withdrawal;
    });
  }

  private async assertTurnoverMet(memberId: string, walletId: string, transaction: Transaction): Promise<void> {
    const required = dec(await this.fundingTransactions.sumCompletedDepositTurnover(memberId, transaction));
    const accrued = dec(await this.walletTxs.sumAmount(walletId, 'wager_debit', transaction));
    const outstanding = required.minus(accrued);
    if (outstanding.gt(ZERO)) {
      throw insufficientTurnover(outstanding.toFixed(18));
    }
  }
}

export const fundingService = FundingService.getInstance();
