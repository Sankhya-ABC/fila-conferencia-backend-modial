import { BadRequestException, Injectable } from '@nestjs/common';
import { SankhyaLoadRecordsClient } from 'src/http-client/load-records/load-records.client';
import { SankhyaDatasetSPClient } from 'src/http-client/dataset-sp/dataset-sp.client';
import { SankhyaDBExplorerSPClient } from 'src/http-client/db-explorer-sp/db-explorer-sp.client';
import { NumeroConferenciaFilter, NumeroUnicoFilter } from '../dto/model';
import {
  AtualizarCabecalhoConferenciaParams,
  AtualizarCabecalhoNotaParams,
} from './dto/conferencia.dto';
import { SessaoService } from '../sessao/sessao.service';
import { PrismaService } from 'prisma/prisma.service';

type LoadRecordsParams = Parameters<SankhyaLoadRecordsClient['loadRecords']>[0];

@Injectable()
export class ConferenciaHelper {
  constructor(
    private readonly loadRecords: SankhyaLoadRecordsClient,
    private readonly datasetSP: SankhyaDatasetSPClient,
    private readonly dbExplorer: SankhyaDBExplorerSPClient,
    private readonly sessaoService: SessaoService,
    private readonly prisma: PrismaService,
  ) {}

  async verificarStatus({ numeroUnico }: NumeroUnicoFilter) {
    const raw = await this.loadRecords.loadRecords({
      rootEntity: 'CabecalhoNota',
      fieldset: 'NUNOTA',
      criteria: {
        expression:
          'NUNOTA = ? AND CODTIPOPER IN (SELECT CODTIPOPER FROM TGFTOP WHERE NUCCO IS NOT NULL)',
        parameters: [{ value: numeroUnico, type: 'I' }],
      },
      limit: 1,
    });
    const results = this.loadRecords.parseEntities(raw);
    if (!results.length) {
      throw new BadRequestException(
        'Para iniciar a conferência, o pedido deve estar com status "Aguardando Conferência".',
      );
    }
  }

  async verificarConferenciaAtiva({ numeroUnico }: NumeroUnicoFilter) {
    const raw = await this.loadRecords.loadRecords({
      rootEntity: 'CabecalhoConferencia',
      fieldset: 'NUCONF',
      criteria: {
        expression: 'NUNOTAORIG = ? AND STATUS = ?',
        parameters: [
          { value: numeroUnico, type: 'I' },
          { value: 'A', type: 'S' },
        ],
      },
      limit: 1,
    });
    const results = this.loadRecords.parseEntities(raw);
    if (results.length > 0) {
      throw new BadRequestException(
        `Já existe conferência em andamento (NUCONF ${results[0].NUCONF}).`,
      );
    }
  }

  async obterNumeroConferencia() {
    try {
      const raw = await this.loadRecords.loadRecords({
        rootEntity: 'ControleNumeracao',
        fieldset: 'ULTCOD',
        criteria: {
          expression: 'ARQUIVO = ? AND CODEMP = ? AND SERIE = ?',
          parameters: [
            { value: 'TGFCON2', type: 'S' },
            { value: 1, type: 'I' },
            { value: '.', type: 'S' },
          ],
        },
        limit: 1,
      });
      const results = this.loadRecords.parseEntities(raw);
      if (!results.length) throw new Error('Registro não encontrado');
      return Number(results[0].ULTCOD) + 1;
    } catch {
      throw new BadRequestException('Erro ao obter número de conferência.');
    }
  }

  async atualizarNumeroConferencia({ numeroConferencia }: NumeroConferenciaFilter) {
    try {
      await this.datasetSP.save({
        entityName: 'ControleNumeracao',
        pk: { ARQUIVO: 'TGFCON2', CODEMP: 1, SERIE: '.', CODMODDOC: 0 },
        fieldsAndValues: { ULTCOD: numeroConferencia },
      });
    } catch {
      throw new BadRequestException('Erro ao atualizar controle de numeração.');
    }
  }

