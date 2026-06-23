import { Injectable } from '@nestjs/common';
import { RedisService } from 'src/core/redis/redis.service';

export type MasterSession = {
  token: string;
  id: string;
  nome: string;
  email: string;
};

const TTL = 60 * 60 * 20; // 20 horas
const key = (token: string) => `sess:master:${token}`;

@Injectable()
export class MasterAuthService {
  constructor(private readonly redis: RedisService) {}

  async set(session: MasterSession) {
    await this.redis.set(key(session.token), session, TTL);
  }

  async getByToken(token: string): Promise<MasterSession | undefined> {
    return (await this.redis.get<MasterSession>(key(token))) ?? undefined;
  }

  async delete(token: string) {
    await this.redis.del(key(token));
  }
}
