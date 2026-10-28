import { QueryTypes, Transaction } from 'sequelize';
import { FundingTransaction } from '../db/models';
import { FundingStatus, FundingType } from '../db/models/fundingTransaction';
import { sequelize } from '../db/sequelize';

const SUM_COMPLETED_DEPOSIT_TURNOVER_SQL = `
  SELECT COALESCE(SUM(amount * turnover_multiplier), 0)::text AS total
  FROM funding_transactions
  WHERE member_id = $1 AND type = 'deposit' AND status = 'completed'
`;

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

  async sumCompletedDepositTurnover(memberId: string, transaction: Transaction): Promise<string> {
    const rows = await sequelize.query<{ total: string }>(SUM_COMPLETED_DEPOSIT_TURNOVER_SQL, {
      bind: [memberId],
      transaction,
      type: QueryTypes.SELECT,
    });
    return rows[0]?.total ?? '0';
  }

  updateStatus(
    deposit: FundingTransaction,
    status: FundingStatus,
    transaction: Transaction,
  ): Promise<FundingTransaction> {
    return deposit.update({ status }, { transaction });
  }
}
