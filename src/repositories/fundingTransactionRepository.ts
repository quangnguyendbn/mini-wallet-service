import { Transaction } from 'sequelize';
import { FundingTransaction } from '../db/models';
import { FundingStatus, FundingType } from '../db/models/fundingTransaction';

type NewFundingTransaction = {
  memberId: string;
  walletId: string;
  type: FundingType;
  status: FundingStatus;
  amount: string;
  turnoverMultiplier: number | null;
  pspRef: string | null;
};

export class FundingTransactionRepository {
  private static instance: FundingTransactionRepository | undefined;

  private constructor() {}

  static getInstance(): FundingTransactionRepository {
    FundingTransactionRepository.instance ??= new FundingTransactionRepository();
    return FundingTransactionRepository.instance;
  }

  create(row: NewFundingTransaction, transaction?: Transaction): Promise<FundingTransaction> {
    return FundingTransaction.create(row, { transaction });
  }

  lockDepositByPspRef(pspRef: string, transaction: Transaction): Promise<FundingTransaction | null> {
    return FundingTransaction.findOne({
      where: { pspRef, type: 'deposit' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  updateStatus(
    deposit: FundingTransaction,
    status: FundingStatus,
    transaction: Transaction,
  ): Promise<FundingTransaction> {
    return deposit.update({ status }, { transaction });
  }
}
