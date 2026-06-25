import { Global, Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantMigratorService } from './tenant-migrator.service';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';

@Global()
@Module({
  imports: [AuthUserModule],
  providers: [TenantService, TenantMiddleware, TenantMigratorService],
  exports: [TenantService, TenantMiddleware],
})
export class TenantModule {}
