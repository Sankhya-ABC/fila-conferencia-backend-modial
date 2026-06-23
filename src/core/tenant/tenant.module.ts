import { Global, Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantMiddleware } from './tenant.middleware';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';

@Global()
@Module({
  imports: [AuthUserModule],
  providers: [TenantService, TenantMiddleware],
  exports: [TenantService, TenantMiddleware],
})
export class TenantModule {}
