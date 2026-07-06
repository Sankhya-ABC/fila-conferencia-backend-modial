import { BadRequestException, Injectable } from '@nestjs/common';
import { NumeroConferenciaFilter, NumeroUnicoFilter } from '../dto/model';
import {
  MoverItemVolumeParams,
  PostDevolverItemConferido,
  PostItemConferidoVolume,
  PostRemoverVolumeParams,
  ResolverCodigoBarrasDto,
} from './dto/separacao.dto';
import { SessaoService } from '../sessao/sessao.service';
import { ConferenciaHelper } from '../conferencia/conferencia.helper';

@Injectable()
export class SeparacaoService {
  constructor(
    private readonly sessaoService: SessaoService,
    private readonly conferenciaHelper: ConferenciaHelper,
  ) {}

  async postItemConferidoVolume({
    numeroConferencia,
    numeroVolume,
    idProduto,
    controle,
    quantidadePadrao,
    unidade,
    peso,
  }: PostItemConferidoVolume) {
    const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');

    await this.sessaoService.registrarLeitura({
      sessaoId: sessao.id,
      seqVol: numeroVolume,
      idProduto,
      unidade,
      controle: controle?.trim() || ' ',
      qtd: quantidadePadrao,
      qtdVolpad: quantidadePadrao,
      peso,
    });
  }

  async postRemoverVolume({ numeroConferencia, numeroVolume }: PostRemoverVolumeParams) {
    const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');
    await this.sessaoService.removerVolume(sessao.id, numeroVolume);
  }

  async postMoverItemVolume({ numeroConferencia, idProduto, controle, seqVolOrigem, seqVolDestino, qtd }: MoverItemVolumeParams) {
    const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');
    await this.sessaoService.moverItemVolume(sessao.id, idProduto, controle, seqVolOrigem, seqVolDestino, qtd);
  }

  async postDevolverItemConferido({
    numeroConferencia,
    idProduto,
    controle,
  }: PostDevolverItemConferido) {
    const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');
    await this.sessaoService.devolverItem(sessao.id, idProduto, controle);
  }

  async getImagensItens({ numeroUnico }: NumeroUnicoFilter) {
    const sessao = await this.sessaoService.buscarPorNota(numeroUnico);
    if (!sessao) return [];
    return this.sessaoService.getImagensItens(sessao.id);
  }

  async getItensPedido({ numeroUnico }: NumeroUnicoFilter) {
    const sessao = await this.sessaoService.buscarPorNota(numeroUnico);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');
    return this.sessaoService.getItensPedido(sessao.id);
  }

  async getItensConferidos({ numeroConferencia }: NumeroConferenciaFilter) {
    const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');
    return this.sessaoService.getItensConferidos(sessao.id);
  }

  async resolverCodigoBarras({ numeroConferencia, codigoBarras }: ResolverCodigoBarrasDto) {
    const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');

    // Auto-refresh: sessões antigas criadas antes do carregamento de EST
    const jaCarregou = await this.sessaoService.jaCarregouCodigos(sessao.id);
    if (!jaCarregou) {
      const codigos = await this.conferenciaHelper.carregarCodigosBarras(
        sessao.numeroUnico,
        sessao.buscarCodigoBarraPor,
      );
      await this.sessaoService.refreshCodigos(sessao.id, codigos);
    }

    const resultado = await this.sessaoService.resolverCodigoBarras(sessao.id, codigoBarras);
    if (!resultado) throw new BadRequestException('Código de barras não encontrado nos itens desta conferência.');
    return resultado;
  }
}
