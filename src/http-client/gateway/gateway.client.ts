import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, {
  AxiosHeaders,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { AuthAppService } from 'src/core/guards/auth-app/auth-app.service';

@Injectable()
export class GatewayClient {
  public readonly client: AxiosInstance;

  constructor(
    config: ConfigService,
    private authAppService: AuthAppService,
  ) {
    this.client = axios.create({
      baseURL: `${config.getOrThrow('SNK_HOST')}/${config.getOrThrow('SNK_GATEWAY')}`,
      timeout: 30000,
    });

    this.client.interceptors.request.use(
      async (req: InternalAxiosRequestConfig) => {
        const token = await this.authAppService.getValidToken();

        req.headers = new AxiosHeaders(req.headers);
        req.headers.set('Authorization', `Bearer ${token}`);
        req.headers.set('Content-Type', 'application/json');

        // console.log('--- SANKHYA REQUEST ---');
        // console.log('URL:', `${req.baseURL}${req.url}`);
        // console.log('BODY:', JSON.stringify(req.data));
        // console.log('----------------------');

        return req;
      },
    );

    this.client.interceptors.response.use(
      (res) => res,
      (error) => {
        // console.error('--- SANKHYA ERROR ---');
        // console.error('STATUS:', error?.response?.status);
        // console.error('RESPONSE:', error?.response?.data);
        // console.error('---------------------');
        return Promise.reject(error);
      },
    );
  }
}
