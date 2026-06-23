import { Module } from '@nestjs/common';
import { RedisModule } from 'src/core/redis/redis.module';
import { AuthUserService } from './auth-user.service';

@Module({
  imports: [RedisModule],
  providers: [AuthUserService],
  exports: [AuthUserService],
})
export class AuthUserModule {}
