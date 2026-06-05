import { Injectable } from '@nestjs/common';

type SessionData = {
  token: string;
  nome: string;
  idUsuario: number;
};

@Injectable()
export class AuthUserService {
  private readonly HOURS = 20;
  private readonly TTL = 60 * 60 * this.HOURS;
  private sessions = new Map<number, SessionData>();

  async set(idUsuario: number, data: SessionData) {
    this.sessions.set(idUsuario, data);

    setTimeout(() => {
      this.sessions.delete(idUsuario);
    }, this.TTL * 1000);
  }

  async getByUser(idUsuario: number) {
    return this.sessions.get(idUsuario);
  }

  async getByToken(token: string) {
    for (const session of this.sessions.values()) {
      if (session.token === token) return session;
    }
    return null;
  }

  async delete(idUsuario: number) {
    this.sessions.delete(idUsuario);
  }
}
