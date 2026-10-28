import { DataTypes, Model, Sequelize } from 'sequelize';

export type WalletTxType = 'deposit_credit' | 'wager_debit' | 'withdrawal_debit';

// Append-only. Balance changes are new rows; existing rows are not updated or deleted.
export class WalletTx extends Model {
  declare id: string;
  declare walletId: string;
  declare fundingTransactionId: string | null;
  declare type: WalletTxType;
  declare amount: string;
}

export function initWalletTx(sequelize: Sequelize): void {
  WalletTx.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      walletId: { type: DataTypes.UUID, allowNull: false },
      fundingTransactionId: { type: DataTypes.UUID, allowNull: true, unique: true },
      type: { type: DataTypes.STRING, allowNull: false },
      amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    },
    { sequelize, tableName: 'wallet_txs', underscored: true },
  );
}
