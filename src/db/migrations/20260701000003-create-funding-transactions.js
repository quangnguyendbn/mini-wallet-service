'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('funding_transactions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      member_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'members', key: 'id' },
      },
      wallet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'wallets', key: 'id' },
      },
      type: { type: Sequelize.STRING, allowNull: false },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'pending' },
      amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      turnover_multiplier: { type: Sequelize.INTEGER, allowNull: true },
      psp_ref: { type: Sequelize.STRING, allowNull: true, unique: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE funding_transactions
        ADD CONSTRAINT funding_transactions_type_check
          CHECK (type IN ('deposit', 'withdrawal')),
        ADD CONSTRAINT funding_transactions_status_check
          CHECK (status IN ('pending', 'completed', 'failed')),
        ADD CONSTRAINT funding_transactions_amount_check
          CHECK (amount > 0),
        ADD CONSTRAINT funding_transactions_kind_check
          CHECK (
            (type = 'deposit' AND psp_ref IS NOT NULL AND turnover_multiplier IS NOT NULL AND turnover_multiplier >= 0)
            OR
            (type = 'withdrawal' AND psp_ref IS NULL AND turnover_multiplier IS NULL)
          );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('funding_transactions');
  },
};
