import { Module } from '@nestjs/common';
import { AuthAppModule } from 'src/core/guards/auth-app/auth-app.module';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { RolesGuard } from 'src/core/guards/auth-user/roles.guard';
import { SankhyaDatasetSPClientModule } from 'src/http-client/dataset-sp/dataset-sp.module';
import { GatewayClientModule } from 'src/http-client/gateway/gateway.module';
import { UsuarioController } from './usuario.controller';
import { UsuarioService } from './usuario.service';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [UsuarioController],
  providers: [UsuarioService, RolesGuard],
  imports: [
    GatewayClientModule,
    AuthAppModule,
    AuthUserModule,
    AuthModule,
    SankhyaDatasetSPClientModule,
    PrismaModule,
  ],
})
export class UsuarioModule {}
