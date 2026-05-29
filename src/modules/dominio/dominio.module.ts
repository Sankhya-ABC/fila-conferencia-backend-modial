import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { GatewayClientModule } from 'src/http-client/gateway/gateway.module';
import { SankhyaLoadRecordsClientModule } from 'src/http-client/load-records/load-records.module';
import { DominioController } from './dominio.controller';
import { DominioService } from './dominio.service';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';

@Module({
  controllers: [DominioController],
  providers: [DominioService],
  imports: [
    GatewayClientModule,
    AuthAppModule,
    AuthUserModule,
    SankhyaLoadRecordsClientModule,
  ],
})
export class DominioModule {}
