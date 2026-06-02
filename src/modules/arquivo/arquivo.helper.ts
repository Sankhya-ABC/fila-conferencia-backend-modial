import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { SankhyaLoadRecordsClient } from 'src/http-client/load-records/load-records.client';
import { NumeroConferenciaFilter } from '../dto/model';
import { CacheItem } from './dto/arquivo.model';
import { SessaoService } from '../sessao/sessao.service';

@Injectable()
export class ArquivoHelper {
  private imagemCache = new Map<number, CacheItem>();

  constructor(
    private readonly loadRecords: SankhyaLoadRecordsClient,
    private readonly sessaoService: SessaoService,
    private readonly prisma: PrismaService,
  ) {}

  async isCubagemNaoDetalhada({ numeroConferencia }: NumeroConferenciaFilter) {
    try {
      const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
      if (!sessao) return false;
      return this.sessaoService.isCubagemNaoDetalhada(sessao.id);
    } catch {
      throw new BadRequestException('Erro ao obter informações da conferência.');
    }
  }

  async obterImagemProduto(idProduto: number) {
    const cache = this.imagemCache.get(idProduto);
    if (cache && cache.expiresAt > Date.now()) {
      return cache.value;
    }

    const raw = await this.loadRecords.loadRecords({
      rootEntity: 'Produto',
      fieldset: 'IMAGEM',
      criteria: {
        expression: 'CODPROD = ?',
        parameters: [{ value: idProduto, type: 'I' }],
      },
      limit: 1,
    });

    const rows = this.loadRecords.parseEntities(raw);
    let imagem = rows[0]?.IMAGEM ?? null;

    if (imagem) {
      imagem = Buffer.from(imagem, 'hex').toString('base64');
    }

    const MINUTOS = 60 * 3;
    this.imagemCache.set(idProduto, {
      value: imagem,
      expiresAt: Date.now() + 1000 * 60 * MINUTOS,
    });

    return imagem;
  }

  // ─── Cubagem não detalhada (volumes com dimensões) ─────────────────────────
  // Reconstruída a partir do banco local + LoadRecords para info da nota

  async obterCubagemNaoDetalhada({ numeroConferencia }: NumeroConferenciaFilter) {
    try {
      const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
      if (!sessao) return [];

      const volumesComDim = await this.prisma.sessaoVolume.findMany({
        where: {
          sessaoId: sessao.id,
          OR: [
            { altura: { not: null } },
            { largura: { not: null } },
            { comprimento: { not: null } },
            { peso: { not: null } },
          ],
        },
        orderBy: { seqVol: 'asc' },
        select: { seqVol: true },
      });

      const notaInfo = await this.carregarInfoNota(sessao.numeroUnico);

      // Novo fluxo simplificado: grupos enviados direto ao Sankhya (sem SessaoVolume).
      // Usa qtdVol da sessão para gerar o número correto de etiquetas.
      if (!volumesComDim.length) {
        const qtdVol = sessao.qtdVol ?? 0;
        if (!qtdVol) return [];
        return Array.from({ length: qtdVol }, (_, i) => ({
          seqVol: i + 1,
          ...notaInfo,
        }));
      }

      return volumesComDim.map((v) => ({
        seqVol: v.seqVol,
        ...notaInfo,
      }));
    } catch {
      throw new BadRequestException('Erro ao obter informações da cubagem não detalhada.');
    }
  }

  // ─── Cubagem detalhada (volumes com leituras) ──────────────────────────────

  async obterCubagemDetalhada({ numeroConferencia }: NumeroConferenciaFilter) {
    try {
      const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
      if (!sessao) return [];

      // seqVols distintos que possuem leituras com qtd > 0 (banco local)
      const leiturasAgrupadas = await this.prisma.sessaoLeitura.groupBy({
        by: ['seqVol'],
        where: { sessaoId: sessao.id, qtd: { gt: 0 } },
        orderBy: { seqVol: 'asc' },
      });

      if (!leiturasAgrupadas.length) return [];

      const notaInfo = await this.carregarInfoNota(sessao.numeroUnico);

      return leiturasAgrupadas.map((l) => ({
        seqVol: l.seqVol,
        ...notaInfo,
      }));
    } catch {
      throw new BadRequestException('Erro ao obter informações da cubagem detalhada.');
    }
  }

  // ─── Carrega info da nota via LoadRecords ──────────────────────────────────

  private async carregarInfoNota(numeroUnico: number) {
    const raw = await this.loadRecords.loadRecords({
      rootEntity: 'CabecalhoNota',
      fieldset: 'NUNOTA,AD_NUMTALAO,CODPARC',
      criteria: {
        expression: 'NUNOTA = ?',
        parameters: [{ value: numeroUnico, type: 'I' }],
      },
      joins: [{ path: 'Parceiro', fieldset: 'RAZAOSOCIAL' }],
      limit: 1,
    });

    const rows = this.loadRecords.parseEntities(raw);
    const r = rows[0];

    const codParc = r ? Number(r.CODPARC) : null;
    let uf: string | null = null;

    if (codParc) {
      const parceiroRaw = await this.loadRecords.loadRecords({
        rootEntity: 'Parceiro',
        fieldset: 'UF',
        criteria: {
          expression: 'CODPARC = ?',
          parameters: [{ value: codParc, type: 'I' }],
        },
        limit: 1,
      }).catch(() => null);

      if (parceiroRaw) {
        const parceiroRows = this.loadRecords.parseEntities(parceiroRaw);
        uf = parceiroRows[0]?.UF ?? null;
      }
    }

    return {
      numeroUnico: r ? Number(r.NUNOTA) : numeroUnico,
      numTalao: r?.AD_NUMTALAO ?? null,
      uf,
      cliente: r?.['Parceiro_RAZAOSOCIAL'] ?? null,
    };
  }
}
