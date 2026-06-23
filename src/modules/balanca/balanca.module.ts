import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { BalancaController } from './balanca.controller';
import { BalancaService } from './balanca.service';

@Module({
  controllers: [BalancaController],
  providers: [BalancaService],
  imports: [AuthAppModule, AuthUserModule],
})
export class BalancaModule {}
