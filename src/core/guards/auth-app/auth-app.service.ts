import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const TOKEN_CACHE_FILE = path.join(process.cwd(), '.snk-token.json');
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // renova 5 min antes de expirar

@Injectable()
export class AuthAppService {
  constructor(private config: ConfigService) {}

  private token: string | null = null;
  private tokenExpiresAt: number | null = null;

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getValidToken();
    return { Authorization: `Bearer ${token}` };
  }

  async getValidToken(): Promise<string> {
    // 1. Cache em memória
    if (this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - REFRESH_MARGIN_MS) {
      return this.token;
    }

    // 2. Cache em arquivo (sobrevive a restarts do container)
    const cached = this.readTokenCache();
    if (cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
      this.token = cached.token;
      this.tokenExpiresAt = cached.expiresAt;
      return this.token;
    }

    // 3. Autentica no Sankhya com retry
    return this.authenticateWithRetry();
  }

  private readTokenCache(): { token: string; expiresAt: number } | null {
    try {
      const raw = fs.readFileSync(TOKEN_CACHE_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private writeTokenCache(token: string, expiresAt: number) {
    try {
      fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({ token, expiresAt }), 'utf-8');
    } catch {
      // falha silenciosa — sem cache em arquivo, mas o token em memória ainda funciona
    }
  }

  private async authenticateWithRetry(attempts = 3, delayMs = 8000): Promise<string> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.authenticate();
      } catch (err: any) {
        const isLast = attempt === attempts;
        if (isLast) throw err;
        console.warn(`Sankhya auth falhou (tentativa ${attempt}/${attempts}), aguardando ${delayMs / 1000}s...`);
        await new Promise((res) => setTimeout(res, delayMs));
        delayMs *= 2; // backoff exponencial
      }
    }
    throw new InternalServerErrorException('Falha ao autenticar na API Sankhya');
  }

  private async authenticate(): Promise<string> {
    try {
      const form = new URLSearchParams();
      form.append('grant_type', 'client_credentials');
      form.append('client_id', this.config.get<string>('SNK_CLIENT_ID')!);
      form.append('client_secret', this.config.get<string>('SNK_CLIENT_SECRET')!);

      const response = await axios.post(
        `${this.config.get<string>('SNK_HOST')}/authenticate`,
        form.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Token': this.config.get<string>('SNK_X_TOKEN')!,
            Accept: 'application/json',
          },
        },
      );

      const data = response.data;

      if (!data?.access_token) {
        throw new Error('Token de acesso não retornado pela API Sankhya');
      }

      const expiresIn = data.expires_in ?? 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      this.token = data.access_token;
      this.tokenExpiresAt = expiresAt;
      this.writeTokenCache(data.access_token, expiresAt);

      return this.token!;
    } catch (error: any) {
      console.error('Erro ao autenticar Sankhya:', error?.response?.data || error.message);
      throw new InternalServerErrorException('Falha ao autenticar na API Sankhya');
    }
  }
}
