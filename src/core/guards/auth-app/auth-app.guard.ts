import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthAppService } from './auth-app.service';
import { NO_AUTH_APP_KEY } from './no-auth-app.decorator';
import { tenantStorage } from 'src/core/tenant/tenant.context';

@Injectable()
export class AuthAppGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authAppService: AuthAppService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const noAuthApp = this.reflector.getAllAndOverride<boolean>(
      NO_AUTH_APP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (noAuthApp) return true;

    // Sem tenant no contexto = sessão inválida ou ausente.
    // Deixa o AuthUserGuard rejeitar com 401.
    if (!tenantStorage.getStore()) return true;

    await this.authAppService.getAuthHeaders();

    return true;
  }
}
