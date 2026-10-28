import { Member, Wallet } from '../db/models';
import { sequelize } from '../db/sequelize';

// Convention: any operation touching more than one row runs inside a single
// DB transaction. Keep this pattern for everything you add.
export class MemberService {
  async createMember(username: string): Promise<{ member: Member; wallet: Wallet }> {
    return sequelize.transaction(async (transaction) => {
      const member = await Member.create({ username }, { transaction });
      const wallet = await Wallet.create({ memberId: member.id, balance: '0' }, { transaction });
      return { member, wallet };
    });
  }

  async getWalletByMemberId(memberId: string): Promise<Wallet | null> {
    return Wallet.findOne({ where: { memberId } });
  }
}

export const memberService = new MemberService();
