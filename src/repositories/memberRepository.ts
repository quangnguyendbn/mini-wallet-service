import { Transaction } from 'sequelize';
import { Member } from '../db/models';

export class MemberRepository {
  private static instance: MemberRepository | undefined;

  private constructor() {}

  static getInstance(): MemberRepository {
    MemberRepository.instance ??= new MemberRepository();
    return MemberRepository.instance;
  }

  findById(id: string, transaction?: Transaction): Promise<Member | null> {
    return Member.findByPk(id, { transaction });
  }

  create(username: string, transaction: Transaction): Promise<Member> {
    return Member.create({ username }, { transaction });
  }
}
