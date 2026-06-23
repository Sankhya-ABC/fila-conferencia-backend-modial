import { Injectable } from '@nestjs/common';
import axios, { AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { AuthAppService } from 'src/core/guards/auth-app/auth-app.service';
import { tenantStorage } from 'src/core/tenant/tenant.context';
import { TenantService } from 'src/core/tenant/tenant.service';

@Injectable()
export class GatewayClient {
  public readonly client: AxiosInstance;

  constructor(
    private readonly tenantService: TenantService,
    private readonly authAppService: AuthAppService,
  ) {
    this.client = axios.create({
      timeout: 30000,
      // Reutiliza conexões TCP — evita handshake a cada chamada ao Sankhya
      httpAgent:  new http.Agent({ keepAlive: true, maxSockets: 50 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
    });

    this.client.interceptors.request.use(
      async (req: InternalAxiosRequestConfig) => {
        const slug = tenantStorage.getStore()!;
        const cfg = await this.tenantService.getConfig(slug);
        const token = await this.authAppService.getValidToken();

        req.baseURL = `${cfg.snkHost}/${cfg.snkGateway}`;
        req.headers = new AxiosHeaders(req.headers);
        req.headers.set('Authorization', `Bearer ${token}`);
        req.headers.set('Content-Type', 'application/json');

        return req;
      },
    );

    this.client.interceptors.response.use(
      (res) => res,
      (error) => Promise.reject(error),
    );
  }
}
