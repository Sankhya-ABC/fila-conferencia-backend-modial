import { Global, Module } from '@nestjs/common';
import { InflightService } from './inflight.service';

@Global()
@Module({
  providers: [InflightService],
  exports: [InflightService],
})
export class InflightModule {}
