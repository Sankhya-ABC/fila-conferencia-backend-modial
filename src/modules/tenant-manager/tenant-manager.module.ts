import { Module } from '@nestjs/common';
import { TenantManagerController } from './tenant-manager.controller';
import { TenantManagerService } from './tenant-manager.service';
import { SincronizacaoModule } from '../sincronizacao/sincronizacao.module';

@Module({
  imports: [SincronizacaoModule],
  controllers: [TenantManagerController],
  providers: [TenantManagerService],
})
export class TenantManagerModule {}
