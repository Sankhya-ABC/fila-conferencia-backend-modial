import { BadRequestException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SankhyaLoadRecordsClient } from 'src/http-client/load-records/load-records.client';
import { SankhyaDatasetSPClient } from 'src/http-client/dataset-sp/dataset-sp.client';
import { GatewayClient } from 'src/http-client/gateway/gateway.client';
import { ConferenciaHelper } from './conferencia.helper';
import { FilaConferenciaFilter, IniciarConferenciaBody } from './dto/conferencia.dto';
import { NumeroConferenciaFilter, NumeroUnicoFilter } from '../dto/model';
import { SessaoService } from '../sessao/sessao.service';
import { PrismaService } from 'prisma/prisma.service';
import { TenantService } from 'src/core/tenant/tenant.service';
import { tenantStorage } from 'src/core/tenant/tenant.context';
import { InflightService } from 'src/core/inflight/inflight.service';

async function comRetry<T>(fn: () => Promise<T>, tentativas = 3, delayMs = 2000): Promise<T> {
  let ultimo: any;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (i < tentativas - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw ultimo;
}

@Injectable()
export class ConferenciaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConferenciaService.name);

  constructor(
    private readonly loadRecordsClient: SankhyaLoadRecordsClient,
    private readonly conferenciaHelper: ConferenciaHelper,
    private readonly datasetSP: SankhyaDatasetSPClient,
    private readonly gateway: GatewayClient,
    private readonly sessaoService: SessaoService,
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly inflight: InflightService,
  ) {}

  async onApplicationBootstrap() {
    // Pre-aquece o cache da fila para todos os tenants ativos logo após o boot,
    // eliminando a lentidão do primeiro acesso após reinicialização do container.
    const DEFAULT_PARAMS: FilaConferenciaFilter = { page: '0', perPage: '50' };
    try {
      const tenants = await this.tenantService.listarAtivos();
      for (const { slug } of tenants) {
        tenantStorage.run(slug, async () => {
          try {
            // Garante que o PrismaClient do tenant esteja conectado antes de _fetchFila
            await this.tenantService.getClientForTenant(slug);
            const key = this._filaKey(DEFAULT_PARAMS);
            const result = await this._fetchFila(DEFAULT_PARAMS);
            this.filaCache.set(key, { result, cachedAt: Date.now(), refreshing: false });
            this.logger.log(`[Fila] Cache pré-aquecido para tenant "${slug}"`);
          } catch (err: any) {
            this.logger.warn(`[Fila] Falha ao pré-aquecer cache para "${slug}": ${err?.message}`);
          }
        });
      }
    } catch (err: any) {
      this.logger.warn(`[Fila] Falha ao pré-aquecer cache: ${err?.message}`);
    }
  }

  private async chamarConferenciaSP(serviceName: string, params: Record<string, any>): Promise<void> {
    const path = `/mgecom/service.sbr?serviceName=${serviceName}&outputType=json`;
    const res = await this.gateway.client.post(path, {
      serviceName,
      requestBody: { params },
    });
    if (res.data?.status !== '1') {
      const msg = res.data?.statusMessage ?? `Falha em ${serviceName}`;
      throw new BadRequestException(msg);
    }
  }

  // ─── Cache stale-while-revalidate ─────────────────────────────────────────
  private readonly filaCache = new Map<string, {
    result: any;
    cachedAt: number;
    refreshing: boolean;
  }>();

  private _filaKey(q: FilaConferenciaFilter): string {
    const slug = tenantStorage.getStore() ?? '_';
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== null && v !== '') clean[k] = v;
    }
    return `${slug}:${JSON.stringify(clean, Object.keys(clean).sort())}`;
  }

  // ─── Fila (LoadRecords + status do banco local) ────────────────────────────

  async getFilaConferencias(queryParams: FilaConferenciaFilter) {
    const key = this._filaKey(queryParams);
    const hit = this.filaCache.get(key);

    if (hit) {
      // Stale-while-revalidate: retorna o cache imediatamente (<1ms)
      // e dispara refresh em background para manter dado fresco.
      if (!hit.refreshing) {
        hit.refreshing = true;
        this._fetchFila(queryParams)
          .then((fresh) => {
            hit.result   = fresh;
            hit.cachedAt = Date.now();
            hit.refreshing = false;
          })
          .catch(() => { hit.refreshing = false; });
      }
      return hit.result;
    }

    // Cache miss — deduplica chamadas simultâneas e popula cache
    const result = await this.inflight.dedupe(key, () => this._fetchFila(queryParams));
    this.filaCache.set(key, { result, cachedAt: Date.now(), refreshing: false });

    // Evita crescimento ilimitado: descarta a entrada mais antiga quando passa de 100
    if (this.filaCache.size > 100) {
      const [oldestKey] = [...this.filaCache.entries()]
        .sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
      this.filaCache.delete(oldestKey);
    }

    return result;
  }

  private async _fetchFila(queryParams: FilaConferenciaFilter) {
    const page = Number(queryParams.page ?? 0);
    const perPage = Number(queryParams.perPage ?? 15);

    // Resolve statusList aqui para usar no short-circuit abaixo
    const statusList = (queryParams.codigoStatus ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    const slug = tenantStorage.getStore()!;
    const [temNumtalao, temTipoentrega] = await Promise.all([
      this.tenantService.hasModulo(slug, 'AD_NUMTALAO'),
      this.tenantService.hasModulo(slug, 'AD_TIPOENTREGA'),
    ]);

    // ── PERF: short-circuit F-only ────────────────────────────────────────────
    // A query principal tem NOT EXISTS(TGFCON2 STATUS IN ('F','D')), o que
    // garante que ela retorna ZERO linhas quando só se quer finalizados.
    // Pulamos ela por completo e buscamos direto no banco local + Sankhya.
    // Resultado idêntico ao path normal, sem o round-trip Sankhya desperdiçado.
    if (statusList.length > 0 && statusList.every((s) => s === 'F')) {
      return this._getFilaFinalizadas(queryParams, page, perPage, temNumtalao, temTipoentrega);
    }

    const parameters: { value: any; type: 'S' | 'I' | 'D' | 'B' }[] = [];
    const expressions: string[] = [
      "EXISTS (SELECT 1 FROM TGFTOP TP, TGFCCO CCO WHERE TP.NUCCO = CCO.NUCCO AND TP.CODTIPOPER = TGFCAB.CODTIPOPER AND TP.DHALTER = TGFCAB.DHTIPOPER AND ((CCO.MOMENTOCONFERENCIA = 'C' AND TGFCAB.LIBCONF = 'S') OR (CCO.MOMENTOCONFERENCIA = 'F' AND TGFCAB.STATUSNOTA = 'L')))",
      "NOT EXISTS (SELECT 1 FROM TGFCON2 CON2 WHERE CON2.NUCONF = TGFCAB.NUCONFATUAL AND CON2.STATUS IN ('F','D'))",
      "EXISTS (SELECT 1 FROM TGFITE ITE WHERE ITE.NUNOTA = TGFCAB.NUNOTA AND EXISTS (SELECT 1 FROM TGFPRO PROD WHERE (PROD.EXCLUIRCONF IS NULL OR PROD.EXCLUIRCONF = 'N') AND PROD.CODPROD = ITE.CODPROD))",
    ];

    if (queryParams.numeroNota) {
      expressions.push('NUMNOTA = ?');
      parameters.push({ value: Number(queryParams.numeroNota), type: 'I' });
    }
    if (queryParams.numeroUnico) {
      expressions.push('NUNOTA = ?');
      parameters.push({ value: Number(queryParams.numeroUnico), type: 'I' });
    }
    if (queryParams.idParceiro) {
      expressions.push('CODPARC = ?');
      parameters.push({ value: Number(queryParams.idParceiro), type: 'I' });
    }
    if (queryParams.idEmpresa) {
      expressions.push('CODEMP = ?');
      parameters.push({ value: Number(queryParams.idEmpresa), type: 'I' });
    }
    if (queryParams.codigoTipoMovimento) {
      const list = queryParams.codigoTipoMovimento
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 1) {
        expressions.push('TIPMOV = ?');
        parameters.push({ value: list[0], type: 'S' });
      } else if (list.length > 1) {
        expressions.push(`TIPMOV IN (${list.map(() => '?').join(',')})`);
        list.forEach((v) => parameters.push({ value: v, type: 'S' }));
      }
    }
    if (queryParams.codigoTipoOperacao) {
      const list = queryParams.codigoTipoOperacao
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 1) {
        expressions.push('CODTIPOPER = ?');
        parameters.push({ value: Number(list[0]), type: 'I' });
      } else if (list.length > 1) {
        expressions.push(`CODTIPOPER IN (${list.map(() => '?').join(',')})`);
        list.forEach((v) => parameters.push({ value: Number(v), type: 'I' }));
      }
    }
    if (queryParams.numeroModial && temNumtalao) {
      expressions.push('AD_NUMTALAO = ?');
      parameters.push({ value: queryParams.numeroModial, type: 'S' });
    }
    if (queryParams.dataInicio) {
      expressions.push('DTNEG >= ?');
      parameters.push({ value: queryParams.dataInicio, type: 'D' });
    }
    if (queryParams.dataFim) {
      expressions.push('DTNEG <= ?');
      parameters.push({ value: queryParams.dataFim, type: 'D' });
    }

    const queryExpression = expressions.join(' AND ');

    const camposAdFila = [
      temNumtalao ? 'AD_NUMTALAO' : null,
      temTipoentrega ? 'AD_TIPOENTREGA' : null,
    ].filter(Boolean).join(',');
    const fieldsetFila = `NUNOTA,NUMNOTA,NUCONFATUAL,TIPMOV,CODTIPOPER,CODPARC,CODEMP,DTNEG${camposAdFila ? ',' + camposAdFila : ''},CODVEND`;

    const [raw, activeNums] = await Promise.all([
      this.loadRecordsClient.loadRecords({
        rootEntity: 'CabecalhoNota',
        fieldset: fieldsetFila,
        criteria: {
          expression: queryExpression,
          parameters: parameters.length ? parameters : undefined,
        },
        joins: [
          { path: 'Parceiro', fieldset: 'NOMEPARC' },
          { path: 'TipoOperacao', fieldset: 'DESCROPER' },
          { path: 'Vendedor', fieldset: 'APELIDO' },
        ],
        offsetPage: page,
        limit: perPage,
      }).then((r) => {
        const rows = this.loadRecordsClient.parseEntities(r);
        this.logger.log(`[Fila] Sankhya retornou ${rows.length} notas`);
        return r;
      }).catch((err) => {
        this.logger.error('[Fila] ERRO Sankhya loadRecords', err?.message);
        throw err;
      }),
      this.sessaoService.listarNumerosUnicosAtivos(),
    ]);

    const rows = this.loadRecordsClient.parseEntities(raw);
    const hasNextPage = this.loadRecordsClient.hasNextPage(raw);

    // ── PERF: calls #2 e #3 em paralelo ─────────────────────────────────────
    // Antes rodavam em série; são independentes entre si (ambos dependem
    // apenas de `rows` e `activeNums`, que já estão disponíveis aqui).
    // Resultado idêntico — só o tempo muda (economiza o tempo da call mais lenta).
    const nuconfs = rows.map((r) => Number(r.NUCONFATUAL)).filter((n) => n > 0);
    const nunotasOrfas = rows
      .filter((r) => !r.NUCONFATUAL && !activeNums.has(Number(r.NUNOTA)))
      .map((r) => Number(r.NUNOTA));

    const [statusSankhyaMap, nunotasComConfOrfa] = await Promise.all([
      nuconfs.length > 0
        ? this.loadRecordsClient.loadRecords({
            rootEntity: 'CabecalhoConferencia',
            fieldset: 'NUCONF,STATUS',
            criteria: { expression: `NUCONF IN (${nuconfs.join(',')})` },
          }).then((rawConf) => {
            const map = new Map<number, string>();
            for (const c of this.loadRecordsClient.parseEntities(rawConf)) {
              map.set(Number(c.NUCONF), c.STATUS);
            }
            return map;
          }).catch(() => new Map<number, string>())
        : Promise.resolve(new Map<number, string>()),

      nunotasOrfas.length > 0
        ? this.loadRecordsClient.loadRecords({
            rootEntity: 'CabecalhoConferencia',
            fieldset: 'NUNOTAORIG',
            criteria: {
              expression: `NUNOTAORIG IN (${nunotasOrfas.join(',')}) AND STATUS = 'A'`,
            },
          }).then((rawOrfas) => {
            const set = new Set<number>();
            for (const c of this.loadRecordsClient.parseEntities(rawOrfas)) {
              set.add(Number(c.NUNOTAORIG));
            }
            return set;
          }).catch(() => new Set<number>())
        : Promise.resolve(new Set<number>()),
    ]);

    let data = rows.map((r) => {
      const nuconf = r.NUCONFATUAL ? Number(r.NUCONFATUAL) : null;
      const statusSankhya = nuconf ? (statusSankhyaMap.get(nuconf) ?? null) : null;
      const temSessaoLocal = activeNums.has(Number(r.NUNOTA));
      const codigoStatus = temSessaoLocal ? 'A' : 'AC';
      return {
        codigoStatus,
        statusSankhya,
        emAndamentoNativo: statusSankhya === 'A' && !temSessaoLocal,
        numeroUnico: Number(r.NUNOTA),
        numeroNota: Number(r.NUMNOTA),
        numeroConferencia: nuconf,
        idParceiro: Number(r.CODPARC),
        nomeParceiro: r['Parceiro_NOMEPARC'] ?? null,
        idEmpresa: Number(r.CODEMP),
        codigoTipoMovimento: r.TIPMOV,
        codigoTipoOperacao: r.CODTIPOPER ? Number(r.CODTIPOPER) : null,
        descricaoTipoOperacao: r['TipoOperacao_DESCROPER'] ?? null,
        dataMovimento: r.DTNEG,
        AD_NUMTALAO: r.AD_NUMTALAO ?? null,
        AD_TIPOENTREGA: r.AD_TIPOENTREGA ?? null,
        apelidoVendedor: r['Vendedor_APELIDO'] ?? null,
      };
    });

    // Oculta notas com conferência ativa no Sankhya mas sem sessão local:
    // caso 1 — NUCONFATUAL preenchido e sem sessão
    // caso 2 — conferência ativa via NUNOTAORIG sem NUCONFATUAL vinculado (orfã)
    data = data.filter((d) =>
      d.codigoStatus === 'A' ||
      (d.numeroConferencia === null && !nunotasComConfOrfa.has(d.numeroUnico)),
    );

    if (statusList.length > 0) {
      data = data.filter((d) => statusList.includes(d.codigoStatus));
    }

    // Finalizados no sistema (status misto que inclui 'F'):
    // A query principal usa NOT EXISTS que os exclui — buscamos independentemente.
    if (statusList.includes('F')) {
      try {
        const finalizadas = await this.sessaoService.listarSessionsFinalizadas();
        if (finalizadas.length > 0) {
          // ── PERF: filtros empurrados para o Sankhya em vez de em memória ──────
          // Resultado idêntico — reduz dados trafegados quando há filtros ativos.
          let nunotas = finalizadas.map((s) => s.numeroUnico);
          const nunotaMap = new Map(finalizadas.map((s) => [s.numeroUnico, s.numeroConferencia]));

          if (queryParams.numeroUnico) {
            nunotas = nunotas.filter((n) => n === Number(queryParams.numeroUnico));
          }
          if (!nunotas.length) {
            // nenhum finalizados bate com o filtro — pula a query Sankhya
          } else {
            const finExpressions = [`NUNOTA IN (${nunotas.join(',')})`];
            const finParams: { value: any; type: 'S' | 'I' | 'D' | 'B' }[] = [];
            if (queryParams.numeroNota)   { finExpressions.push('NUMNOTA = ?');    finParams.push({ value: Number(queryParams.numeroNota), type: 'I' }); }
            if (queryParams.idParceiro)   { finExpressions.push('CODPARC = ?');    finParams.push({ value: Number(queryParams.idParceiro), type: 'I' }); }
            if (queryParams.idEmpresa)    { finExpressions.push('CODEMP = ?');     finParams.push({ value: Number(queryParams.idEmpresa), type: 'I' }); }
            if (queryParams.numeroModial && temNumtalao) { finExpressions.push('AD_NUMTALAO = ?'); finParams.push({ value: queryParams.numeroModial, type: 'S' }); }

            const camposAdFin = [temNumtalao ? 'AD_NUMTALAO' : null, temTipoentrega ? 'AD_TIPOENTREGA' : null].filter(Boolean).join(',');
            const rawFin = await this.loadRecordsClient.loadRecords({
              rootEntity: 'CabecalhoNota',
              fieldset: `NUNOTA,NUMNOTA,TIPMOV,CODTIPOPER,CODPARC,CODEMP,DTNEG${camposAdFin ? ',' + camposAdFin : ''},CODVEND`,
              criteria: {
                expression: finExpressions.join(' AND '),
                parameters: finParams.length ? finParams : undefined,
              },
              joins: [
                { path: 'Parceiro', fieldset: 'NOMEPARC' },
                { path: 'TipoOperacao', fieldset: 'DESCROPER' },
                { path: 'Vendedor', fieldset: 'APELIDO' },
              ],
              limit: 200,
            }).catch(() => null);

            if (rawFin) {
              const finData = this.loadRecordsClient.parseEntities(rawFin).map((r) => ({
                codigoStatus: 'F',
                statusSankhya: 'F',
                emAndamentoNativo: false,
                numeroUnico: Number(r.NUNOTA),
                numeroNota: Number(r.NUMNOTA),
                numeroConferencia: nunotaMap.get(Number(r.NUNOTA)) ?? null,
                idParceiro: Number(r.CODPARC),
                nomeParceiro: r['Parceiro_NOMEPARC'] ?? null,
                idEmpresa: Number(r.CODEMP),
                codigoTipoMovimento: r.TIPMOV,
                codigoTipoOperacao: r.CODTIPOPER ? Number(r.CODTIPOPER) : null,
                descricaoTipoOperacao: r['TipoOperacao_DESCROPER'] ?? null,
                dataMovimento: r.DTNEG,
                AD_NUMTALAO: r.AD_NUMTALAO ?? null,
                AD_TIPOENTREGA: r.AD_TIPOENTREGA ?? null,
                apelidoVendedor: r['Vendedor_APELIDO'] ?? null,
              }));
              data = [...data, ...finData];
            }
          }
        }
      } catch { /* soft-fail — não bloqueia a fila */ }
    }

    return { data, hasNextPage: hasNextPage && data.length >= perPage, page, perPage };
  }

  // Extração do path F-only para manter getFilaConferencias legível.
  // Lógica idêntica ao bloco statusList.includes('F') original —
  // apenas sem a query principal desperdiçada antes.
  private async _getFilaFinalizadas(
    queryParams: FilaConferenciaFilter,
    page: number,
    perPage: number,
    temNumtalao: boolean,
    temTipoentrega: boolean,
  ) {
    try {
      const finalizadas = await this.sessaoService.listarSessionsFinalizadas();
      if (!finalizadas.length) return { data: [], hasNextPage: false, total: 0, page, perPage };

      let nunotas = finalizadas.map((s) => s.numeroUnico);
      const nunotaMap = new Map(finalizadas.map((s) => [s.numeroUnico, s.numeroConferencia]));

      if (queryParams.numeroUnico) {
        nunotas = nunotas.filter((n) => n === Number(queryParams.numeroUnico));
      }
      if (!nunotas.length) return { data: [], hasNextPage: false, total: 0, page, perPage };

      // Pagina o array de NUNOTAs no banco local antes de ir ao Sankhya
      const total = nunotas.length;
      const paginados = nunotas.slice(page * perPage, (page + 1) * perPage);
      if (!paginados.length) return { data: [], hasNextPage: false, total, page, perPage };

      const finExpressions = [`NUNOTA IN (${paginados.join(',')})`];
      const finParams: { value: any; type: 'S' | 'I' | 'D' | 'B' }[] = [];
      if (queryParams.numeroNota)   { finExpressions.push('NUMNOTA = ?');    finParams.push({ value: Number(queryParams.numeroNota), type: 'I' }); }
      if (queryParams.idParceiro)   { finExpressions.push('CODPARC = ?');    finParams.push({ value: Number(queryParams.idParceiro), type: 'I' }); }
      if (queryParams.idEmpresa)    { finExpressions.push('CODEMP = ?');     finParams.push({ value: Number(queryParams.idEmpresa), type: 'I' }); }
      if (queryParams.numeroModial && temNumtalao) { finExpressions.push('AD_NUMTALAO = ?'); finParams.push({ value: queryParams.numeroModial, type: 'S' }); }

      const camposAd = [temNumtalao ? 'AD_NUMTALAO' : null, temTipoentrega ? 'AD_TIPOENTREGA' : null].filter(Boolean).join(',');
      const rawFin = await this.loadRecordsClient.loadRecords({
        rootEntity: 'CabecalhoNota',
        fieldset: `NUNOTA,NUMNOTA,TIPMOV,CODTIPOPER,CODPARC,CODEMP,DTNEG${camposAd ? ',' + camposAd : ''},CODVEND`,
        criteria: {
          expression: finExpressions.join(' AND '),
          parameters: finParams.length ? finParams : undefined,
        },
        joins: [
          { path: 'Parceiro', fieldset: 'NOMEPARC' },
          { path: 'TipoOperacao', fieldset: 'DESCROPER' },
          { path: 'Vendedor', fieldset: 'APELIDO' },
        ],
        limit: perPage,
      }).catch(() => null);

      if (!rawFin) return { data: [], hasNextPage: false, total, page, perPage };

      const data = this.loadRecordsClient.parseEntities(rawFin).map((r) => ({
        codigoStatus: 'F',
        statusSankhya: 'F',
        emAndamentoNativo: false,
        numeroUnico: Number(r.NUNOTA),
        numeroNota: Number(r.NUMNOTA),
        numeroConferencia: nunotaMap.get(Number(r.NUNOTA)) ?? null,
        idParceiro: Number(r.CODPARC),
        nomeParceiro: r['Parceiro_NOMEPARC'] ?? null,
        idEmpresa: Number(r.CODEMP),
        codigoTipoMovimento: r.TIPMOV,
        codigoTipoOperacao: r.CODTIPOPER ? Number(r.CODTIPOPER) : null,
        descricaoTipoOperacao: r['TipoOperacao_DESCROPER'] ?? null,
        dataMovimento: r.DTNEG,
        AD_NUMTALAO: r.AD_NUMTALAO ?? null,
        AD_TIPOENTREGA: r.AD_TIPOENTREGA ?? null,
        apelidoVendedor: r['Vendedor_APELIDO'] ?? null,
      }));

      return { data, hasNextPage: (page + 1) * perPage < total, total, page, perPage };
    } catch {
      return { data: [], hasNextPage: false, total: 0, page, perPage };
    }
  }

  // Verificação leve: só bate no banco local, sem Sankhya.
  // Usado pelo frontend para polling durante carregamento da sessão em background.
  async getSessaoPronta({ numeroUnico }: NumeroUnicoFilter) {
    const sessao = await this.sessaoService.buscarPorNota(Number(numeroUnico));
    return { pronta: sessao?.status === 'A' };
  }

  async getDadosBasicos({ numeroUnico }: NumeroUnicoFilter) {
    const [raw, sessaoAtiva] = await Promise.all([
      this.loadRecordsClient.loadRecords({
        rootEntity: 'CabecalhoNota',
        fieldset: 'NUNOTA,NUMNOTA,TIPMOV,CODPARC,CODVEND',
        criteria: {
          expression: 'NUNOTA = ?',
          parameters: [{ value: numeroUnico, type: 'I' }],
        },
        joins: [
          { path: 'Parceiro', fieldset: 'RAZAOSOCIAL' },
          { path: 'TipoOperacao', fieldset: 'DESCROPER,NUCCO' },
          { path: 'Vendedor', fieldset: 'APELIDO' },
        ],
        limit: 1,
      }),
      this.sessaoService.buscarPorNota(numeroUnico),
    ]);

    const rows = this.loadRecordsClient.parseEntities(raw);
    if (!rows.length) return null;

    const r = rows[0];
    const nucco = r['TipoOperacao_NUCCO'] ?? null;

    let formacaoVolumes: string | null  = null;
    let obterQtdBalanca: string | null  = null;
    let qtdAmaior: string | null        = 'C';
    let fataoConcluir: string | null    = 'N';
    if (nucco != null) {
      const ccoRaw = await this.loadRecordsClient.loadRecords({
        rootEntity: 'ConfiguracaoConferencia',
        fieldset: 'FORMACAOVOLUMES,OBTERQTDBALANCA,QTDAMAIOR,FATAOCONCLUIR',
        criteria: { expression: 'NUCCO = ?', parameters: [{ value: Number(nucco), type: 'I' }] },
        limit: 1,
      }).catch(() => null);
      if (ccoRaw) {
        const ccoRows = this.loadRecordsClient.parseEntities(ccoRaw);
        formacaoVolumes  = ccoRows[0]?.FORMACAOVOLUMES   ?? null;
        obterQtdBalanca  = (ccoRows[0]?.OBTERQTDBALANCA  as string | null) ?? null;
        qtdAmaior        = (ccoRows[0]?.QTDAMAIOR         as string | null) ?? 'C';
        fataoConcluir    = (ccoRows[0]?.FATAOCONCLUIR     as string | null) ?? 'N';
      }
    }

    const slug = tenantStorage.getStore()!;
    const temCubagem = await this.tenantService.hasModulo(slug, 'AD_CUBAGEM');

    const estaAtiva = sessaoAtiva?.status === 'A';
    return {
      numeroUnico: Number(r.NUNOTA),
      numeroNota: Number(r.NUMNOTA),
      numeroConferencia: estaAtiva ? sessaoAtiva!.numeroConferencia : null,
      codigoStatus: estaAtiva ? 'A' : 'AC',
      codigoTipoMovimento: r.TIPMOV,
      descricaoTipoOperacao: r['TipoOperacao_DESCROPER'] ?? null,
      formacaoVolumes,
      obterQtdBalanca,
      qtdAmaior,
      fataoConcluir,
      temCubagem,
      idParceiro: Number(r.CODPARC),
      nomeParceiro: r['Parceiro_RAZAOSOCIAL'] ?? null,
      idVendedor: r.CODVEND ? Number(r.CODVEND) : null,
      nomeVendedor: r['Vendedor_APELIDO'] ?? null,
    };
  }

  // ─── Iniciar (cria registro Sankhya + carrega sessão local) ───────────────

  async postIniciarConferencia({ idUsuario, numeroUnico }: IniciarConferenciaBody) {
    this.filaCache.clear(); // status mudou — invalida cache da fila
    // Se já existe sessão local ativa, retorna sem recriar
    const sessaoExistente = await this.sessaoService.buscarPorNota(numeroUnico);
    if (sessaoExistente?.status === 'A') {
      return { numeroConferencia: sessaoExistente.numeroConferencia };
    }

    // Valida status da nota e ausência de conferência ativa no Sankhya
    await Promise.all([
      this.conferenciaHelper.verificarStatus({ numeroUnico }),
      this.conferenciaHelper.verificarConferenciaAtiva({ numeroUnico }),
    ]);

    // Cria o cabeçalho via SP nativa — lida com tipos de coluna internamente (evita overflow smallint)
    await comRetry(() =>
      this.chamarConferenciaSP('ConferenciaSP.salvarCabecalhoConferencia', {
        nuNota: numeroUnico,
        iniciarRecontagem: false,
      }),
    );

    // Obtém o NUCONF atribuído pela SP
    const numeroConferencia = await this.conferenciaHelper.buscarNumeroConferenciaAtiva({ numeroUnico });

    // Carregamento da sessão em background — não bloqueia a resposta
    this.conferenciaHelper.carregarSessao({ numeroUnico, numeroConferencia, idUsuario })
      .catch((err) => this.logger.error('[carregarSessao] falhou em background', err?.message));

    return { numeroConferencia };
  }

  // ─── Finalizar (batch-write de tudo para o Sankhya) ──────────────────────

  private async atualizarObservacaoNota(numeroUnico: number, nomeUsuario: string): Promise<void> {
    const raw = await this.loadRecordsClient.loadRecords({
      rootEntity: 'CabecalhoNota',
      fieldset: 'OBSERVACAO,AD_NUMTALAO',
      criteria: {
        expression: 'NUNOTA = ?',
        parameters: [{ value: numeroUnico, type: 'I' }],
      },
      limit: 1,
    });

    const rows = this.loadRecordsClient.parseEntities(raw);
    const obsAtual = (rows[0]?.OBSERVACAO ?? '').trim();
    const numModial = rows[0]?.AD_NUMTALAO ? String(rows[0].AD_NUMTALAO).trim() : null;

    const linhas: string[] = [];
    if (numModial) linhas.push(`Pedido Modial: #${numModial}`);
    linhas.push(`Pedido Separado por: ${nomeUsuario}`);

    const novaObs = obsAtual ? `${obsAtual}\n${linhas.join('\n')}` : linhas.join('\n');

    await this.datasetSP.save({
      entityName: 'CabecalhoNota',
      pk: { NUNOTA: numeroUnico },
      fieldsAndValues: { OBSERVACAO: novaObs },
    });
  }

  private async gravarRelatorioCubagem(
    numeroUnico: number,
    grupos: Array<{ qtd: number; altura?: number | null; largura?: number | null; comprimento?: number | null; peso?: number | null }>,
    totalVol: number,
  ): Promise<void> {
    if (!grupos.length) return;

    const fmt = (v: number | null | undefined) =>
      v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '?';
    const fmtPeso = (v: number | null | undefined) =>
      v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '?';

    const linhas: string[] = [];
    linhas.push('=== CUBAGEM DO PEDIDO ===');
    linhas.push(`Volumes: ${totalVol}`);
    linhas.push('');

    for (const g of grupos) {
      linhas.push(
        `${g.qtd}x | A:${fmt(g.altura)} L:${fmt(g.largura)} C:${fmt(g.comprimento)} cm | ${fmtPeso(g.peso)} kg`,
      );
    }

    const pesoTotal = grupos.reduce((acc, g) => acc + (g.peso ?? 0) * g.qtd, 0);
    linhas.push('');
    linhas.push(`Peso total: ${fmtPeso(pesoTotal)} kg`);

    await this.datasetSP.save({
      entityName: 'CabecalhoNota',
      pk: { NUNOTA: numeroUnico },
      fieldsAndValues: { AD_RELATORIOCUB: linhas.join('\n') },
    });
  }

  async excluirSessao({ numeroUnico }: NumeroUnicoFilter) {
    const sessao = await this.sessaoService.buscarPorNota(numeroUnico);
    if (!sessao) throw new BadRequestException('Sessão não encontrada para esta nota.');

    // Marca TGFCON2 como desistida (não bloqueia — erro é silencioso)
    this.datasetSP.save({
      entityName: 'CabecalhoConferencia',
      pk: { NUCONF: sessao.numeroConferencia },
      fieldsAndValues: { STATUS: 'D' },
    }).catch((e) => this.logger.warn(`[excluirSessao] TGFCON2 não atualizado: ${e?.message ?? e}`));

    await this.sessaoService.excluirSessao(sessao.id);
    this.filaCache.clear();
  }

  async postFinalizarConferencia({ numeroConferencia }: NumeroConferenciaFilter) {
    this.filaCache.clear(); // nota finalizada — invalida cache da fila
    const slug = tenantStorage.getStore()!;
    const temAdCubagem = await this.tenantService.hasModulo(slug, 'AD_CUBAGEM');
    const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');

    const dados = await this.sessaoService.getDadosFinalizacao(sessao.id);
    if (!dados) throw new BadRequestException('Dados da sessão não encontrados.');

    const usuarioDb = await this.prisma.user.findFirst({ where: { codigo: sessao.idUsuario } });
    const nomeUsuario = usuarioDb?.nome ?? String(sessao.idUsuario);

    const now = new Date();
    const date = now.toISOString().slice(0, 10).split('-').reverse().join('/');
    const hour = now.toISOString().slice(11, 16);
    const dh = `${date} ${hour}`;

    const erros: string[] = [];
    const pushErro = (label: string, e?: any) => {
      const detail = e?.message ? `: ${String(e.message).slice(0, 120)}` : '';
      erros.push(`${label}${detail}`);
    };

    // Peso bruto total: soma do peso de todos os volumes conferidos
    const pesoBrutoTotal = dados.volumes.reduce((s, v) => s + (v.peso ?? 0), 0);


    // Recovery: garante que TGFCON2 existe antes de inserir TGFCOI2
    // Tenta INSERT; se falhar (já existe ou validação), tenta UPDATE para confirmar existência.
    // Se ambos falharem, lança erro — sem TGFCON2 o TGFCOI2 quebraria com FK violation.
    const cabIni: Record<string, any> = { NUCONF: numeroConferencia, CODUSUCONF: sessao.idUsuario, DHINICONF: dh, NUNOTAORIG: sessao.numeroUnico, STATUS: 'A' };
    if (temAdCubagem) cabIni['QTDVOL'] = 0;
    await this.datasetSP.save({
      entityName: 'CabecalhoConferencia',
      fieldsAndValues: cabIni,
    }).catch(async () => {
      const cabIniUpd: Record<string, any> = { STATUS: 'A' };
      if (temAdCubagem) cabIniUpd['QTDVOL'] = 0;
      await this.datasetSP.save({
        entityName: 'CabecalhoConferencia',
        pk: { NUCONF: numeroConferencia },
        fieldsAndValues: cabIniUpd,
      }).catch((e) => {
        throw new BadRequestException(
          `Não foi possível garantir o cabeçalho da conferência (TGFCON2) no Sankhya. Detalhe: ${e?.message ?? e}`,
        );
      });
    });

    const barcodeMap = new Map<string, string>();
    for (const c of dados.codigos) {
      if (!c.codigoBarra || c.codigoBarra === '__loaded__') continue;
      const key = `${c.idProduto}|${(c.controle || ' ').trim() || ' '}`;
      if (!barcodeMap.has(key)) barcodeMap.set(key, c.codigoBarra);
    }
    const getCodigoBarra = (idProduto: number, controle: string) =>
      barcodeMap.get(`${idProduto}|${controle}`) ??
      barcodeMap.get(`${idProduto}| `) ??
      String(idProduto);

    const itemMap = new Map<string, { fatorConv: number | null; divideMult: string | null }>();
    for (const item of dados.itens) {
      itemMap.set(`${item.idProduto}|${(item.controle || ' ').trim() || ' '}`, { fatorConv: item.fatorConv, divideMult: item.divideMult });
    }
    // sessaoLeitura.qtd já está em unidade PADRÃO (salvo como quantidadePadrao na conferência).
    // TGFITE.QTDNEG também é armazenado em padrão pelo Sankhya. Não há conversão a fazer aqui.
    const toQtdVolpad = (_idProduto: number, _controle: string, qtd: number): number => qtd;

    // Modo simplificado (S/T): sem TGFVCF/TGFIVC, AD_CUBAGEM sem SEQVOL com QTDVOL
    if (dados.qtdVol != null) {
      const gruposSimp = new Map<string, { idProduto: number; controle: string; codvol: string; codbarra: string; qtd: number }>();
      for (const l of dados.leituras) {
        const key = `${l.idProduto}|${l.controle}`;
        if (gruposSimp.has(key)) {
          gruposSimp.get(key)!.qtd += l.qtd;
        } else {
          gruposSimp.set(key, { idProduto: l.idProduto, controle: l.controle, codvol: l.unidade || 'UN', codbarra: getCodigoBarra(l.idProduto, l.controle), qtd: l.qtd });
        }
      }

      const coiSimp = [...gruposSimp.values()].map((g, idx) => {
        const controleNorm = g.controle?.trim() || ' ';
        const qtdConv = toQtdVolpad(g.idProduto, g.controle, g.qtd);
        const payload = { NUCONF: numeroConferencia, SEQCONF: idx + 1, CODPROD: g.idProduto, CODVOL: g.codvol, CONTROLE: controleNorm, CODBARRA: g.codbarra, QTDCONF: qtdConv, QTDCONFVOLPAD: qtdConv, DHALTER: dh };
        return this.datasetSP.save({ entityName: 'DetalhesConferencia', fieldsAndValues: payload }).catch(async (e) => {
          this.logger.error('[TGFCOI2 insert error]', e?.message);
          await this.datasetSP.save({ entityName: 'DetalhesConferencia', pk: { NUCONF: numeroConferencia, SEQCONF: idx + 1 }, fieldsAndValues: { QTDCONF: qtdConv, QTDCONFVOLPAD: qtdConv, DHALTER: dh } })
            .catch((e2) => pushErro(`TGFCOI2 PROD=${g.idProduto}`, e ?? e2));
        });
      });

      // Agrupa SessaoVolume por dimensões → uma linha AD_CUBAGEM por grupo
      type GrupoDim = { qtd: number; seqVol: number; altura: number | null; largura: number | null; comprimento: number | null; peso: number | null };
      const dimMap = new Map<string, GrupoDim>();
      let seqGrupo = 1;
      for (const vol of dados.volumes) {
        const key = `${vol.altura ?? ''}|${vol.largura ?? ''}|${vol.comprimento ?? ''}|${vol.peso ?? ''}`;
        if (dimMap.has(key)) {
          dimMap.get(key)!.qtd++;
        } else {
          dimMap.set(key, { qtd: 1, seqVol: seqGrupo++, altura: vol.altura, largura: vol.largura, comprimento: vol.comprimento, peso: vol.peso });
        }
      }
      const gruposDim = [...dimMap.values()];
      // Modo T/S: totalVol vem sempre do qtdVol acumulado via postSalvarGrupoSimplificado.
      // gruposDim pode ter volumes criados pelo scan (garantirVolume) sem dimensões — ignorar.
      const cubPreSalvo = dados.formacaoVolumes === 'T' || dados.formacaoVolumes === 'S';
      const totalVol = cubPreSalvo
        ? dados.qtdVol
        : gruposDim.length > 0
          ? gruposDim.reduce((s, g) => s + g.qtd, 0)
          : dados.qtdVol;
      const cubSimp: Promise<any>[] = !temAdCubagem || cubPreSalvo
        ? []
        : gruposDim.length > 0
          ? gruposDim.map((g) =>
              this.datasetSP.save({
                entityName: 'AD_CUBAGEM',
                fieldsAndValues: { NUCONF: numeroConferencia, SEQVOL: g.seqVol, QTDVOL: g.qtd, ALTURA: g.altura, LARGURA: g.largura, COMPRIMENTO: g.comprimento, PESO: g.peso },
              }).catch(async (e) => {
                await this.datasetSP.save({
                  entityName: 'AD_CUBAGEM',
                  pk: { NUCONF: numeroConferencia, SEQVOL: g.seqVol },
                  fieldsAndValues: { QTDVOL: g.qtd, ALTURA: g.altura, LARGURA: g.largura, COMPRIMENTO: g.comprimento, PESO: g.peso },
                }).catch((e2) => pushErro(`Cubagem grupo ${g.seqVol}`, e2 ?? e));
              })
            )
          : [
              this.datasetSP.save({
                entityName: 'AD_CUBAGEM',
                fieldsAndValues: { NUCONF: numeroConferencia, QTDVOL: dados.qtdVol, ALTURA: dados.altura, LARGURA: dados.largura, COMPRIMENTO: dados.comprimento, PESO: dados.peso },
              }).catch(async (e) => {
                await this.datasetSP.save({
                  entityName: 'AD_CUBAGEM',
                  pk: { NUCONF: numeroConferencia },
                  fieldsAndValues: { QTDVOL: dados.qtdVol, ALTURA: dados.altura, LARGURA: dados.largura, COMPRIMENTO: dados.comprimento, PESO: dados.peso },
                }).catch((e2) => pushErro('Cubagem simplificada', e2 ?? e));
              }),
            ];

      await Promise.all([...coiSimp, ...cubSimp]);

      if (erros.length) {
        throw new BadRequestException(`Finalização concluída com erros nos seguintes registros: ${erros.join(', ')}. Os dados locais foram preservados para nova tentativa.`);
      }

      // Corte e finalização via Sankhya — processa divergências, gera financeiro e carimba DHFINCONF
      await this.chamarConferenciaSP('ConferenciaSP.cortar', {
        nuNota: sessao.numeroUnico,
        peso: pesoBrutoTotal,
        qtdVol: totalVol,
      });
      await this.chamarConferenciaSP('ConferenciaSP.finalizarConferencia', {
        nuConf: String(numeroConferencia),
        peso: pesoBrutoTotal,
        qtdVol: totalVol,
      }).catch((e) => this.logger.warn('[finalizarConferencia] non-fatal:', e?.message));

      // STATUS='F' — garante o fechamento local mesmo se finalizarConferencia não o fizer
      const finSimp: Record<string, any> = { STATUS: 'F', DHFINCONF: dh };
      if (temAdCubagem) finSimp['QTDVOL'] = totalVol;
      await comRetry(() =>
        this.datasetSP.save({ entityName: 'CabecalhoConferencia', pk: { NUCONF: numeroConferencia }, fieldsAndValues: finSimp })
      );
      const tgfcabSimp: Record<string, any> = {};
      if (temAdCubagem) tgfcabSimp['QTDVOL'] = totalVol;
      if (pesoBrutoTotal > 0) tgfcabSimp['PESOBRUTOMANUAL'] = pesoBrutoTotal;
      if (Object.keys(tgfcabSimp).length > 0) {
        this.datasetSP.save({ entityName: 'CabecalhoNota', pk: { NUNOTA: dados.numeroUnico }, fieldsAndValues: tgfcabSimp })
          .catch(() => this.logger.warn('[TGFCAB] falhou (non-blocking)'));
      }

      await this.atualizarObservacaoNota(dados.numeroUnico, nomeUsuario)
        .catch(() => this.logger.warn('[TGFCAB OBSERVACAO] falhou (non-blocking)'));

      if (temAdCubagem) {
        const todos = gruposDim.length > 0
          ? gruposDim
          : [{ qtd: dados.qtdVol ?? 1, altura: dados.altura, largura: dados.largura, comprimento: dados.comprimento, peso: dados.peso }];
        const gruposRel = todos.filter(g => g.altura != null || g.largura != null || g.comprimento != null || g.peso != null);
        if (gruposRel.length > 0)
          await this.gravarRelatorioCubagem(dados.numeroUnico, gruposRel, totalVol)
            .catch(() => this.logger.warn('[AD_RELATORIOCUB] falhou (non-blocking)'));
      }

      await this.sessaoService.marcarFinalizada(sessao.id);
      return { qtdVol: totalVol, numeroConferencia };
    }

    // Modo detalhado — fluxo original
    // Renumera volumes 1, 2, 3... para o Sankhya (ignora possíveis gaps)
    const seqVolNovo = new Map(dados.volumes.map((v, idx) => [v.seqVol, idx + 1]));
    const volSetAtual = new Set(dados.volumes.map((v) => v.seqVol));
    // Filtra leituras órfãs (volume excluído sem reassociação — bloqueado por podeConfirmarConferencia)
    const leiturasAtivas = dados.leituras.filter((l) => volSetAtual.has(l.seqVol));

    // 1. TGFVCF — volumes em sequência (evita race condition no Sankhya)
    for (const vol of dados.volumes) {
      const seqNovo = seqVolNovo.get(vol.seqVol)!;
      await this.datasetSP.save({
        entityName: 'VolumeConferencia',
        fieldsAndValues: { NUCONF: numeroConferencia, SEQVOL: seqNovo, ORDEM: seqNovo },
      }).catch(async (e) => {
        // Retentativa: registro já pode existir → tenta update
        await this.datasetSP.save({
          entityName: 'VolumeConferencia',
          pk: { NUCONF: numeroConferencia, SEQVOL: seqNovo },
          fieldsAndValues: { ORDEM: seqNovo },
        }).catch((e2) => pushErro(`Volume SEQVOL=${vol.seqVol}`, e2 ?? e));
      });
    }

    // Monta estruturas antes do próximo grupo de saves
    const volumesComDim = dados.volumes.filter(
      (v) => v.altura != null || v.largura != null || v.comprimento != null || v.peso != null,
    );

    const leiturasPorvol = new Map<number, typeof leiturasAtivas>();
    for (const l of leiturasAtivas) {
      const seqNovo = seqVolNovo.get(l.seqVol)!;
      if (!leiturasPorvol.has(seqNovo)) leiturasPorvol.set(seqNovo, []);
      leiturasPorvol.get(seqNovo)!.push(l);
    }

    const grupos = new Map<
      string,
      { idProduto: number; controle: string; codvol: string; codbarra: string; qtd: number }
    >();
    for (const l of leiturasAtivas) {
      const key = `${l.idProduto}|${l.controle}`;
      if (grupos.has(key)) {
        grupos.get(key)!.qtd += l.qtd;
      } else {
        grupos.set(key, {
          idProduto: l.idProduto,
          controle: l.controle,
          codvol: l.unidade || 'UN',
          codbarra: getCodigoBarra(l.idProduto, l.controle),
          qtd: l.qtd,
        });
      }
    }

    // 2. AD_CUBAGEM + TGFIVC + TGFCOI2 — todos em paralelo (TGFVCF já existe)
    const ivcPromises: Promise<any>[] = [];
    for (const [seqVol, leituras] of leiturasPorvol) {
      leituras.forEach((l, idx) => {
        ivcPromises.push(
          this.datasetSP.save({
            entityName: 'ItemVolumeConferencia',
            fieldsAndValues: {
              NUCONF: numeroConferencia,
              SEQVOL: seqVol,
              SEQITEM: idx + 1,
              CODPROD: l.idProduto,
              CODVOL: l.unidade || 'UN',
              CONTROLE: l.controle?.trim() || ' ',
              CODBARRA: getCodigoBarra(l.idProduto, l.controle),
              QTD: l.qtd,
              QTDVOLPAD: l.qtdVolpad,
              IMPRIMEAUTO: 'N',
            },
          }).catch(async (e) => {
            // Retentativa: tenta update se já existir
            await this.datasetSP.save({
              entityName: 'ItemVolumeConferencia',
              pk: { NUCONF: numeroConferencia, SEQVOL: seqVol, SEQITEM: idx + 1 },
              fieldsAndValues: { CODPROD: l.idProduto, QTD: l.qtd, QTDVOLPAD: l.qtdVolpad },
            }).catch((e2) => pushErro(`TGFIVC PROD=${l.idProduto} VOL=${seqVol}`, e2 ?? e));
          }),
        );
      });
    }

    const coiPromises = [...grupos.values()].map((g, idx) => {
      const controleNorm = g.controle?.trim() || ' ';
      const payload = {
        NUCONF: numeroConferencia,
        SEQCONF: idx + 1,
        CODPROD: g.idProduto,
        CODVOL: g.codvol,
        CONTROLE: controleNorm,
        CODBARRA: g.codbarra,
        QTDCONF: toQtdVolpad(g.idProduto, g.controle, g.qtd),
        QTDCONFVOLPAD: toQtdVolpad(g.idProduto, g.controle, g.qtd),
        DHALTER: dh,
      };
      return this.datasetSP.save({
        entityName: 'DetalhesConferencia',
        fieldsAndValues: payload,
      }).catch(async (e) => {
        this.logger.error('[TGFCOI2 insert error]', e?.message);
        // Retentativa: tenta update se já existir (PK: NUCONF + SEQCONF)
        await this.datasetSP.save({
          entityName: 'DetalhesConferencia',
          pk: { NUCONF: numeroConferencia, SEQCONF: idx + 1 },
          fieldsAndValues: { QTDCONF: toQtdVolpad(g.idProduto, g.controle, g.qtd), QTDCONFVOLPAD: toQtdVolpad(g.idProduto, g.controle, g.qtd), DHALTER: dh },
        }).catch((e2) => pushErro(`TGFCOI2 PROD=${g.idProduto}`, e ?? e2));
      });
    });

    const cubPromises = temAdCubagem ? volumesComDim.map((vol) =>
      this.datasetSP.save({
        entityName: 'AD_CUBAGEM',
        fieldsAndValues: {
          NUCONF: numeroConferencia,
          SEQVOL: seqVolNovo.get(vol.seqVol),
          ALTURA: vol.altura,
          LARGURA: vol.largura,
          COMPRIMENTO: vol.comprimento,
          PESO: vol.peso,
        },
      }).catch(async (e) => {
        await this.datasetSP.save({
          entityName: 'AD_CUBAGEM',
          pk: { NUCONF: numeroConferencia, SEQVOL: seqVolNovo.get(vol.seqVol) },
          fieldsAndValues: { ALTURA: vol.altura, LARGURA: vol.largura, COMPRIMENTO: vol.comprimento, PESO: vol.peso },
        }).catch((e2) => pushErro(`Cubagem SEQVOL=${vol.seqVol}`, e2 ?? e));
      }),
    ) : [];

    await Promise.all([...ivcPromises, ...coiPromises, ...cubPromises]);

    if (erros.length) {
      throw new BadRequestException(
        `Finalização concluída com erros nos seguintes registros: ${erros.join(', ')}. Os dados locais foram preservados para nova tentativa.`,
      );
    }

    // 3. Corte e finalização via Sankhya — processa divergências, gera financeiro e carimba DHFINCONF
    const qtdVol = dados.volumes.length;
    await this.chamarConferenciaSP('ConferenciaSP.cortar', {
      nuNota: sessao.numeroUnico,
      peso: pesoBrutoTotal,
      qtdVol,
    });
    await this.chamarConferenciaSP('ConferenciaSP.finalizarConferencia', {
      nuConf: String(numeroConferencia),
      peso: pesoBrutoTotal,
      qtdVol,
    }).catch((e) => this.logger.warn('[finalizarConferencia] non-fatal:', e?.message));

    // STATUS='F' — garante o fechamento local mesmo se finalizarConferencia não o fizer
    const finDet: Record<string, any> = { STATUS: 'F', DHFINCONF: dh };
    if (temAdCubagem) finDet['QTDVOL'] = qtdVol;
    await comRetry(() =>
      this.datasetSP.save({
        entityName: 'CabecalhoConferencia',
        pk: { NUCONF: numeroConferencia },
        fieldsAndValues: finDet,
      })
    );
    const tgfcabDet: Record<string, any> = {};
    if (temAdCubagem) tgfcabDet['QTDVOL'] = qtdVol;
    if (pesoBrutoTotal > 0) tgfcabDet['PESOBRUTOMANUAL'] = pesoBrutoTotal;
    if (Object.keys(tgfcabDet).length > 0) {
      this.datasetSP.save({
        entityName: 'CabecalhoNota',
        pk: { NUNOTA: dados.numeroUnico },
        fieldsAndValues: tgfcabDet,
      }).catch(() => this.logger.warn('[TGFCAB] falhou (non-blocking)'));
    }

    await this.atualizarObservacaoNota(dados.numeroUnico, nomeUsuario)
      .catch(() => this.logger.warn('[TGFCAB OBSERVACAO] falhou (non-blocking)'));

    if (temAdCubagem && volumesComDim.length > 0) {
      const dimAgrupado = new Map<string, { qtd: number; altura?: number | null; largura?: number | null; comprimento?: number | null; peso?: number | null }>();
      for (const v of volumesComDim) {
        const key = `${v.altura}|${v.largura}|${v.comprimento}|${v.peso}`;
        const ex = dimAgrupado.get(key);
        if (ex) ex.qtd++;
        else dimAgrupado.set(key, { qtd: 1, altura: v.altura, largura: v.largura, comprimento: v.comprimento, peso: v.peso });
      }
      await this.gravarRelatorioCubagem(dados.numeroUnico, [...dimAgrupado.values()], dados.volumes.length)
        .catch(() => this.logger.warn('[AD_RELATORIOCUB] falhou (non-blocking)'));
    }

    await this.sessaoService.marcarFinalizada(sessao.id);

    return { qtdVol, numeroConferencia };
  }

  async getTopsParaFaturamento(tipmov: string): Promise<{ codTipOper: number; descricao: string }[]> {
    const raw = await this.loadRecordsClient.loadRecords({
      rootEntity: 'TipoOperacao',
      fieldset: 'CODTIPOPER,DESCROPER',
      criteria: { expression: "TIPMOV = ? AND ATIVO = 'S'", parameters: [{ value: tipmov, type: 'S' }] },
      limit: 100,
    });
    const rows = this.loadRecordsClient.parseEntities(raw);
    return rows.map((r: any) => ({
      codTipOper: Number(r.CODTIPOPER),
      descricao: String(r.DESCROPER ?? ''),
    }));
  }

  async faturarNota(nunota: number, codTipOper: number, serie: string): Promise<void> {
    const path = `/mgecom/service.sbr?serviceName=SelecaoDocumentoSP.faturar&outputType=json`;
    const hoje = new Date();
    const dtFaturamento = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
    const body = {
      serviceName: 'SelecaoDocumentoSP.faturar',
      requestBody: {
        notas: {
          codTipOper,
          dtFaturamento,
          tipoFaturamento: 'FaturamentoNormal',
          dataValidada: true,
          notasComMoeda: {},
          nota: [{ $: nunota }],
          serie: serie ?? '1',
          faturarTodosItens: true,
          umaNotaParaCada: 'false',
          ehWizardFaturamento: true,
          dtFixaVenc: '',
          ehPedidoWeb: false,
          nfeDevolucaoViaRecusa: false,
        },
      },
    };
    const res = await this.gateway.client.post(path, body);
    if (res.data?.status !== '1') {
      const msg = res.data?.statusMessage ?? 'Falha ao faturar nota';
      throw new BadRequestException(msg);
    }
  }
}
