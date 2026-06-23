import { Global, Module } from '@nestjs/common';
import { MasterAuthService } from './master-auth.service';
import { MasterGuard } from './master.guard';

@Global()
@Module({
  providers: [MasterAuthService, MasterGuard],
  exports: [MasterAuthService, MasterGuard],
})
export class MasterModule {}
