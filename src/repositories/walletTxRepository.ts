import { QueryTypes, Transaction } from 'sequelize';
import { WalletTx } from '../db/models';
import { WalletTxType } from '../db/models/walletTx';
import { sequelize } from '../db/sequelize';

type NewWalletTx = {
  walletId: string;
  fundingTransactionId: string | null;
  type: WalletTxType;
  amount: string;
};

const SUM_AMOUNT_SQL = `
  SELECT COALESCE(SUM(amount), 0)::text AS total
  FROM wallet_txs
  WHERE wallet_id = $1 AND type = $2
`;

export class WalletTxRepository {
  private static instance: WalletTxRepository | undefined;

  private constructor() {}

  static getInstance(): WalletTxRepository {
    WalletTxRepository.instance ??= new WalletTxRepository();
    return WalletTxRepository.instance;
  }

  async sumAmount(walletId: string, type: WalletTxType, transaction: Transaction): Promise<string> {
    const rows = await sequelize.query<{ total: string }>(SUM_AMOUNT_SQL, {
      bind: [walletId, type],
      transaction,
      type: QueryTypes.SELECT,
    });
    return rows[0]?.total ?? '0';
  }

  create(row: NewWalletTx, transaction: Transaction): Promise<WalletTx> {
    return WalletTx.create(row, { transaction });
  }
}
