import { BadRequestException, Injectable } from '@nestjs/common';
import { SankhyaLoadRecordsClient } from 'src/http-client/load-records/load-records.client';
import { SankhyaDatasetSPClient } from 'src/http-client/dataset-sp/dataset-sp.client';
import { ConferenciaHelper } from './conferencia.helper';
import { FilaConferenciaFilter, IniciarConferenciaBody } from './dto/conferencia.dto';
import { NumeroConferenciaFilter, NumeroUnicoFilter } from '../dto/model';
import { SessaoService } from '../sessao/sessao.service';

@Injectable()
export class ConferenciaService {
  constructor(
    private readonly loadRecordsClient: SankhyaLoadRecordsClient,
    private readonly conferenciaHelper: ConferenciaHelper,
    private readonly datasetSP: SankhyaDatasetSPClient,
    private readonly sessaoService: SessaoService,
  ) {}

  // ─── Fila (LoadRecords + status do banco local) ────────────────────────────

  async getFilaConferencias(queryParams: FilaConferenciaFilter) {
    const page = Number(queryParams.page ?? 0);
    const perPage = Number(queryParams.perPage ?? 15);

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
    if (queryParams.numeroModial) {
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

    const [raw, activeNums] = await Promise.all([
      this.loadRecordsClient.loadRecords({
        rootEntity: 'CabecalhoNota',
        fieldset: 'NUNOTA,NUMNOTA,NUCONFATUAL,TIPMOV,CODTIPOPER,CODPARC,CODEMP,DTNEG,AD_NUMTALAO,AD_TIPOENTREGA,CODVEND',
        criteria: {
          expression: expressions.join(' AND '),
          parameters: parameters.length ? parameters : undefined,
        },
        joins: [
          { path: 'Parceiro', fieldset: 'NOMEPARC' },
          { path: 'TipoOperacao', fieldset: 'DESCROPER' },
          { path: 'Vendedor', fieldset: 'APELIDO' },
        ],
        offsetPage: page,
        limit: perPage,
      }),
      this.sessaoService.listarNumerosUnicosAtivos(),
    ]);

    const rows = this.loadRecordsClient.parseEntities(raw);
    const hasNextPage = this.loadRecordsClient.hasNextPage(raw);

    // Busca STATUS real do TGFCON2 para conferências que têm NUCONFATUAL
    const nuconfs = rows.map((r) => Number(r.NUCONFATUAL)).filter((n) => n > 0);
    const statusSankhyaMap = new Map<number, string>();
    if (nuconfs.length > 0) {
      try {
        const rawConf = await this.loadRecordsClient.loadRecords({
          rootEntity: 'CabecalhoConferencia',
          fieldset: 'NUCONF,STATUS',
          criteria: {
            expression: `NUCONF IN (${nuconfs.join(',')})`,
          },
        });
        for (const c of this.loadRecordsClient.parseEntities(rawConf)) {
          statusSankhyaMap.set(Number(c.NUCONF), c.STATUS);
        }
      } catch { /* soft-fail: não bloqueia a fila se o Sankhya não responder */ }
    }

    // Busca conferências ativas via NUNOTAORIG para notas sem NUCONFATUAL e sem sessão local
    // (conferência criada no Sankhya sem vincular o NUCONFATUAL na nota)
    const nunotasOrfas = rows
      .filter((r) => !r.NUCONFATUAL && !activeNums.has(Number(r.NUNOTA)))
      .map((r) => Number(r.NUNOTA));
    const nunotasComConfOrfa = new Set<number>();
    if (nunotasOrfas.length > 0) {
      try {
        const rawOrfas = await this.loadRecordsClient.loadRecords({
          rootEntity: 'CabecalhoConferencia',
          fieldset: 'NUNOTAORIG',
          criteria: {
            expression: `NUNOTAORIG IN (${nunotasOrfas.join(',')}) AND STATUS = 'A'`,
          },
        });
        for (const c of this.loadRecordsClient.parseEntities(rawOrfas)) {
          nunotasComConfOrfa.add(Number(c.NUNOTAORIG));
        }
      } catch { /* soft-fail */ }
    }

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

    if (queryParams.codigoStatus) {
      const statusList = queryParams.codigoStatus
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      data = data.filter((d) => statusList.includes(d.codigoStatus));
    }

    return { data, hasNextPage, page, perPage };
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

    let formacaoVolumes: string | null = null;
    if (nucco != null) {
      const ccoRaw = await this.loadRecordsClient.loadRecords({
        rootEntity: 'ConfiguracaoConferencia',
        fieldset: 'FORMACAOVOLUMES',
        criteria: { expression: 'NUCCO = ?', parameters: [{ value: Number(nucco), type: 'I' }] },
        limit: 1,
      }).catch(() => null);
      if (ccoRaw) {
        const ccoRows = this.loadRecordsClient.parseEntities(ccoRaw);
        formacaoVolumes = ccoRows[0]?.FORMACAOVOLUMES ?? null;
      }
    }

    const estaAtiva = sessaoAtiva?.status === 'A';
    return {
      numeroUnico: Number(r.NUNOTA),
      numeroNota: Number(r.NUMNOTA),
      numeroConferencia: estaAtiva ? sessaoAtiva!.numeroConferencia : null,
      codigoStatus: estaAtiva ? 'A' : 'AC',
      codigoTipoMovimento: r.TIPMOV,
      descricaoTipoOperacao: r['TipoOperacao_DESCROPER'] ?? null,
      formacaoVolumes,
      idParceiro: Number(r.CODPARC),
      nomeParceiro: r['Parceiro_RAZAOSOCIAL'] ?? null,
      idVendedor: r.CODVEND ? Number(r.CODVEND) : null,
      nomeVendedor: r['Vendedor_APELIDO'] ?? null,
    };
  }

  // ─── Iniciar (cria registro Sankhya + carrega sessão local) ───────────────

  async postIniciarConferencia({ idUsuario, numeroUnico }: IniciarConferenciaBody) {
    // Se já existe sessão local ativa, retorna sem recriar
    const sessaoExistente = await this.sessaoService.buscarPorNota(numeroUnico);
    if (sessaoExistente?.status === 'A') {
      return { numeroConferencia: sessaoExistente.numeroConferencia };
    }

    // Validações + obtenção do próximo número em paralelo
    const [, , numeroConferencia] = await Promise.all([
      this.conferenciaHelper.verificarStatus({ numeroUnico }),
      this.conferenciaHelper.verificarConferenciaAtiva({ numeroUnico }),
      this.conferenciaHelper.obterNumeroConferencia(),
    ]);

    // Reserva o número — único passo obrigatoriamente sequencial (evita race condition)
    await this.conferenciaHelper.atualizarNumeroConferencia({ numeroConferencia });

    // Tudo que segue é fire-and-forget: a conferência é local, o usuário pode
    // começar a conferir imediatamente. O recovery na finalização garante que
    // o TGFCON2 existe — se falhar aqui, será criado lá.
    this.conferenciaHelper.atualizarCabecalhoConferencia({ numeroUnico, numeroConferencia, idUsuario })
      .catch((err) => console.warn('[atualizarCabecalhoConferencia] falhou (non-blocking):', err?.message));

    this.conferenciaHelper.carregarSessao({ numeroUnico, numeroConferencia, idUsuario })
      .catch((err) => console.error('[carregarSessao] falhou em background:', err?.message));

    this.conferenciaHelper.atualizarCabecalhoNota({ numeroUnico, numeroConferencia })
      .catch((err) => console.warn('[atualizarCabecalhoNota] falhou (non-blocking):', err?.message));

    return { numeroConferencia };
  }

  // ─── Finalizar (batch-write de tudo para o Sankhya) ──────────────────────

  async postFinalizarConferencia({ numeroConferencia }: NumeroConferenciaFilter) {
    const sessao = await this.sessaoService.buscarPorConferencia(numeroConferencia);
    if (!sessao) throw new BadRequestException('Sessão de conferência não encontrada.');

    const dados = await this.sessaoService.getDadosFinalizacao(sessao.id);
    if (!dados) throw new BadRequestException('Dados da sessão não encontrados.');

    const now = new Date();
    const date = now.toISOString().slice(0, 10).split('-').reverse().join('/');
    const hour = now.toISOString().slice(11, 16);
    const dh = `${date} ${hour}`;

    const erros: string[] = [];
    const pushErro = (label: string, e?: any) => {
      const detail = e?.message ? `: ${String(e.message).slice(0, 120)}` : '';
      erros.push(`${label}${detail}`);
    };

    // Recovery: garante que TGFCON2 existe antes de inserir TGFCOI2
    // Tenta INSERT; se falhar (já existe ou validação), tenta UPDATE para confirmar existência.
    // Se ambos falharem, lança erro — sem TGFCON2 o TGFCOI2 quebraria com FK violation.
    await this.datasetSP.save({
      entityName: 'CabecalhoConferencia',
      fieldsAndValues: {
        NUCONF: numeroConferencia,
        CODUSUCONF: sessao.idUsuario,
        DHINICONF: dh,
        NUNOTAORIG: sessao.numeroUnico,
        QTDVOL: 0,
        STATUS: 'A',
      },
    }).catch(async () => {
      await this.datasetSP.save({
        entityName: 'CabecalhoConferencia',
        pk: { NUCONF: numeroConferencia },
        fieldsAndValues: { STATUS: 'A', QTDVOL: 0 },
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
    const toQtdVolpad = (idProduto: number, controle: string, qtd: number): number => {
      const item = itemMap.get(`${idProduto}|${(controle || ' ').trim() || ' '}`);
      if (!item?.fatorConv || !item?.divideMult) return qtd;
      if (item.divideMult === 'D') return qtd / item.fatorConv;
      if (item.divideMult === 'M') return qtd * item.fatorConv;
      return qtd;
    };

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
        console.log('[TGFCOI2 simplificado payload]', JSON.stringify(payload));
        return this.datasetSP.save({ entityName: 'DetalhesConferencia', fieldsAndValues: payload }).catch(async (e) => {
          console.error('[TGFCOI2 insert error]', e?.message);
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
      const cubSimp: Promise<any>[] = cubPreSalvo
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

      await Promise.all([
        this.datasetSP.save({ entityName: 'CabecalhoConferencia', pk: { NUCONF: numeroConferencia }, fieldsAndValues: { STATUS: 'F', DHFINCONF: dh, QTDVOL: totalVol } }).catch(() => pushErro('TGFCON2 finalização')),
        this.datasetSP.save({ entityName: 'CabecalhoNota', pk: { NUNOTA: dados.numeroUnico }, fieldsAndValues: { QTDVOL: totalVol } }).catch(() => pushErro('TGFCAB QTDVOL')),
      ]);

      if (erros.length) {
        throw new BadRequestException(`Finalização concluída com erros nos seguintes registros: ${erros.join(', ')}. Os dados locais foram preservados para nova tentativa.`);
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
      console.log('[TGFCOI2 payload]', JSON.stringify(payload));
      return this.datasetSP.save({
        entityName: 'DetalhesConferencia',
        fieldsAndValues: payload,
      }).catch(async (e) => {
        console.error('[TGFCOI2 insert error]', e?.message);
        // Retentativa: tenta update se já existir (PK: NUCONF + SEQCONF)
        await this.datasetSP.save({
          entityName: 'DetalhesConferencia',
          pk: { NUCONF: numeroConferencia, SEQCONF: idx + 1 },
          fieldsAndValues: { QTDCONF: toQtdVolpad(g.idProduto, g.controle, g.qtd), QTDCONFVOLPAD: toQtdVolpad(g.idProduto, g.controle, g.qtd), DHALTER: dh },
        }).catch((e2) => pushErro(`TGFCOI2 PROD=${g.idProduto}`, e ?? e2));
      });
    });

    const cubPromises = volumesComDim.map((vol) =>
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
    );

    await Promise.all([...ivcPromises, ...coiPromises, ...cubPromises]);

    // 3. Finalizar TGFCON2 + TGFCAB em paralelo
    const qtdVol = dados.volumes.length;
    await Promise.all([
      this.datasetSP.save({
        entityName: 'CabecalhoConferencia',
        pk: { NUCONF: numeroConferencia },
        fieldsAndValues: { STATUS: 'F', DHFINCONF: dh, QTDVOL: qtdVol },
      }).catch(() => pushErro('TGFCON2 finalização')),
      this.datasetSP.save({
        entityName: 'CabecalhoNota',
        pk: { NUNOTA: dados.numeroUnico },
        fieldsAndValues: { QTDVOL: qtdVol },
      }).catch(() => pushErro('TGFCAB QTDVOL')),
    ]);

    if (erros.length) {
      throw new BadRequestException(
        `Finalização concluída com erros nos seguintes registros: ${erros.join(', ')}. Os dados locais foram preservados para nova tentativa.`,
      );
    }

    await this.sessaoService.marcarFinalizada(sessao.id);

    return { qtdVol, numeroConferencia };
  }
}
