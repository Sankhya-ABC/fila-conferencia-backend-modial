import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(AuthUserGuard)
@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('produtividade')
  getProdutividade(
    @Query('periodo') periodo = 'hoje',
    @Query('idUsuario') idUsuario?: string,
    @Query('idUsuarioTimeline') idUsuarioTimeline?: string,
  ) {
    return this.service.getProdutividade({
      periodo: (periodo as any) || 'hoje',
      idUsuario: idUsuario || null,
      idUsuarioTimeline: idUsuarioTimeline ? Number(idUsuarioTimeline) : null,
    });
  }
}
