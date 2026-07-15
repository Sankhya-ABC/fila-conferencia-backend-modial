import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { BalancaService } from './balanca.service';
import { AtualizarBalancaDto, CriarBalancaDto, TestarConexaoDiretaDto } from './dto/balanca.dto';

@NoAuthApp()
@UseGuards(AuthUserGuard)
@ApiTags('Balanças')
@Controller('balancas')
export class BalancaController {
  constructor(private readonly service: BalancaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar balanças ativas' })
  listar() {
    return this.service.listar();
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar balança' })
  criar(@Body() dto: CriarBalancaDto) {
    return this.service.criar(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar balança' })
  atualizar(@Param('id') id: string, @Body() dto: AtualizarBalancaDto) {
    return this.service.atualizar(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover balança' })
  remover(@Param('id') id: string) {
    return this.service.remover(id);
  }

  @Get('ativas')
  @ApiOperation({ summary: 'Listar balanças ativas — payload reduzido para dropdowns' })
  listarAtivas() {
    return this.service.listarAtivas();
  }

  @Get('minhas')
  @ApiOperation({ summary: 'Listar balanças vinculadas ao usuário logado (fallback: todas as ativas)' })
  listarMinhas(@Req() req: any) {
    return this.service.listarParaUsuario(req.user.idUsuario);
  }

  @Get('portas-com')
  @ApiOperation({ summary: 'Listar portas COM disponíveis no servidor' })
  listarPortasCOM() {
    return this.service.listarPortasCOM();
  }

  @Post('testar-direto')
  @ApiOperation({ summary: 'Testar conexão serial com configuração direta (sem ID)' })
  testarConexaoDireta(@Body() dto: TestarConexaoDiretaDto) {
    return this.service.testarConexaoDireta(dto);
  }

  @Post(':id/iniciar-leitura')
  @ApiOperation({ summary: 'Iniciar leitura contínua da balança serial' })
  async iniciarLeitura(@Param('id') id: string) {
    await this.service.iniciarLeitura(id);
    return { ok: true };
  }

  @Post(':id/parar-leitura')
  @ApiOperation({ summary: 'Parar leitura contínua' })
  async pararLeitura(@Param('id') id: string) {
    await this.service.pararLeitura(id);
    return { ok: true };
  }

  @Get(':id/peso-atual')
  @ApiOperation({ summary: 'Peso atual em cache (para polling do frontend)' })
  pesoAtual(@Param('id') id: string) {
    return this.service.pesoAtual(id);
  }

  @Post(':id/simular-peso')
  @ApiOperation({ summary: 'Simular leitura (apenas dev)' })
  simularPeso(@Param('id') id: string) {
    return this.service.simularPeso(id);
  }

  @SkipThrottle()
  @Get(':id/status')
  @ApiOperation({ summary: 'Status da balança e peso atual (não lança exceção)' })
  statusBalanca(@Param('id') id: string) {
    return this.service.statusBalanca(id);
  }

  @SkipThrottle()
  @Get(':id/capturar-peso')
  @ApiOperation({ summary: 'Capturar peso único (backward compat para Separação)' })
  async capturarPeso(@Param('id') id: string) {
    const peso = await this.service.capturarPeso(id);
    return { peso };
  }
}
