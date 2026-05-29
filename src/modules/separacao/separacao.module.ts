import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { GatewayClientModule } from 'src/http-client/gateway/gateway.module';
import { SeparacaoController } from './separacao.controller';
import { SeparacaoService } from './separacao.service';
import { SessaoModule } from '../sessao/sessao.module';
import { ConferenciaModule } from '../conferencia/conferencia.module';

@Module({
  controllers: [SeparacaoController],
  providers: [SeparacaoService],
  imports: [
    GatewayClientModule,
    AuthAppModule,
    AuthUserModule,
    SessaoModule,
    ConferenciaModule,
  ],
})
export class SeparacaoModule {}
