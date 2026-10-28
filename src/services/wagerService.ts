import { Transaction } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { insufficientBalance, walletNotFound } from '../lib/errors';
import { dec, parsePositiveMoney } from '../lib/money';
import { WalletRepository } from '../repositories/walletRepository';
import { WalletTxRepository } from '../repositories/walletTxRepository';

export class WagerService {
  private static instance: WagerService | undefined;

  private constructor(
    private readonly wallets: WalletRepository,
    private readonly walletTxs: WalletTxRepository,
  ) {}

  static getInstance(): WagerService {
    WagerService.instance ??= new WagerService(WalletRepository.getInstance(), WalletTxRepository.getInstance());
    return WagerService.instance;
  }

  async placeWager(walletId: string, amount: string): Promise<{ amount: string }> {
    const wager = parsePositiveMoney(amount);
    return sequelize.transaction(async (transaction) => this.debit(walletId, wager.toFixed(18), transaction));
  }

  private async debit(
    walletId: string,
    amount: string,
    transaction: Transaction,
  ): Promise<{ amount: string }> {
    const wallet = await this.wallets.lockById(walletId, transaction);
    if (!wallet) {
      throw walletNotFound();
    }
    if (dec(wallet.balance).lt(dec(amount))) {
      throw insufficientBalance();
    }

    const balance = dec(wallet.balance).minus(dec(amount)).toFixed(18);
    await this.walletTxs.create(
      {
        walletId: wallet.id,
        fundingTransactionId: null,
        type: 'wager_debit',
        amount,
      },
      transaction,
    );
    await this.wallets.updateBalance(wallet, balance, transaction);
    return { amount };
  }
}

export const wagerService = WagerService.getInstance();
