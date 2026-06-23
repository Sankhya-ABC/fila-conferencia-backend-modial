import { Injectable, NestMiddleware } from '@nestjs/common';
import { AuthUserService } from 'src/core/guards/auth-user/auth-user.service';
import { TenantService } from './tenant.service';
import { tenantStorage } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly authUserService: AuthUserService,
    private readonly tenantService: TenantService,
  ) {}

  async use(req: any, _res: any, next: () => void) {
    const authHeader: string | undefined = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const session = await this.authUserService.getByToken(token);
      if (session?.tenant) {
        // Garante que o PrismaClient do tenant está inicializado antes do handler
        await this.tenantService.getClientForTenant(session.tenant);
        tenantStorage.run(session.tenant, () => next());
        return;
      }
    }
    next();
  }
}
