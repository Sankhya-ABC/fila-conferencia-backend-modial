import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthUserModule } from 'src/core/guards/auth-user/auth-user.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  imports: [PrismaModule, AuthUserModule],
})
export class DashboardModule {}
