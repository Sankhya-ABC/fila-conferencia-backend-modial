import { BadRequestException, Injectable } from '@nestjs/common';
import { NumeroConferenciaFilter } from '../dto/model';
import {
  DeletarVolumesLoteParams,
  GerarVolumesLoteParams,
  PostAtualizarDimensoesVolumeParams,
} from './dto/volume.dto';
import { SessaoService } from '../sessao/sessao.service';

@Injectable()
export class VolumeService {
  constructor(private readonly sessaoService: SessaoService) {}

  private async getSessaoId(numeroConferencia: number): Promise<string> {
    const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');
    return sessao.id;
  }

  async getVolumes({ numeroConferencia }: NumeroConferenciaFilter) {
    const sessaoId = await this.getSessaoId(numeroConferencia);
    const naoDetalhada = await this.sessaoService.isCubagemNaoDetalhada(sessaoId);
    return naoDetalhada
      ? this.sessaoService.getVolumesNaoDetalhados(sessaoId)
      : this.sessaoService.getVolumesDetalhados(sessaoId);
  }

  async gerarVolumesLote({
    numeroConferencia,
    quantidadeLote,
    altura,
    largura,
    comprimento,
    peso,
  }: GerarVolumesLoteParams) {
    const sessaoId = await this.getSessaoId(numeroConferencia);
    await this.sessaoService.criarVolumesLote({
      sessaoId,
      quantidade: quantidadeLote,
      altura,
      largura,
      comprimento,
      peso,
    });
  }

  async deletarVolumesLote({
    numeroConferencia,
    altura,
    largura,
    comprimento,
    peso,
  }: DeletarVolumesLoteParams) {
    const sessaoId = await this.getSessaoId(numeroConferencia);
    await this.sessaoService.removerVolumesLote({ sessaoId, altura, largura, comprimento, peso });
  }

  async postAtualizarDimensoesVolume({
    numeroConferencia,
    numeroVolume,
    alturaAntiga,
    larguraAntiga,
    comprimentoAntigo,
    pesoAntigo,
    altura,
    largura,
    comprimento,
    peso,
    qtdVol,
  }: PostAtualizarDimensoesVolumeParams) {
    const sessaoId = await this.getSessaoId(numeroConferencia);

    if (qtdVol != null) {
      await this.sessaoService.salvarCubagemSimplificada(sessaoId, { qtdVol, altura, largura, comprimento, peso });
      return;
    }

    const naoDetalhada = await this.sessaoService.isCubagemNaoDetalhada(sessaoId);

    if (naoDetalhada) {
      await this.sessaoService.atualizarDimensoesVolumeLote({
        sessaoId,
        alturaAntiga,
        larguraAntiga,
        comprimentoAntigo,
        pesoAntigo,
        altura,
        largura,
        comprimento,
        peso,
      });
    } else {
      await this.sessaoService.atualizarDimensoesVolume({
        sessaoId,
        seqVol: numeroVolume!,
        altura,
        largura,
        comprimento,
        peso,
      });
    }
  }
}
