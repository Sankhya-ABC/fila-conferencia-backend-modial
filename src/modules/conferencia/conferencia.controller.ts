import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FaturarNotaDto } from './dto/conferencia.dto';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { ConferenciaService } from './conferencia.service';
import {
  FilaConferenciaFilter,
  IniciarConferenciaBody,
  ConcluirEtapaBody,
  FinalizarConferenciaBody,
  LiberarCorteBody,
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
  postFinalizarConferencia(@Body() body: FinalizarConferenciaBody, @Req() req: any) {
    return this.service.postFinalizarConferencia(body, req.user.idUsuario);
  }

  @Get('etapas')
  @ApiOperation({ summary: 'Consulta status das etapas (pesável/não-pesável) da conferência parcial' })
  getEtapas(@Query() query: NumeroUnicoFilter) {
    return this.service.getEtapas(query);
  }

  @Post('concluir-etapa')
  @ApiOperation({ summary: 'Conclui a etapa pesável ou não-pesável da conferência parcial' })
  postConcluirEtapa(@Body() body: ConcluirEtapaBody, @Req() req: any) {
    return this.service.postConcluirEtapa(body, req.user.idUsuario);
  }

  @Post('excluir-sessao')
  @ApiOperation({ summary: 'Excluir sessão local e cancelar conferência no Sankhya' })
  excluirSessao(@Body() body: NumeroUnicoFilter) {
    return this.service.excluirSessao(body);
  }

  @Get('tops-faturamento')
  @ApiOperation({ summary: 'Listar TOPs disponíveis para faturamento' })
  getTopsParaFaturamento(@Query('tipmov') tipmov: string) {
    return this.service.getTopsParaFaturamento(tipmov ?? 'V');
  }

  @Post('faturar')
  @ApiOperation({ summary: 'Faturar nota via SelecaoDocumentoSP.faturar' })
  faturarNota(@Body() dto: FaturarNotaDto) {
    return this.service.faturarNota(dto.nunota, dto.codTipOper, dto.serie ?? '1');
  }

  @Get('liberacoes-pendentes')
  @ApiOperation({ summary: 'Lista os itens de liberação de corte pendentes de uma conferência' })
  getLiberacoesPendentes(@Query() query: NumeroConferenciaFilter) {
    return this.service.getLiberacoesPendentes(query);
  }

  @Post('liberar-corte')
  @ApiOperation({ summary: 'Libera ou nega o corte pendente de uma conferência (tela Liberação de Corte)' })
  postLiberarCorte(@Body() body: LiberarCorteBody) {
    return this.service.postLiberarCorte(body);
  }
}
