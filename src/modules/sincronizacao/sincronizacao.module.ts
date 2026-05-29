import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { GatewayClientModule } from 'src/http-client/gateway/gateway.module';
import { SankhyaLoadRecordsClientModule } from 'src/http-client/load-records/load-records.module';
import { SankhyaDBExplorerSPClientModule } from 'src/http-client/db-explorer-sp/db-explorer-sp.module';
import { SincronizacaoController } from './sincronizacao.controller';
import { SincronizacaoService } from './sincronizacao.service';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  controllers: [SincronizacaoController],
  providers: [SincronizacaoService],
  exports: [SincronizacaoService],
  imports: [
    GatewayClientModule,
    AuthAppModule,
    AuthUserModule,
    SankhyaLoadRecordsClientModule,
    SankhyaDBExplorerSPClientModule,
    PrismaModule,
  ],
})
export class SincronizacaoModule {}
