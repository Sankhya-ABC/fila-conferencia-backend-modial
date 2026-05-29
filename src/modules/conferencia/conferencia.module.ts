import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { GatewayClientModule } from 'src/http-client/gateway/gateway.module';
import { SankhyaLoadRecordsClientModule } from 'src/http-client/load-records/load-records.module';
import { ConferenciaController } from './conferencia.controller';
import { ConferenciaService } from './conferencia.service';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { SankhyaDatasetSPClientModule } from 'src/http-client/dataset-sp/dataset-sp.module';
import { SankhyaDBExplorerSPClientModule } from 'src/http-client/db-explorer-sp/db-explorer-sp.module';
import { ConferenciaHelper } from './conferencia.helper';
import { SessaoModule } from '../sessao/sessao.module';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  controllers: [ConferenciaController],
  providers: [ConferenciaService, ConferenciaHelper],
  exports: [ConferenciaHelper],
  imports: [
    GatewayClientModule,
    AuthAppModule,
    AuthUserModule,
    SankhyaLoadRecordsClientModule,
    SankhyaDatasetSPClientModule,
    SankhyaDBExplorerSPClientModule,
    SessaoModule,
    PrismaModule,
  ],
})
export class ConferenciaModule {}
