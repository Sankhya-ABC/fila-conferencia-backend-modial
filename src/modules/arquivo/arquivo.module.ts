import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { GatewayClientModule } from 'src/http-client/gateway/gateway.module';
import { SankhyaLoadRecordsClientModule } from 'src/http-client/load-records/load-records.module';
import { ArquivoController } from './arquivo.controller';
import { ArquivoService } from './arquivo.service';
import { ArquivoHelper } from './arquivo.helper';
import { ProdutoController } from './produto.controller';
import { SessaoModule } from '../sessao/sessao.module';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  controllers: [ArquivoController, ProdutoController],
  providers: [ArquivoService, ArquivoHelper],
  imports: [
    GatewayClientModule,
    AuthAppModule,
    AuthUserModule,
    SankhyaLoadRecordsClientModule,
    SessaoModule,
    PrismaModule,
  ],
})
export class ArquivoModule {}
