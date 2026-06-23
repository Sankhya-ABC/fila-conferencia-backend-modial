import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';
import { tenantStorage } from 'src/core/tenant/tenant.context';
import { TenantService } from 'src/core/tenant/tenant.service';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

@Injectable()
export class AuthAppService {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();
  private readonly logger = new Logger(AuthAppService.name);

  constructor(private readonly tenantService: TenantService) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getValidToken();
    return { Authorization: `Bearer ${token}` };
  }

  async getValidToken(): Promise<string> {
    const slug = tenantStorage.getStore();
    if (!slug) throw new InternalServerErrorException('Sem contexto de tenant para auth Sankhya');

    const cached = this.cache.get(slug);
    if (cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
      return cached.token;
    }

    return this.authenticateWithRetry(slug);
  }

  private async authenticateWithRetry(slug: string, attempts = 3, delayMs = 8000): Promise<string> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.authenticate(slug);
      } catch (err: any) {
        if (attempt === attempts) throw err;
        this.logger.warn(`Sankhya auth falhou para "${slug}" (tentativa ${attempt}/${attempts}), aguardando ${delayMs / 1000}s...`);
        await new Promise((res) => setTimeout(res, delayMs));
        delayMs *= 2;
      }
    }
    throw new InternalServerErrorException('Falha ao autenticar na API Sankhya');
  }

  private async authenticate(slug: string): Promise<string> {
    try {
      const cfg = await this.tenantService.getConfig(slug);

      const form = new URLSearchParams();
      form.append('grant_type', 'client_credentials');
      form.append('client_id', cfg.snkClientId);
      form.append('client_secret', cfg.snkClientSecret);

      const response = await axios.post(
        `${cfg.snkHost}/authenticate`,
        form.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Token': cfg.snkXToken,
            Accept: 'application/json',
          },
        },
      );

      const data = response.data;
      if (!data?.access_token) {
        throw new Error('Token de acesso não retornado pela API Sankhya');
      }

      const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      this.cache.set(slug, { token: data.access_token, expiresAt });

      return data.access_token;
    } catch (error: any) {
      this.logger.error(`Erro ao autenticar Sankhya para tenant "${slug}"`, error?.message);
      throw new InternalServerErrorException('Falha ao autenticar na API Sankhya');
    }
  }
}
