import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { SincronizacaoService } from './sincronizacao.service';

@UseGuards(AuthUserGuard)
@ApiTags('Sincronizacões')
@Controller('sincronizacoes')
export class SincronizacaoController {
  constructor(private readonly service: SincronizacaoService) {}

  @Get()
  @ApiOperation({ summary: 'Sincronizar Usuários' })
  getSincronizacaos() {
    return this.service.popularUsuarios();
  }

  @Get('tipo-operacao')
  @ApiOperation({ summary: 'Sincronizar Tipo Operação' })
  getSincronizacaoTipoOperacao() {
    return this.service.popularTipoOperacao();
  }

  @Get('produtos')
  @ApiOperation({ summary: 'Sincronizar cache de produtos e códigos de barras' })
  sincronizarProdutos() {
    return this.service.sincronizarProdutos();
  }

  @Get('diagnostico-imagem')
  @ApiOperation({ summary: 'Diagnóstico: ver resposta raw do Sankhya para campo IMAGEM' })
  diagnosticoImagem(@Query('codprod', new ParseIntPipe({ optional: true })) codprod?: number) {
    return this.service.diagnosticoImagem(codprod);
  }
}
