import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { GatewayClientModule } from 'src/http-client/gateway/gateway.module';
import { VolumeController } from './volume.controller';
import { VolumeService } from './volume.service';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { SessaoModule } from '../sessao/sessao.module';

@Module({
  controllers: [VolumeController],
  providers: [VolumeService],
  imports: [
    GatewayClientModule,
    AuthAppModule,
    AuthUserModule,
    SessaoModule,
  ],
})
export class VolumeModule {}
