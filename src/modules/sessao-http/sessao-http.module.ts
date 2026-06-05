import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { SessaoHttpController } from './sessao-http.controller';
import { SessaoHttpService } from './sessao-http.service';

@Module({
  controllers: [SessaoHttpController],
  providers: [SessaoHttpService],
  imports: [PrismaModule, AuthUserModule],
})
export class SessaoHttpModule {}
