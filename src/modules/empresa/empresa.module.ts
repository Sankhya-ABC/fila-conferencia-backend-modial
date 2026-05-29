import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { SankhyaLoadRecordsClientModule } from 'src/http-client/load-records/load-records.module';
import { GatewayClientModule } from 'src/http-client/gateway/gateway.module';
import { EmpresaController } from './empresa.controller';
import { EmpresaService } from './empresa.service';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';

@Module({
  controllers: [EmpresaController],
  providers: [EmpresaService],
  imports: [
    GatewayClientModule,
    AuthAppModule,
    AuthUserModule,
    SankhyaLoadRecordsClientModule,
  ],
})
export class EmpresaModule {}
