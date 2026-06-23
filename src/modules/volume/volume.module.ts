import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { GatewayClientModule } from 'src/http-client/gateway/gateway.module';
import { VolumeController } from './volume.controller';
import { VolumeService } from './volume.service';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { SessaoModule } from '../sessao/sessao.module';
import { SankhyaDatasetSPClientModule } from 'src/http-client/dataset-sp/dataset-sp.module';
import { TenantModule } from 'src/core/tenant/tenant.module';

@Module({
  controllers: [VolumeController],
  providers: [VolumeService],
  imports: [
    GatewayClientModule,
    AuthAppModule,
    AuthUserModule,
    SessaoModule,
    SankhyaDatasetSPClientModule,
    TenantModule,
  ],
})
export class VolumeModule {}
