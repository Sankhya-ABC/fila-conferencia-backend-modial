import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(ConferenciaHelper.name);

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
      this.logger.error('[atualizarCabecalhoConferencia] erro Sankhya', JSON.stringify(detalhe));
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
      joins: [{ path: 'Produto', fieldset: 'DESCRPROD,COMPLDESC,MARCA,REFERENCIA,DECQTD,TIPCONTEST,PESOBRUTO,EXCLUIRCONF,LISCONTEST,CODVOL' }],
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

    const volPromise = this.loadRecords.loadRecords({
      rootEntity: 'Volume',
      fieldset: 'CODVOL,UTILICONFPESO',
      criteria: {
        expression: 'CODVOL IN (SELECT DISTINCT CODVOL FROM TGFITE WHERE NUNOTA = ?) OR CODVOL IN (SELECT DISTINCT p.CODVOL FROM TGFPRO p WHERE p.CODPROD IN (SELECT CODPROD FROM TGFITE WHERE NUNOTA = ?))',
        parameters: [
          { value: numeroUnico, type: 'I' },
          { value: numeroUnico, type: 'I' },
        ],
      },
    }).then(raw => this.loadRecords.parseEntities(raw))
      .catch((err: any) => {
        this.logger.warn(`[carregarSessao] falha ao buscar TGFVOL.UTILICONFPESO: ${err?.message ?? err}`);
        return [] as Record<string, any>[];
      });

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
          fieldset: 'BUSCARCODBARRAPOR,FORMACAOVOLUMES',
          criteria: { expression: 'NUCCO = ?', parameters: [{ value: Number(nucco), type: 'I' }] },
          limit: 1,
        }).catch(() => null)
      : Promise.resolve(null);

    const [itemRows, voaRows, barRaw, estRows, ccoRaw, volRows] = await Promise.all([
      itemsPromise, voaPromise, barPromise, estPromise, ccoPromise, volPromise,
    ]);

    // Determina regra de busca de código de barras
    let buscarCodigoBarraPor = 'A';
    let formacaoVolumes: string | null = null;
    if (ccoRaw) {
      const ccoRows = this.loadRecords.parseEntities(ccoRaw);
      if (ccoRows.length) {
        buscarCodigoBarraPor = ccoRows[0].BUSCARCODBARRAPOR ?? 'A';
        formacaoVolumes = ccoRows[0].FORMACAOVOLUMES ?? null;
      }
    }

    // Monta mapa VOA por (CODPROD|CODVOL|CONTROLE)
    // A conversão só se aplica quando o CODVOL do item bate com o CODVOL do VOA.
    // Não há fallback por produto — isso aplicaria conversão de CX em itens que estão em UN.
    const voaMap = new Map<string, { codvol: string; divideMult: string | null; quantidade: number | null }>();
    for (const v of voaRows) {
      const controle = String(v.CONTROLE ?? ' ').trim() || ' ';
      const codvolVoa = String(v.CODVOL ?? '').trim();
      const entry = { codvol: codvolVoa, divideMult: v.DIVIDEMULTIPLICA ?? null, quantidade: v.QUANTIDADE != null ? Number(v.QUANTIDADE) : null };
      voaMap.set(`${v.CODPROD}|${codvolVoa}|${controle}`, entry);
    }
    // Mapa CODVOL → usaConfPeso (TGFVOL.UTILICONFPESO = 'S')
    const volConfPesoMap = new Map<string, boolean>();
    for (const v of volRows as Record<string, any>[]) {
      const codvol = String(v.CODVOL ?? '').trim();
      if (codvol) volConfPesoMap.set(codvol, String(v.UTILICONFPESO ?? 'N') === 'S');
    }

    // Normaliza itens (exclui produtos marcados EXCLUIRCONF=S)
    const itens = itemRows
      .filter((item) => (item['Produto_EXCLUIRCONF'] ?? 'N') !== 'S')
      .map((item) => {
        const controle = String(item.CONTROLE ?? ' ').trim() || ' ';
        const codvolItem = String(item.CODVOL ?? '').trim();
        // Fallback para VOA sem controle específico quando o item tem lote
        const voa = voaMap.get(`${item.CODPROD}|${codvolItem}|${controle}`)
          ?? voaMap.get(`${item.CODPROD}|${codvolItem}| `)
          ?? null;
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
          CODVOL_PADRAO: item['Produto_CODVOL'] ? String(item['Produto_CODVOL']).trim() : null,
          UTILICONFPESO: volConfPesoMap.get(String(item['Produto_CODVOL'] ?? item.CODVOL ?? '').trim()) ?? false,
          PESAVEL: false,
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

    // ─── UMAs por produto (apenas produtos com usaConfPeso) ───────────────────
    const umaMap = new Map<number, Array<{codUma: string; descricao: string; peso: number|null; codVol: string|null; codBarra: string|null; padrao: boolean}>>();
    const confPesoCodprods = [...new Set(itens.filter(i => i.UTILICONFPESO === true).map(i => Number(i.CODPROD)))];
    if (confPesoCodprods.length > 0) {
      try {
        const umaRaw = await this.loadRecords.loadRecords({
          rootEntity: 'UnidadeMovArmazenagemProduto',
          fieldset: 'CODPROD,CODUMA,CODBARRA,CODVOL,PADRAO',
          criteria: {
            expression: 'CODPROD IN (SELECT CODPROD FROM TGFITE WHERE NUNOTA = ?)',
            parameters: [{ value: numeroUnico, type: 'I' }],
          },
          joins: [{ path: 'UnidadeMovimentacaoArmazenagem', fieldset: 'DESCRUMA,PESO' }],
        });
        for (const u of this.loadRecords.parseEntities(umaRaw)) {
          const cp = Number(u.CODPROD);
          if (!umaMap.has(cp)) umaMap.set(cp, []);
          umaMap.get(cp)!.push({
            codUma:   String(u.CODUMA ?? '').trim(),
            descricao: String(u['UnidadeMovimentacaoArmazenagem_DESCRUMA'] ?? '').trim(),
            peso:     u['UnidadeMovimentacaoArmazenagem_PESO'] != null ? Number(u['UnidadeMovimentacaoArmazenagem_PESO']) : null,
            codVol:   u.CODVOL  ? String(u.CODVOL).trim()  : null,
            codBarra: u.CODBARRA ? String(u.CODBARRA).trim() : null,
            padrao:   String(u.PADRAO ?? 'N') === 'S',
          });
        }
      } catch {
        // UMAs são informação de apoio — prossegue sem elas em caso de erro
      }
    }

    await this.sessaoService.criarSessao({
      numeroUnico, numeroConferencia, idUsuario,
      codigoTipoMovimento, descricaoTipoOperacao, formacaoVolumes, buscarCodigoBarraPor,
      itens: itens.map(i => ({ ...i, UMAS: umaMap.get(Number(i.CODPROD)) ?? [] })),
      codigos,
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

  async gravarPesoItem(params: { nunota: number; sequencia: number; pesobruto: number; pesoliq: number }) {
    const { nunota, sequencia, pesobruto, pesoliq } = params;
    await this.datasetSP.save({
      entityName: 'ItemNota',
      pk: { NUNOTA: nunota, SEQUENCIA: sequencia },
      fieldsAndValues: { PESOBRUTO: pesobruto, PESOLIQ: pesoliq },
    });
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