  async atualizarCabecalhoConferencia({
    numeroUnico,
    numeroConferencia,
    idUsuario,
  }: AtualizarCabecalhoConferenciaParams) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).split('-').reverse().join('/');
    const hour = now.toISOString().slice(11, 16);
    try {
      await this.datasetSP.save({
        entityName: 'CabecalhoConferencia',
        fieldsAndValues: {
          NUCONF: numeroConferencia,
          CODUSUCONF: idUsuario,
          DHINICONF: `${date} ${hour}`,
          DHFINCONF: null,
          NUNOTAORIG: numeroUnico,
          QTDVOL: 0,
          STATUS: 'A',
        },
      });
    } catch (err: any) {
      const detalhe = err?.response?.data ?? err?.message ?? String(err);
      console.error('[atualizarCabecalhoConferencia] erro Sankhya:', JSON.stringify(detalhe));
      throw new BadRequestException(`Erro ao criar cabeçalho da conferência. Detalhe: ${JSON.stringify(detalhe)}`);
    }
  }

  async atualizarCabecalhoNota({ numeroUnico, numeroConferencia }: AtualizarCabecalhoNotaParams) {
    try {
      await this.datasetSP.save({
        entityName: 'CabecalhoNota',
        pk: { NUNOTA: numeroUnico },
        fieldsAndValues: { NUCONFATUAL: numeroConferencia },
      });
    } catch (err: any) {
      const detalhe = err?.message || err?.response?.message || String(err);
      throw new BadRequestException(`Erro ao vincular conferência ao cabeçalho da nota. Detalhe: ${detalhe}`);
    }
  }

  // ─── Carrega todos os dados da nota no banco local ─────────────────────────

  async carregarSessao(params: {
    numeroUnico: number;
    numeroConferencia: number;
    idUsuario: number;
  }) {
    const { numeroUnico, numeroConferencia, idUsuario } = params;
    const nunota = Number(numeroUnico);
    const produtosSubquery = 'CODPROD IN (SELECT CODPROD FROM TGFITE WHERE NUNOTA = ?)';
    const produtosParam = [{ value: numeroUnico, type: 'I' as const }];

    // Verifica se o cache de barcodes já foi populado
    const cacheDisponivel = (await this.prisma.codigoBarrasCache.count()) > 0;

    // Dispara queries ao Sankhya — barPromise só é necessária sem cache
    const itemsPromise = this.fetchAllPages({
      rootEntity: 'ItemNota',
      fieldset: 'SEQUENCIA,CODPROD,CODVOL,CONTROLE,QTDNEG,QTDENTREGUE,QTDCONFERIDA',
      criteria: { expression: 'NUNOTA = ?', parameters: [{ value: numeroUnico, type: 'I' }] },
      joins: [{ path: 'Produto', fieldset: 'DESCRPROD,COMPLDESC,MARCA,REFERENCIA,DECQTD,TIPCONTEST,PESOBRUTO,EXCLUIRCONF,LISCONTEST' }],
    });
    const voaPromise = this.fetchAllPages({
      rootEntity: 'VolumeAlternativo',
      fieldset: 'CODPROD,CODVOL,CONTROLE,DIVIDEMULTIPLICA,QUANTIDADE,CODBARRA',
      criteria: { expression: produtosSubquery, parameters: produtosParam },
    });
    const barPromise = cacheDisponivel
      ? Promise.resolve(null)
      : this.loadRecords.loadRecords({
          rootEntity: 'CodigoBarras',
          fieldset: 'CODPROD,CODVOL,CODBARRA',
          criteria: { expression: produtosSubquery, parameters: produtosParam },
        });
    const estPromise = this.dbExplorer.executeQuery(
      `SELECT DISTINCT CODPROD, CONTROLE, CODBARRA FROM TGFEST WHERE CODPROD IN (SELECT CODPROD FROM TGFITE WHERE NUNOTA = ${nunota}) AND CODBARRA IS NOT NULL`,
    ).catch(() => [] as Record<string, any>[]);

    // Cabeçalho em paralelo com as demais (necessário para obter NUCCO → CCO)
    const cabRaw = await this.loadRecords.loadRecords({
      rootEntity: 'CabecalhoNota',
      fieldset: 'TIPMOV',
      criteria: { expression: 'NUNOTA = ?', parameters: [{ value: numeroUnico, type: 'I' }] },
      joins: [{ path: 'TipoOperacao', fieldset: 'DESCROPER,NUCCO' }],
      limit: 1,
    });
    const cabRows = this.loadRecords.parseEntities(cabRaw);
    const codigoTipoMovimento = cabRows[0]?.TIPMOV ?? null;
    const descricaoTipoOperacao = cabRows[0]?.['TipoOperacao_DESCROPER'] ?? null;
    const nucco = cabRows[0]?.['TipoOperacao_NUCCO'] ?? null;

    const ccoPromise = nucco != null
      ? this.loadRecords.loadRecords({
          rootEntity: 'ConfiguracaoConferencia',
          fieldset: 'BUSCARCODBARRAPOR',
          criteria: { expression: 'NUCCO = ?', parameters: [{ value: Number(nucco), type: 'I' }] },
          limit: 1,
        }).catch(() => null)
      : Promise.resolve(null);

    const [itemRows, voaRows, barRaw, estRows, ccoRaw] = await Promise.all([
      itemsPromise, voaPromise, barPromise, estPromise, ccoPromise,
    ]);

    // Determina regra de busca de código de barras
    let buscarCodigoBarraPor = 'A';
    if (ccoRaw) {
      const ccoRows = this.loadRecords.parseEntities(ccoRaw);
      if (ccoRows.length) buscarCodigoBarraPor = ccoRows[0].BUSCARCODBARRAPOR ?? 'A';
    }

    // Monta mapa VOA por (CODPROD|CODVOL|CONTROLE) e fallback (CODPROD|CONTROLE)
    const voaMap = new Map<string, { codvol: string; divideMult: string | null; quantidade: number | null }>();
    const voaFallback = new Map<string, { codvol: string; divideMult: string | null; quantidade: number | null }>();
    for (const v of voaRows) {
      const controle = String(v.CONTROLE ?? ' ').trim() || ' ';
      const entry = { codvol: v.CODVOL, divideMult: v.DIVIDEMULTIPLICA ?? null, quantidade: v.QUANTIDADE != null ? Number(v.QUANTIDADE) : null };
      voaMap.set(`${v.CODPROD}|${v.CODVOL}|${controle}`, entry);
      if (!voaFallback.has(`${v.CODPROD}|${controle}`)) voaFallback.set(`${v.CODPROD}|${controle}`, entry);
    }

    // Normaliza itens (exclui produtos marcados EXCLUIRCONF=S)
    const itens = itemRows
      .filter((item) => (item['Produto_EXCLUIRCONF'] ?? 'N') !== 'S')
      .map((item) => {
        const controle = String(item.CONTROLE ?? ' ').trim() || ' ';
        const voa = voaMap.get(`${item.CODPROD}|${item.CODVOL}|${controle}`)
                 ?? voaFallback.get(`${item.CODPROD}|${controle}`);
        return {
          SEQUENCIA: item.SEQUENCIA,
          CODPROD: item.CODPROD,
          CODVOL: voa?.codvol || item.CODVOL,
          CONTROLE: controle,
          QTDNEG: item.QTDNEG,
          QTDENTREGUE: item.QTDENTREGUE,
          QTDCONFERIDA: item.QTDCONFERIDA,
          DESCRPROD: item['Produto_DESCRPROD'],
          COMPLDESC: item['Produto_COMPLDESC'],
          MARCA: item['Produto_MARCA'],
          REFERENCIA: item['Produto_REFERENCIA'],
          DECQTD: item['Produto_DECQTD'],
          TIPCONTEST: item['Produto_TIPCONTEST'],
          PESOBRUTO: item['Produto_PESOBRUTO'],
          LISCONTEST: item['Produto_LISCONTEST'],
          DIVIDEMULTIPLICA: voa?.divideMult ?? null,
          FATOR_CONVERSAO: voa?.quantidade ?? null,
          IMAGEM: null as string | null,
        };
      });

    // Enriquece imagens a partir do ProdutoCache (evita query LOB ao Sankhya)
    const codprods = itens.map((i) => Number(i.CODPROD));
    const imagensCache = await this.prisma.produtoCache.findMany({
      where: { idProduto: { in: codprods } },
      select: { idProduto: true, imagem: true },
    });
    const imagensMap = new Map(imagensCache.map((p) => [p.idProduto, p.imagem]));
    for (const item of itens) {
      item.IMAGEM = imagensMap.get(Number(item.CODPROD)) ?? null;
    }

    // Monta lista de códigos de barras
    type Codigo = {
      CODPROD: any; CODBARRA: any; CODVOL: any;
      CONTROLE: string; QUANTIDADE: number | null; DIVIDEMULTIPLICA: any; ORIGEM: string;
    };
    const codigos: Codigo[] = [];

    if (cacheDisponivel) {
      // BAR + VOA do cache local
      const codigosCache = await this.prisma.codigoBarrasCache.findMany({
        where: { idProduto: { in: codprods }, origem: { in: ['BAR', 'VOA'] } },
      });
      for (const c of codigosCache) {
        codigos.push({
          CODPROD: c.idProduto, CODBARRA: c.codigoBarra, CODVOL: c.codvol ?? null,
          CONTROLE: c.controle, QUANTIDADE: c.quantidade, DIVIDEMULTIPLICA: c.divideMult,
          ORIGEM: c.origem,
        });
      }
    } else {
      // Fallback: BAR + VOA do Sankhya
      const barRows = this.loadRecords.parseEntities(barRaw!);
      for (const b of barRows) {
        if (!b.CODBARRA) continue;
        codigos.push({ CODPROD: b.CODPROD, CODBARRA: b.CODBARRA, CODVOL: b.CODVOL || null, CONTROLE: ' ', QUANTIDADE: null, DIVIDEMULTIPLICA: null, ORIGEM: 'BAR' });
      }
      for (const v of voaRows) {
        if (!v.CODBARRA) continue;
        codigos.push({
          CODPROD: v.CODPROD, CODBARRA: v.CODBARRA, CODVOL: v.CODVOL || null,
          CONTROLE: String(v.CONTROLE ?? ' ').trim() || ' ',
          QUANTIDADE: v.QUANTIDADE != null ? Number(v.QUANTIDADE) : null,
          DIVIDEMULTIPLICA: v.DIVIDEMULTIPLICA ?? null, ORIGEM: 'VOA',
        });
      }
    }

    // EST sempre do Sankhya (dados de estoque mudam constantemente)
    if (buscarCodigoBarraPor === 'A' || buscarCodigoBarraPor === 'E') {
      const estSeen = new Set<string>();
      for (const e of estRows as Record<string, any>[]) {
        const controle = String(e.CONTROLE ?? ' ').trim() || ' ';
        const key = `${e.CODPROD}|${controle}|${e.CODBARRA}`;
        if (estSeen.has(key)) continue;
        estSeen.add(key);
        codigos.push({ CODPROD: e.CODPROD, CODBARRA: e.CODBARRA, CODVOL: null, CONTROLE: controle, QUANTIDADE: null, DIVIDEMULTIPLICA: null, ORIGEM: 'EST' });
      }
    }

    await this.sessaoService.criarSessao({
      numeroUnico, numeroConferencia, idUsuario,
      codigoTipoMovimento, descricaoTipoOperacao, buscarCodigoBarraPor,
      itens, codigos,
    });
  }

  // ─── Carrega apenas os códigos de barras (VOA + BAR + EST) para uma nota ────
  // Usado como fallback pelo SeparacaoService quando a sessão não tem o sentinel LOADED
  async carregarCodigosBarras(numeroUnico: number, buscarCodigoBarraPor: string) {
    const nunota = Number(numeroUnico);
    const produtosSubquery = 'CODPROD IN (SELECT CODPROD FROM TGFITE WHERE NUNOTA = ?)';
    const produtosParam = [{ value: numeroUnico, type: 'I' as const }];
    const incluiEst = buscarCodigoBarraPor === 'A' || buscarCodigoBarraPor === 'E';

    const [voaRaw, barRaw, estRows] = await Promise.all([
      this.loadRecords.loadRecords({
        rootEntity: 'VolumeAlternativo',
        fieldset: 'CODPROD,CODVOL,CONTROLE,DIVIDEMULTIPLICA,QUANTIDADE,CODBARRA',
        criteria: { expression: produtosSubquery, parameters: produtosParam },
      }),
      this.loadRecords.loadRecords({
        rootEntity: 'CodigoBarras',
        fieldset: 'CODPROD,CODVOL,CODBARRA',
        criteria: { expression: produtosSubquery, parameters: produtosParam },
      }),
      incluiEst
        ? this.dbExplorer.executeQuery(
            `SELECT DISTINCT CODPROD, CONTROLE, CODBARRA FROM TGFEST WHERE CODPROD IN (SELECT CODPROD FROM TGFITE WHERE NUNOTA = ${nunota}) AND CODBARRA IS NOT NULL`,
          ).catch(() => [] as Record<string, any>[])
        : Promise.resolve([] as Record<string, any>[]),
    ]);

    const voaRows = this.loadRecords.parseEntities(voaRaw);
    const barRows = this.loadRecords.parseEntities(barRaw);

    type Codigo = {
      CODPROD: any; CODBARRA: any; CODVOL: any;
      CONTROLE: string; QUANTIDADE: number | null; DIVIDEMULTIPLICA: any; ORIGEM: string;
    };
    const codigos: Codigo[] = [];

    for (const b of barRows) {
      if (!b.CODBARRA) continue;
      codigos.push({ CODPROD: b.CODPROD, CODBARRA: b.CODBARRA, CODVOL: b.CODVOL || null, CONTROLE: ' ', QUANTIDADE: null, DIVIDEMULTIPLICA: null, ORIGEM: 'BAR' });
    }

    for (const v of voaRows) {
      if (!v.CODBARRA) continue;
      codigos.push({
        CODPROD: v.CODPROD, CODBARRA: v.CODBARRA, CODVOL: v.CODVOL || null,
        CONTROLE: String(v.CONTROLE ?? ' ').trim() || ' ',
        QUANTIDADE: v.QUANTIDADE != null ? Number(v.QUANTIDADE) : null,
        DIVIDEMULTIPLICA: v.DIVIDEMULTIPLICA ?? null, ORIGEM: 'VOA',
      });
    }

    const estSeen = new Set<string>();
    for (const e of estRows as Record<string, any>[]) {
      const controle = String(e.CONTROLE ?? ' ').trim() || ' ';
      const key = `${e.CODPROD}|${controle}|${e.CODBARRA}`;
      if (estSeen.has(key)) continue;
      estSeen.add(key);
      codigos.push({ CODPROD: e.CODPROD, CODBARRA: e.CODBARRA, CODVOL: null, CONTROLE: controle, QUANTIDADE: null, DIVIDEMULTIPLICA: null, ORIGEM: 'EST' });
    }

    return codigos;
  }

  private async fetchAllPages(params: LoadRecordsParams): Promise<Record<string, any>[]> {
    const result: Record<string, any>[] = [];
    let page = 0;
    while (true) {
      const raw = await this.loadRecords.loadRecords({ ...params, offsetPage: page });
      result.push(...this.loadRecords.parseEntities(raw));
      if (!this.loadRecords.hasNextPage(raw)) break;
      page++;
    }
    return result;
  }
}
