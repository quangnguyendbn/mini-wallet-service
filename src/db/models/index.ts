import { sequelize } from '../sequelize';
import { FundingTransaction, initFundingTransaction } from './fundingTransaction';
import { Member, initMember } from './member';
import { Wallet, initWallet } from './wallet';
import { WalletTx, initWalletTx } from './walletTx';

initMember(sequelize);
initWallet(sequelize);
initFundingTransaction(sequelize);
initWalletTx(sequelize);

Member.hasOne(Wallet, { foreignKey: 'memberId', as: 'wallet' });
Wallet.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });

Member.hasMany(FundingTransaction, { foreignKey: 'memberId', as: 'fundingTransactions' });
FundingTransaction.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
Wallet.hasMany(FundingTransaction, { foreignKey: 'walletId', as: 'fundingTransactions' });
FundingTransaction.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });

Wallet.hasMany(WalletTx, { foreignKey: 'walletId', as: 'walletTxs' });
WalletTx.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });
FundingTransaction.hasOne(WalletTx, { foreignKey: 'fundingTransactionId', as: 'walletTx' });
WalletTx.belongsTo(FundingTransaction, { foreignKey: 'fundingTransactionId', as: 'fundingTransaction' });

export { FundingTransaction, Member, Wallet, WalletTx };
