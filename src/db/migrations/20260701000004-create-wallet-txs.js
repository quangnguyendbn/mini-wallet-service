'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('wallet_txs', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      wallet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'wallets', key: 'id' },
      },
      funding_transaction_id: {
        type: Sequelize.UUID,
        allowNull: true,
        unique: true,
        references: { model: 'funding_transactions', key: 'id' },
      },
      type: { type: Sequelize.STRING, allowNull: false },
      amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE wallet_txs
        ADD CONSTRAINT wallet_txs_type_check
          CHECK (type IN ('deposit_credit', 'wager_debit', 'withdrawal_debit')),
        ADD CONSTRAINT wallet_txs_amount_check
          CHECK (amount > 0);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('wallet_txs');
  },
};
