import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { SessaoService } from './sessao.service';

@Module({
  imports: [PrismaModule],
  providers: [SessaoService],
  exports: [SessaoService],
})
export class SessaoModule {}
