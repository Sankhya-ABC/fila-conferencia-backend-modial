import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { NumeroConferenciaFilter, NumeroUnicoFilter } from '../dto/model';
import {
  GravarPesoItemBody,
  MoverItemVolumeParams,
  PostDevolverItemConferido,
  PostItemConferidoVolume,
  PostRemoverVolumeParams,
  ResolverCodigoBarrasDto,
} from './dto/separacao.dto';
import { SeparacaoService } from './separacao.service';

@NoAuthApp()
@UseGuards(AuthUserGuard)
@ApiTags('Separacoes')
@Controller('separacoes')
export class SeparacaoController {
  constructor(private readonly service: SeparacaoService) {}

  @Post('item-conferido-volume')
  @ApiOperation({ summary: 'Iniciar Conferência de um Pedido' })
  postItemConferidoVolume(
    @Body()
    body: PostItemConferidoVolume,
  ) {
    return this.service.postItemConferidoVolume(body);
  }

  @Post('remover-volume')
  @ApiOperation({ summary: 'Remover Volume' })
  postRemoverVolume(
    @Body()
    body: PostRemoverVolumeParams,
  ) {
    return this.service.postRemoverVolume(body);
  }

  @Post('mover-item-volume')
  @ApiOperation({ summary: 'Mover item entre volumes' })
  postMoverItemVolume(@Body() body: MoverItemVolumeParams) {
    return this.service.postMoverItemVolume(body);
  }

  @Post('devolver-item-conferido')
  postDevolverItemConferido(@Body() body: PostDevolverItemConferido) {
    return this.service.postDevolverItemConferido(body);
  }

  @Get('itens-pedidos')
  @ApiOperation({ summary: 'Listar Itens Pedidos' })
  getItensPedido(@Query() queryParam: NumeroUnicoFilter) {
    return this.service.getItensPedido(queryParam);
  }

  @Get('imagens-itens')
  @ApiOperation({ summary: 'Imagens dos itens — lazy load separado dos itens' })
  getImagensItens(@Query() queryParam: NumeroUnicoFilter) {
    return this.service.getImagensItens(queryParam);
  }

  @Get('itens-conferidos')
  @ApiOperation({ summary: 'Listar Itens Conferidos' })
  getItensConferidos(@Query() queryParam: NumeroConferenciaFilter) {
    return this.service.getItensConferidos(queryParam);
  }

  @Patch('item-peso')
  @ApiOperation({ summary: 'Grava PESOBRUTO/PESOLIQ no TGFITE para produto pesável (AD_PESAVEL=S)' })
  patchItemPeso(@Body() body: GravarPesoItemBody) {
    return this.service.gravarPesoItem(body);
  }

  @Post('resolver-codigo-barras')
  @ApiOperation({ summary: 'Resolve código de barras para produto + unidade + controle' })
  resolverCodigoBarras(@Body() body: ResolverCodigoBarrasDto) {
    return this.service.resolverCodigoBarras(body);
  }
}
