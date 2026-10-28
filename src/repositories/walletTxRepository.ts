import { Transaction } from 'sequelize';
import { WalletTx } from '../db/models';
import { WalletTxType } from '../db/models/walletTx';

type NewWalletTx = {
  walletId: string;
  fundingTransactionId: string | null;
  type: WalletTxType;
  amount: string;
};

export class WalletTxRepository {
  private static instance: WalletTxRepository | undefined;

  private constructor() {}

  static getInstance(): WalletTxRepository {
    WalletTxRepository.instance ??= new WalletTxRepository();
    return WalletTxRepository.instance;
  }

  create(row: NewWalletTx, transaction: Transaction): Promise<WalletTx> {
    return WalletTx.create(row, { transaction });
  }
}
