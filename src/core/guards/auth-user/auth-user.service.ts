import { Injectable } from '@nestjs/common';
import { RedisService } from 'src/core/redis/redis.service';

export type SessionData = {
  token: string;
  nome: string;
  idUsuario: number;
  tenant: string;
  perfil: string;
};

const TTL = 60 * 60 * 20; // 20 horas
const keyToken = (token: string) => `sess:token:${token}`;
const keyUid   = (uid: number)   => `sess:uid:${uid}`;

@Injectable()
export class AuthUserService {
  constructor(private readonly redis: RedisService) {}

  async set(idUsuario: number, data: SessionData) {
    await Promise.all([
      this.redis.set(keyToken(data.token), data, TTL),
      this.redis.set(keyUid(idUsuario), data.token, TTL),
    ]);
  }

  async getByUser(idUsuario: number): Promise<SessionData | null> {
    const token = await this.redis.get<string>(keyUid(idUsuario));
    if (!token) return null;
    return this.redis.get<SessionData>(keyToken(token));
  }

  async getByToken(token: string): Promise<SessionData | null> {
    return this.redis.get<SessionData>(keyToken(token));
  }

  async delete(idUsuario: number) {
    const token = await this.redis.get<string>(keyUid(idUsuario));
    const toDelete = [keyUid(idUsuario)];
    if (token) toDelete.push(keyToken(token));
    await this.redis.del(...toDelete);
  }

  async deleteByToken(token: string) {
    const session = await this.getByToken(token);
    if (session) {
      await this.delete(session.idUsuario);
    } else {
      await this.redis.del(keyToken(token));
    }
  }
}
