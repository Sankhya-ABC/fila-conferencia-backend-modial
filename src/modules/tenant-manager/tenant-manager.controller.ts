import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { MasterGuard } from 'src/core/master/master.guard';
import { TenantManagerService } from './tenant-manager.service';
import { CriarTenantDto, AtualizarTenantDto } from './dto/tenant-manager.dto';

@NoAuthApp()
@UseGuards(MasterGuard)
@Controller('master/tenants')
export class TenantManagerController {
  constructor(private readonly service: TenantManagerService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Get(':slug')
  buscar(@Param('slug') slug: string) {
    return this.service.buscar(slug);
  }

  @Post()
  criar(@Body() dto: CriarTenantDto) {
    return this.service.criar(dto);
  }

  @Patch(':slug')
  atualizar(@Param('slug') slug: string, @Body() dto: AtualizarTenantDto) {
    return this.service.atualizar(slug, dto);
  }

  @Post(':slug/sync')
  sincronizar(@Param('slug') slug: string) {
    return this.service.sincronizar(slug);
  }
}
