import { Member, Wallet } from '../db/models';
import { sequelize } from '../db/sequelize';
import { MemberRepository } from '../repositories/memberRepository';
import { WalletRepository } from '../repositories/walletRepository';

// Convention: any operation touching more than one row runs inside a single
// DB transaction. Keep this pattern for everything you add.
export class MemberService {
  private static instance: MemberService | undefined;

  private constructor(
    private readonly members: MemberRepository,
    private readonly wallets: WalletRepository,
  ) {}

  static getInstance(): MemberService {
    MemberService.instance ??= new MemberService(MemberRepository.getInstance(), WalletRepository.getInstance());
    return MemberService.instance;
  }

  async createMember(username: string): Promise<{ member: Member; wallet: Wallet }> {
    return sequelize.transaction(async (transaction) => {
      const member = await this.members.create(username, transaction);
      const wallet = await this.wallets.create(member.id, '0', transaction);
      return { member, wallet };
    });
  }

  getWalletByMemberId(memberId: string): Promise<Wallet | null> {
    return this.wallets.findByMemberId(memberId);
  }
}

export const memberService = MemberService.getInstance();
