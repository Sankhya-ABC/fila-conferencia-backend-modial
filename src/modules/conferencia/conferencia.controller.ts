import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { ConferenciaService } from './conferencia.service';
import {
  FilaConferenciaFilter,
  IniciarConferenciaBody,
} from './dto/conferencia.dto';
import { NumeroConferenciaFilter, NumeroUnicoFilter } from '../dto/model';

@UseGuards(AuthUserGuard)
@ApiTags('Conferências')
@Controller('conferencias')
export class ConferenciaController {
  constructor(private readonly service: ConferenciaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas Filas de Conferências com Filtro' })
  @ApiQuery({ type: FilaConferenciaFilter })
  getFilaConferencias(@Query() queryParams: FilaConferenciaFilter) {
    return this.service.getFilaConferencias(queryParams);
  }

  @Get('dados-basicos')
  @ApiOperation({ summary: 'Dados Básicos do Pedido' })
  getDadosBasicos(@Query() queryParam: NumeroUnicoFilter) {
    return this.service.getDadosBasicos(queryParam);
  }

  // Endpoint leve: só bate no banco local, sem Sankhya.
  // Usado pelo frontend para polling durante carregamento da sessão em background.
  @NoAuthApp()
  @Get('sessao-pronta')
  @ApiOperation({ summary: 'Verifica se a sessão local está pronta (sem Sankhya)' })
  getSessaoPronta(@Query() queryParam: NumeroUnicoFilter) {
    return this.service.getSessaoPronta(queryParam);
  }

  @Post('iniciar-conferencia')
  @ApiOperation({ summary: 'Iniciar Conferência de um Pedido' })
  postIniciarConferencia(@Body() body: IniciarConferenciaBody) {
    return this.service.postIniciarConferencia(body);
  }

  @Post('finalizar-conferencia')
  postFinalizarConferencia(@Body() body: NumeroConferenciaFilter) {
    return this.service.postFinalizarConferencia(body);
  }

  @Post('excluir-sessao')
  @ApiOperation({ summary: 'Excluir sessão local e cancelar conferência no Sankhya' })
  excluirSessao(@Body() body: NumeroUnicoFilter) {
    return this.service.excluirSessao(body);
  }
}
