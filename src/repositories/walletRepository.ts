import { Transaction } from 'sequelize';
import { Wallet } from '../db/models';

export class WalletRepository {
  private static instance: WalletRepository | undefined;

  private constructor() {}

  static getInstance(): WalletRepository {
    WalletRepository.instance ??= new WalletRepository();
    return WalletRepository.instance;
  }

  findByMemberId(memberId: string, transaction?: Transaction): Promise<Wallet | null> {
    return Wallet.findOne({ where: { memberId }, transaction });
  }

  lockById(id: string, transaction: Transaction): Promise<Wallet | null> {
    return Wallet.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  }

  lockByMemberId(memberId: string, transaction: Transaction): Promise<Wallet | null> {
    return Wallet.findOne({ where: { memberId }, transaction, lock: transaction.LOCK.UPDATE });
  }

  create(memberId: string, balance: string, transaction: Transaction): Promise<Wallet> {
    return Wallet.create({ memberId, balance }, { transaction });
  }

  updateBalance(wallet: Wallet, balance: string, transaction: Transaction): Promise<Wallet> {
    return wallet.update({ balance }, { transaction });
  }
}
