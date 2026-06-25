import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

// ─── Tipos do cache em memória ───────────────────────────────────────────────

type UmaCached = {
  codUma: string;
  descricao: string;
  peso: number | null;
  codVol: string | null;
  codBarra: string | null;
  padrao: boolean;
};

type ItemCached = {
  idProduto: number;
  nomeProduto: string;
  complemento: string | null;
  referencia: string | null;
  unidade: string;
  controle: string;
  tipControle: string | null;
  decQtd: number;
  pesoBruto: number;
  divideMult: string | null;
  fatorConv: number | null;
  lisControles: string | null;
  usaConfPeso: boolean;
  pesavel: boolean;
  umas: UmaCached[];
};

type CodigoCached = {
  codigoBarra: string;
  idProduto: number;
  unidade: string | null;
  controle: string;
  quantidade: number | null;
  divideMult: string | null;
  origem: string;
};

type SessaoCache = {
  buscarCodigoBarraPor: string;
  codigosCarregados: boolean;
  itens: ItemCached[];
  codigos: CodigoCached[];
};

@Injectable()
export class SessaoService {
  constructor(private readonly prisma: PrismaService) {}

  // Cache em memória keyed por sessaoId.
  // Evita round-trip ao banco a cada scan — cada beep passa a ser O(1) em memória.
  // Invalidado na finalização e regenerado na criação da sessão.
  // Cache miss (ex: restart do servidor) → fallback gracioso ao banco.
  private readonly sessaoCache = new Map<string, SessaoCache>();

  // ─────────────────────────────────────────────
  // Lookup
  // ─────────────────────────────────────────────

  async buscarPorNota(numeroUnico: number) {
    return this.prisma.sessaoConferencia.findUnique({ where: { numeroUnico } });
  }

  async buscarPorConferencia(numeroConferencia: number) {
    return this.prisma.sessaoConferencia.findFirst({ where: { numeroConferencia } });
  }

  async listarNumerosUnicosAtivos(): Promise<Set<number>> {
    const sessoes = await this.prisma.sessaoConferencia.findMany({
      where: { status: 'A' },
      select: { numeroUnico: true },
    });
    return new Set(sessoes.map((s) => s.numeroUnico));
  }

  async listarSessionsFinalizadas(): Promise<{ numeroUnico: number; numeroConferencia: number }[]> {
    const sessoes = await this.prisma.sessaoConferencia.findMany({
      where: { status: 'F' },
      select: { numeroUnico: true, numeroConferencia: true },
      orderBy: { criadoEm: 'desc' },
    });
    return sessoes;
  }

  // ─────────────────────────────────────────────
  // Criação de sessão (chamado no iniciar-conferencia)
  // ─────────────────────────────────────────────

  async criarSessao(params: {
    numeroUnico: number;
    numeroConferencia: number;
    idUsuario: number;
    codigoTipoMovimento?: string;
    descricaoTipoOperacao?: string;
    formacaoVolumes?: string | null;
    buscarCodigoBarraPor?: string;
    nomeParceiro?: string | null;
    itens: any[];
    codigos: any[];
  }) {
    const {
      numeroUnico, numeroConferencia, idUsuario,
      codigoTipoMovimento, descricaoTipoOperacao, formacaoVolumes,
      buscarCodigoBarraPor = 'A',
      nomeParceiro,
      itens, codigos,
    } = params;

    // Limpa sessão anterior (finalizada ou travada) se existir
    const anterior = await this.prisma.sessaoConferencia.findUnique({ where: { numeroUnico } });
    if (anterior) {
      await this.prisma.sessaoConferencia.delete({ where: { id: anterior.id } });
      this.sessaoCache.delete(anterior.id);
    }

    // Cria sessão + itens + códigos em uma única transação com bulk inserts (createMany)
    // Muito mais rápido que nested creates individuais para pedidos grandes
    const sessaoCriada = await this.prisma.$transaction(async (tx) => {
      const s = await tx.sessaoConferencia.create({
        data: {
          numeroUnico, numeroConferencia, idUsuario,
          codigoTipoMovimento, descricaoTipoOperacao, formacaoVolumes,
          buscarCodigoBarraPor, nomeParceiro: nomeParceiro ?? null, status: 'A',
        },
        select: { id: true },
      });

      const umaData = itens.flatMap((item) =>
        (item.UMAS ?? []).map((u: any) => ({
          sessaoId: s.id,
          idProduto: Number(item.CODPROD),
          codUma: u.codUma,
          descricao: u.descricao,
          peso: u.peso ?? null,
          codVol: u.codVol ?? null,
          codBarra: u.codBarra ?? null,
          padrao: u.padrao,
        })),
      );

      await Promise.all([
        tx.sessaoItem.createMany({
          data: itens.map((item) => ({
            sessaoId: s.id,
            sequencia: Number(item.SEQUENCIA),
            idProduto: Number(item.CODPROD),
            nomeProduto: item.DESCRPROD || '',
            complemento: item.COMPLDESC || null,
            marca: item.MARCA || null,
            referencia: item.REFERENCIA || null,
            unidade: item.CODVOL || 'UN',
            unidadePadrao: item.CODVOL_PADRAO || null,
            controle: item.CONTROLE?.trim() || ' ',
            tipControle: item.TIPCONTEST || null,
            decQtd: Number(item.DECQTD) || 0,
            pesoBruto: Number(item.PESOBRUTO) || 0,
            qtdNeg: Number(item.QTDNEG) || 0,
            qtdEntregue: Number(item.QTDENTREGUE) || 0,
            qtdConferidaSankhya: Number(item.QTDCONFERIDA) || 0,
            qtdConferidaLocal: 0,
            divideMult: item.DIVIDEMULTIPLICA || null,
            fatorConv: item.FATOR_CONVERSAO != null ? Number(item.FATOR_CONVERSAO) : null,
            lisControles: item.LISCONTEST?.trim() || null,
            usaConfPeso: item.UTILICONFPESO === true || item.UTILICONFPESO === 'S',
            pesavel: item.PESAVEL === true || item.PESAVEL === 'S',
            imagem: item.IMAGEM
              ? (item.IMAGEM.startsWith('data:') || item.IMAGEM.startsWith('http')
                  ? item.IMAGEM
                  : `data:image/jpeg;base64,${item.IMAGEM}`)
              : null,
          })),
        }),
        tx.sessaoCodigoBarras.createMany({
          data: [
            ...codigos.map((c) => ({
              sessaoId: s.id,
              codigoBarra: String(c.CODBARRA || c.CODIGO || '').trim(),
              idProduto: Number(c.CODPROD),
              unidade: c.CODVOL || null,
              controle: String(c.CONTROLE ?? ' ').trim() || ' ',
              quantidade: c.QUANTIDADE != null ? Number(c.QUANTIDADE) : null,
              divideMult: c.DIVIDEMULTIPLICA || null,
              origem: c.ORIGEM || 'BAR',
            })),
            { sessaoId: s.id, codigoBarra: '__loaded__', idProduto: 0, origem: 'LOADED', controle: ' ' },
          ],
          skipDuplicates: true,
        }),
        umaData.length > 0
          ? tx.sessaoItemUma.createMany({ data: umaData, skipDuplicates: true })
          : Promise.resolve(),
      ]);

      return s;
    });

    // Popula cache a partir dos params (sem query extra ao banco)
    this.sessaoCache.set(sessaoCriada.id, {
      buscarCodigoBarraPor,
      codigosCarregados: true,
      itens: itens.map((item): ItemCached => ({
        idProduto: Number(item.CODPROD),
        nomeProduto: item.DESCRPROD || '',
        complemento: item.COMPLDESC || null,
        referencia: item.REFERENCIA || null,
        unidade: item.CODVOL || 'UN',
        controle: item.CONTROLE?.trim() || ' ',
        tipControle: item.TIPCONTEST || null,
        decQtd: Number(item.DECQTD) || 0,
        pesoBruto: Number(item.PESOBRUTO) || 0,
        divideMult: item.DIVIDEMULTIPLICA || null,
        fatorConv: item.FATOR_CONVERSAO != null ? Number(item.FATOR_CONVERSAO) : null,
        lisControles: item.LISCONTEST?.trim() || null,
        usaConfPeso: item.UTILICONFPESO === true || item.UTILICONFPESO === 'S',
        pesavel: item.PESAVEL === true || item.PESAVEL === 'S',
        umas: (item.UMAS ?? []).map((u: any): UmaCached => ({
          codUma: u.codUma, descricao: u.descricao, peso: u.peso ?? null,
          codVol: u.codVol ?? null, codBarra: u.codBarra ?? null, padrao: u.padrao,
        })),
      })),
      codigos: codigos.map((c): CodigoCached => ({
        codigoBarra: String(c.CODBARRA || c.CODIGO || '').trim(),
        idProduto: Number(c.CODPROD),
        unidade: c.CODVOL || null,
        controle: String(c.CONTROLE ?? ' ').trim() || ' ',
        quantidade: c.QUANTIDADE != null ? Number(c.QUANTIDADE) : null,
        divideMult: c.DIVIDEMULTIPLICA || null,
        origem: c.ORIGEM || 'BAR',
      })),
    });
  }

  // ─────────────────────────────────────────────
  // Resolução de código de barras (cache-first)
  // ─────────────────────────────────────────────

  async resolverCodigoBarras(sessaoId: string, codigoBarra: string) {
    let cached = this.sessaoCache.get(sessaoId);

    // Cache miss (ex: após restart do servidor) — busca do banco e popula cache
    if (!cached) {
      const sessao = await this.prisma.sessaoConferencia.findUnique({
        where: { id: sessaoId },
        select: {
          buscarCodigoBarraPor: true,
          codigos: true,
          itensUma: true,
          itens: {
            select: {
              idProduto: true, nomeProduto: true, complemento: true, referencia: true,
              unidade: true, controle: true, tipControle: true, decQtd: true,
              pesoBruto: true, divideMult: true, fatorConv: true, lisControles: true,
              usaConfPeso: true, pesavel: true,
            },
          },
        },
      });
      if (!sessao) return null;

      const umasByProd = new Map<number, UmaCached[]>();
      for (const u of sessao.itensUma) {
        if (!umasByProd.has(u.idProduto)) umasByProd.set(u.idProduto, []);
        umasByProd.get(u.idProduto)!.push({
          codUma: u.codUma, descricao: u.descricao, peso: u.peso,
          codVol: u.codVol, codBarra: u.codBarra, padrao: u.padrao,
        });
      }

      cached = {
        buscarCodigoBarraPor: sessao.buscarCodigoBarraPor,
        codigosCarregados: sessao.codigos.some((c) => c.origem === 'LOADED'),
        itens: sessao.itens.map(i => ({ ...i, pesavel: i.pesavel ?? false, umas: umasByProd.get(i.idProduto) ?? [] })),
        codigos: sessao.codigos,
      };
      this.sessaoCache.set(sessaoId, cached);
    }

    const { buscarCodigoBarraPor: regra, itens, codigos } = cached;

    const buildResult = (
      item: ItemCached,
      codvol: string | null,
      controle: string,
      fatorConv: number | null,
      divideMult: string | null,
    ) => ({
      idProduto: item.idProduto,
      nomeProduto: item.nomeProduto,
      complemento: item.complemento,
      referencia: item.referencia,
      unidadeBase: item.unidade,
      codvol: codvol || item.unidade,
      controle,
      tipControle: item.tipControle,
      decQtd: item.decQtd,
      pesoBruto: item.pesoBruto,
      fatorConv,
      divideMult,
      lisControles: item.lisControles,
      usaConfPeso: item.usaConfPeso ?? false,
      pesavel: item.pesavel ?? false,
      umas: item.umas ?? [],
    });

    const findItem = (idProduto: number, controle?: string | null) => {
      const norm = controle?.trim() || ' ';
      if (norm !== ' ') {
        return itens.find((i) => i.idProduto === idProduto && i.controle === norm)
          ?? itens.find((i) => i.idProduto === idProduto);
      }
      return itens.find((i) => i.idProduto === idProduto);
    };

    const findCodigo = (origem: string, extra?: (c: CodigoCached) => boolean) =>
      codigos.find((c) => c.codigoBarra === codigoBarra && c.origem === origem && (!extra || extra(c)));

    const voaFatorPara = (idProduto: number, codvol: string | null) =>
      codigos.find((c) => c.idProduto === idProduto && c.unidade === codvol && c.origem === 'VOA');

    const controleEst = (est: CodigoCached) => {
      const c = est.controle?.trim() || ' ';
      return c !== ' ' ? c : ' ';
    };

    // ─── C: Código do produto ───────────────────────────────────────────────
    if (regra === 'C') {
      const codprod = parseInt(codigoBarra.trim(), 10);
      if (!isNaN(codprod)) {
        const item = itens.find((i) => i.idProduto === codprod);
        if (item) return buildResult(item, null, ' ', null, null);
      }
      return null;
    }

    // ─── R: Referência ──────────────────────────────────────────────────────
    if (regra === 'R') {
      const itemByRef = itens.find(
        (i) => i.referencia && i.referencia.trim() === codigoBarra.trim(),
      );
      if (itemByRef) return buildResult(itemByRef, null, ' ', null, null);

      const bar = findCodigo('BAR');
      if (bar) {
        const item = findItem(bar.idProduto);
        if (item) return buildResult(item, null, ' ', null, null);
      }
      return null;
    }

    // ─── U: Unidade alternativa ─────────────────────────────────────────────
    if (regra === 'U') {
      const voa = findCodigo('VOA');
      if (voa) {
        const item = findItem(voa.idProduto);
        if (item) return buildResult(item, voa.unidade, ' ', voa.quantidade, voa.divideMult);
      }
      const bar = findCodigo('BAR', (c) => !!c.unidade);
      if (bar) {
        const item = findItem(bar.idProduto);
        if (item && bar.unidade !== item.unidade) {
          const fator = voaFatorPara(bar.idProduto, bar.unidade);
          return buildResult(item, bar.unidade, ' ', fator?.quantidade ?? null, fator?.divideMult ?? null);
        }
      }
      return null;
    }

    // ─── E: Estoque ─────────────────────────────────────────────────────────
    if (regra === 'E') {
      const est = findCodigo('EST');
      if (est) {
        const item = findItem(est.idProduto, controleEst(est));
        if (item) return buildResult(item, null, controleEst(est), null, null);
      }
      const byControleE = itens.find(
        (i) => i.controle && i.controle.trim() !== ' ' && i.controle.trim() === codigoBarra.trim(),
      );
      if (byControleE) return buildResult(byControleE, null, byControleE.controle, null, null);
      return null;
    }

    // ─── A: Automático ──────────────────────────────────────────────────────
    const est = findCodigo('EST');
    if (est) {
      const item = findItem(est.idProduto, controleEst(est));
      if (item) return buildResult(item, null, controleEst(est), null, null);
    }

    const voa = findCodigo('VOA');
    if (voa) {
      const item = findItem(voa.idProduto);
      if (item) return buildResult(item, voa.unidade, ' ', voa.quantidade, voa.divideMult);
    }

    const barComUnit = findCodigo('BAR', (c) => !!c.unidade);
    if (barComUnit) {
      const item = findItem(barComUnit.idProduto);
      if (item) {
        const fator = voaFatorPara(barComUnit.idProduto, barComUnit.unidade);
        return buildResult(item, barComUnit.unidade, ' ', fator?.quantidade ?? null, fator?.divideMult ?? null);
      }
    }

    const barSemUnit = findCodigo('BAR', (c) => !c.unidade);
    if (barSemUnit) {
      const item = findItem(barSemUnit.idProduto);
      if (item) return buildResult(item, null, ' ', null, null);
    }

    const itemByRef = itens.find(
      (i) => i.referencia && i.referencia.trim() === codigoBarra.trim(),
    );
    if (itemByRef) return buildResult(itemByRef, null, ' ', null, null);

    const itemByControle = itens.find(
      (i) => i.controle && i.controle.trim() !== ' ' && i.controle.trim() === codigoBarra.trim(),
    );
    if (itemByControle) return buildResult(itemByControle, null, itemByControle.controle, null, null);

    return null;
  }

  async contarCodigos(sessaoId: string): Promise<number> {
    return this.prisma.sessaoCodigoBarras.count({ where: { sessaoId } });
  }

  async jaCarregouCodigos(sessaoId: string): Promise<boolean> {
    const cached = this.sessaoCache.get(sessaoId);
    if (cached) return cached.codigosCarregados;

    // Fallback ao banco se não estiver em cache (ex: restart)
    const sentinel = await this.prisma.sessaoCodigoBarras.findFirst({
      where: { sessaoId, origem: 'LOADED' },
    });
    return !!sentinel;
  }

  async refreshCodigos(sessaoId: string, codigos: any[]) {
    await this.prisma.sessaoCodigoBarras.deleteMany({ where: { sessaoId } });
    await this.prisma.sessaoCodigoBarras.createMany({
      data: [
        ...codigos.map((c) => ({
          sessaoId,
          codigoBarra: String(c.CODBARRA || c.CODIGO || '').trim(),
          idProduto: Number(c.CODPROD),
          unidade: c.CODVOL || null,
          controle: String(c.CONTROLE ?? ' ').trim() || ' ',
          quantidade: c.QUANTIDADE != null ? Number(c.QUANTIDADE) : null,
          divideMult: c.DIVIDEMULTIPLICA || null,
          origem: c.ORIGEM || 'BAR',
        })),
        { sessaoId, codigoBarra: '__loaded__', idProduto: 0, origem: 'LOADED', controle: ' ' },
      ],
      skipDuplicates: true,
    });

    // Atualiza cache
    const cached = this.sessaoCache.get(sessaoId);
    if (cached) {
      cached.codigos = codigos.map((c): CodigoCached => ({
        codigoBarra: String(c.CODBARRA || c.CODIGO || '').trim(),
        idProduto: Number(c.CODPROD),
        unidade: c.CODVOL || null,
        controle: String(c.CONTROLE ?? ' ').trim() || ' ',
        quantidade: c.QUANTIDADE != null ? Number(c.QUANTIDADE) : null,
        divideMult: c.DIVIDEMULTIPLICA || null,
        origem: c.ORIGEM || 'BAR',
      }));
      cached.codigosCarregados = true;
    }
  }

  async marcarFinalizada(sessaoId: string) {
    await this.prisma.sessaoConferencia.update({
      where: { id: sessaoId },
      data: { status: 'F', dtFechamento: new Date() },
    });
    this.sessaoCache.delete(sessaoId);
  }

  async excluirSessao(sessaoId: string) {
    await this.prisma.sessaoConferencia.delete({ where: { id: sessaoId } });
    this.sessaoCache.delete(sessaoId);
  }

  // ─────────────────────────────────────────────
  // Leituras (barcode scan)
  // ─────────────────────────────────────────────

  async registrarLeitura(params: {
    sessaoId: string;
    seqVol: number;
    idProduto: number;
    unidade: string;
    controle: string;
    codigoBarras?: string;
    qtd: number;
    qtdVolpad: number;
    peso?: number;
  }) {
    const { sessaoId, seqVol, idProduto, unidade, controle, codigoBarras, qtd, qtdVolpad, peso } = params;
    const controleNorm = controle?.trim() || ' ';

    await this.garantirVolume(sessaoId, seqVol);

    await this.prisma.sessaoLeitura.create({
      data: { sessaoId, seqVol, idProduto, unidade, controle: controleNorm, codigoBarras: codigoBarras || null, qtd, qtdVolpad, peso: peso ?? null },
    });

    await this.recalcularQtdItem(sessaoId, idProduto, controleNorm);
  }

  async devolverItem(sessaoId: string, idProduto: number, controle: string) {
    const controleNorm = controle?.trim() || ' ';

    await this.prisma.sessaoLeitura.deleteMany({ where: { sessaoId, idProduto, controle: controleNorm } });
    await this.prisma.sessaoItem.updateMany({
      where: { sessaoId, idProduto, controle: controleNorm },
      data: { qtdConferidaLocal: 0 },
    });

    await this.limparVolumesVazios(sessaoId);
  }

  private async recalcularQtdItem(sessaoId: string, idProduto: number, controle: string) {
    const agg = await this.prisma.sessaoLeitura.aggregate({
      where: { sessaoId, idProduto, controle },
      _sum: { qtd: true },
    });
    const totalLido = Number(agg._sum.qtd ?? 0);

    const items = await this.prisma.sessaoItem.findMany({
      where: { sessaoId, idProduto, controle },
      orderBy: { sequencia: 'asc' },
      select: { id: true, qtdNeg: true },
    });

    if (items.length <= 1) {
      await this.prisma.sessaoItem.updateMany({
        where: { sessaoId, idProduto, controle },
        data: { qtdConferidaLocal: totalLido },
      });
      return;
    }

    // Mesmo produto + controle em linhas distintas: preenche sequencialmente
    let restante = totalLido;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isUltimo = i === items.length - 1;
      const alloc = isUltimo ? restante : Math.min(restante, Number(item.qtdNeg));
      await this.prisma.sessaoItem.update({
        where: { id: item.id },
        data: { qtdConferidaLocal: alloc },
      });
      restante = Math.max(0, restante - alloc);
    }
  }

  // ─────────────────────────────────────────────
  // Volumes
  // ─────────────────────────────────────────────

  async garantirVolume(sessaoId: string, seqVol: number) {
    const existe = await this.prisma.sessaoVolume.findUnique({
      where: { sessaoId_seqVol: { sessaoId, seqVol } },
    });
    if (existe) return existe;

    const agg = await this.prisma.sessaoVolume.aggregate({
      where: { sessaoId },
      _max: { ordem: true },
    });

    return this.prisma.sessaoVolume.create({
      data: { sessaoId, seqVol, ordem: (agg._max.ordem ?? 0) + 1 },
    });
  }

  async removerVolume(sessaoId: string, seqVol: number) {
    await this.prisma.sessaoVolume.deleteMany({ where: { sessaoId, seqVol } });
  }

  async moverItemVolume(sessaoId: string, idProduto: number, controle: string, seqVolOrigem: number | undefined, seqVolDestino: number, qtd?: number) {
    const controleNorm = controle?.trim() || ' ';
    await this.garantirVolume(sessaoId, seqVolDestino);

    const where = {
      sessaoId,
      idProduto,
      controle: controleNorm,
      ...(seqVolOrigem != null ? { seqVol: seqVolOrigem } : {}),
    };

    if (qtd == null) {
      await this.prisma.sessaoLeitura.updateMany({ where, data: { seqVol: seqVolDestino } });
    } else {
      const exemplo = await this.prisma.sessaoLeitura.findFirst({ where });
      if (!exemplo) return;

      const agg = await this.prisma.sessaoLeitura.aggregate({ where, _sum: { qtd: true } });
      const totalOrigem = agg._sum.qtd ?? 0;
      const qtdMover = Math.min(Math.max(qtd, 0), totalOrigem);
      const qtdRestante = Number((totalOrigem - qtdMover).toFixed(5));

      await this.prisma.sessaoLeitura.deleteMany({ where });

      await this.prisma.sessaoLeitura.create({
        data: { sessaoId, seqVol: seqVolDestino, idProduto, controle: controleNorm, unidade: exemplo.unidade, qtd: qtdMover, qtdVolpad: qtdMover },
      });

      if (qtdRestante > 0 && seqVolOrigem != null) {
        await this.prisma.sessaoLeitura.create({
          data: { sessaoId, seqVol: seqVolOrigem, idProduto, controle: controleNorm, unidade: exemplo.unidade, qtd: qtdRestante, qtdVolpad: qtdRestante },
        });
      }
    }

    await this.limparVolumesVazios(sessaoId);
  }

  async atualizarDimensoesVolume(params: {
    sessaoId: string;
    seqVol: number;
    altura?: number;
    largura?: number;
    comprimento?: number;
    peso?: number;
  }) {
    const { sessaoId, seqVol, ...dims } = params;
    await this.garantirVolume(sessaoId, seqVol);
    await this.prisma.sessaoVolume.update({
      where: { sessaoId_seqVol: { sessaoId, seqVol } },
      data: dims,
    });
  }

  async criarVolumesLote(params: {
    sessaoId: string;
    quantidade: number;
    altura?: number;
    largura?: number;
    comprimento?: number;
    peso?: number;
  }) {
    const { sessaoId, quantidade, ...dims } = params;

    const agg = await this.prisma.sessaoVolume.aggregate({
      where: { sessaoId },
      _max: { seqVol: true, ordem: true },
    });

    let nextSeq = (agg._max.seqVol ?? 0) + 1;
    let nextOrdem = (agg._max.ordem ?? 0) + 1;

    await this.prisma.sessaoVolume.createMany({
      data: Array.from({ length: quantidade }).map(() => ({
        sessaoId,
        seqVol: nextSeq++,
        ordem: nextOrdem++,
        ...dims,
      })),
    });
  }

  async removerVolumesLote(params: {
    sessaoId: string;
    altura?: number;
    largura?: number;
    comprimento?: number;
    peso?: number;
  }) {
    const { sessaoId, ...dims } = params;
    await this.prisma.sessaoVolume.deleteMany({ where: { sessaoId, ...dims } });
  }

  private async limparVolumesVazios(sessaoId: string) {
    const comLeituras = await this.prisma.sessaoLeitura.groupBy({
      by: ['seqVol'],
      where: { sessaoId },
    });
    const comDimensoes = await this.prisma.sessaoVolume.findMany({
      where: {
        sessaoId,
        OR: [{ altura: { not: null } }, { largura: { not: null } }, { comprimento: { not: null } }, { peso: { not: null } }],
      },
      select: { seqVol: true },
    });

    const ativos = new Set([...comLeituras.map((v) => v.seqVol), ...comDimensoes.map((v) => v.seqVol)]);

    await this.prisma.sessaoVolume.deleteMany({
      where: { sessaoId, seqVol: { notIn: ativos.size ? [...ativos] : [-1] } },
    });
  }

  // ─────────────────────────────────────────────
  // Consultas (lidas pelo frontend via endpoints existentes)
  // ─────────────────────────────────────────────

  // Retorna apenas {idProduto, imagem} sem o restante dos campos — para lazy loading no frontend
  async getImagensItens(sessaoId: string) {
    const itens = await this.prisma.sessaoItem.findMany({
      where: { sessaoId },
      select: { idProduto: true, imagem: true },
    });
    return itens
      .filter((i) => i.imagem)
      .map((i) => ({ idProduto: i.idProduto, imagem: i.imagem }));
  }

  async getItensPedido(sessaoId: string) {
    // Imagens excluídas aqui — são carregadas em lazy load pelo frontend via /imagens-itens
    const [itens, codigos] = await Promise.all([
      this.prisma.sessaoItem.findMany({
        where: { sessaoId },
        orderBy: { sequencia: 'asc' },
        select: {
          id: true, sessaoId: true, sequencia: true, idProduto: true,
          nomeProduto: true, complemento: true, marca: true, referencia: true,
          unidade: true, unidadePadrao: true, controle: true, tipControle: true, decQtd: true,
          pesoBruto: true, qtdNeg: true, qtdEntregue: true,
          qtdConferidaSankhya: true, qtdConferidaLocal: true,
          divideMult: true, fatorConv: true, lisControles: true, usaConfPeso: true, pesavel: true,
        },
      }),
      this.prisma.sessaoCodigoBarras.findMany({ where: { sessaoId } }),
    ]);

    const result: any[] = [];

    for (const item of itens) {
      const fator = item.fatorConv ?? 1;

      // Sankhya armazena TGFITE.QTDNEG sempre na unidade PADRÃO.
      // A quantidade comercial é derivada: pad → comercial
      // M: comercial = padrão / fator  |  D: comercial = padrão * fator
      const qtdPadrao = item.qtdNeg;
      let qtdComercial = item.qtdNeg;
      if (item.divideMult === 'M' && fator !== 0) qtdComercial = item.qtdNeg / fator;
      else if (item.divideMult === 'D') qtdComercial = item.qtdNeg * fator;

      // Conferidas: qtdConferidaSankhya (TGFITE.QTDCONFERIDA) e qtdConferidaLocal (sessaoLeitura.qtd)
      // ambas em unidade PADRÃO.
      const qtdPadraoConferida = item.qtdConferidaSankhya + item.qtdConferidaLocal;

      if (Number(qtdPadrao.toFixed(5)) <= Number(qtdPadraoConferida.toFixed(5)) && item.qtdConferidaLocal === 0) continue;

      let qtdComercialSankhya = item.qtdConferidaSankhya;
      if (item.divideMult === 'M' && fator !== 0) qtdComercialSankhya = item.qtdConferidaSankhya / fator;
      else if (item.divideMult === 'D') qtdComercialSankhya = item.qtdConferidaSankhya * fator;

      let qtdComercialLocal = item.qtdConferidaLocal;
      if (item.divideMult === 'M' && fator !== 0) qtdComercialLocal = item.qtdConferidaLocal / fator;
      else if (item.divideMult === 'D') qtdComercialLocal = item.qtdConferidaLocal * fator;

      const qtdComercialConferida = qtdComercialSankhya + qtdComercialLocal;

      const itemCodigos = codigos
        .filter((c) => c.idProduto === item.idProduto && c.controle === item.controle)
        .map((c) => c.codigoBarra);

      result.push({
        idProduto: item.idProduto,
        nomeProduto: item.nomeProduto,
        complemento: item.complemento,
        marca: item.marca,
        referencia: item.referencia,
        unidadeComercial: item.unidade,
        unidadePadrao: item.unidadePadrao ?? item.unidade,
        controle: item.controle,
        tipControle: item.tipControle ?? null,
        quantidadeComercial: Number(qtdComercial.toFixed(5)),
        quantidadePadrao: Number(qtdPadrao.toFixed(5)),
        quantidadeComercialConferida: Number(qtdComercialConferida.toFixed(5)),
        quantidadePadraoConferida: Number(qtdPadraoConferida.toFixed(5)),
        codigoBarras: [...new Set(itemCodigos)],
        imagem: null,
        lisControles: item.lisControles ?? null,
        usaConfPeso: item.usaConfPeso,
        pesavel: item.pesavel,
        sequencia: item.sequencia,
      });
    }

    return result;
  }

  async getItensConferidos(sessaoId: string) {
    const grupos = await this.prisma.sessaoLeitura.groupBy({
      by: ['idProduto', 'controle'],
      where: { sessaoId },
      _sum: { qtd: true },
    });

    return grupos.map((g) => ({
      idProduto: g.idProduto,
      controle: g.controle,
      quantidadePadrao: g._sum.qtd ?? 0,
    }));
  }

  async getVolumesDetalhados(sessaoId: string) {
    const volumes = await this.prisma.sessaoVolume.findMany({
      where: { sessaoId },
      orderBy: { seqVol: 'asc' },
    });

    const leituras = await this.prisma.sessaoLeitura.findMany({ where: { sessaoId } });
    const itens = await this.prisma.sessaoItem.findMany({ where: { sessaoId } });

    return volumes.map((vol) => {
      const volLeituras = leituras.filter((l) => l.seqVol === vol.seqVol);

      const volItens = volLeituras.map((l) => {
        const item = itens.find((i) => i.idProduto === l.idProduto && i.controle === l.controle);
        const fator = item?.fatorConv ?? 1;
        // Conversão padrão→alt (inverso de alt→pad): M→(pad/fator=alt), D→(pad×fator=alt)
        let qtdBase = l.qtd;
        if (item?.divideMult === 'M' && fator !== 0) qtdBase = l.qtd / fator;
        else if (item?.divideMult === 'D') qtdBase = l.qtd * fator;

        return {
          idProduto: l.idProduto,
          descricaoProduto: item?.nomeProduto ?? '',
          imagem: item?.imagem || null,
          quantidadePadrao: l.qtd,
          quantidadeComercial: Number(qtdBase.toFixed(5)),
          unidade: l.unidade,
          controle: l.controle,
        };
      });

      const agrupados = new Map<string, (typeof volItens)[0]>();
      for (const it of volItens) {
        const key = `${it.idProduto}|${it.controle}`;
        if (agrupados.has(key)) {
          const existing = agrupados.get(key)!;
          existing.quantidadePadrao += it.quantidadePadrao;
          existing.quantidadeComercial += it.quantidadeComercial;
        } else {
          agrupados.set(key, { ...it });
        }
      }

      return {
        numeroVolume: vol.seqVol,
        altura: vol.altura ?? null,
        largura: vol.largura ?? null,
        comprimento: vol.comprimento ?? null,
        peso: vol.peso ?? null,
        itens: [...agrupados.values()],
      };
    });
  }

  async getVolumesNaoDetalhados(sessaoId: string) {
    const volumes = await this.prisma.sessaoVolume.findMany({
      where: {
        sessaoId,
        OR: [{ altura: { not: null } }, { largura: { not: null } }, { comprimento: { not: null } }, { peso: { not: null } }],
      },
    });

    const groups = new Map<string, { count: number; altura: number | null; largura: number | null; comprimento: number | null; peso: number | null }>();
    for (const vol of volumes) {
      const key = `${vol.altura}|${vol.largura}|${vol.comprimento}|${vol.peso}`;
      if (groups.has(key)) {
        groups.get(key)!.count++;
      } else {
        groups.set(key, { count: 1, altura: vol.altura, largura: vol.largura, comprimento: vol.comprimento, peso: vol.peso });
      }
    }

    return [...groups.values()].map((g) => ({
      numeroVolume: null,
      quantidadeLote: g.count,
      altura: g.altura,
      largura: g.largura,
      comprimento: g.comprimento,
      peso: g.peso,
      itens: [],
    }));
  }

  async isCubagemNaoDetalhada(sessaoId: string) {
    const sessao = await this.prisma.sessaoConferencia.findUnique({ where: { id: sessaoId } });
    return sessao?.formacaoVolumes === 'T' || sessao?.formacaoVolumes === 'S';
  }

  async atualizarDimensoesVolumeLote(params: {
    sessaoId: string;
    alturaAntiga?: number;
    larguraAntiga?: number;
    comprimentoAntigo?: number;
    pesoAntigo?: number;
    altura?: number;
    largura?: number;
    comprimento?: number;
    peso?: number;
  }) {
    const { sessaoId, alturaAntiga, larguraAntiga, comprimentoAntigo, pesoAntigo, altura, largura, comprimento, peso } = params;
    await this.prisma.sessaoVolume.updateMany({
      where: {
        sessaoId,
        altura: alturaAntiga ?? null,
        largura: larguraAntiga ?? null,
        comprimento: comprimentoAntigo ?? null,
        peso: pesoAntigo ?? null,
      },
      data: {
        altura: altura ?? null,
        largura: largura ?? null,
        comprimento: comprimento ?? null,
        peso: peso ?? null,
      },
    });
  }

  // ─────────────────────────────────────────────
  // Finalização — dados para batch-write ao Sankhya
  // ─────────────────────────────────────────────

  async getDadosFinalizacao(sessaoId: string) {
    return this.prisma.sessaoConferencia.findUnique({
      where: { id: sessaoId },
      include: {
        itens: true,
        volumes: { orderBy: { seqVol: 'asc' } },
        leituras: { orderBy: { criadoEm: 'asc' } },
        codigos: { where: { origem: { not: 'LOADED' } } },
      },
    });
  }

  async incrementarQtdVolSimplificado(sessaoId: string, qtdVol: number) {
    await this.prisma.$executeRaw`
      UPDATE "SessaoConferencia"
      SET "qtdVol" = COALESCE("qtdVol", 0) + ${qtdVol}
      WHERE id = ${sessaoId}
    `;
  }

  async salvarCubagemSimplificada(sessaoId: string, params: {
    qtdVol: number;
    altura?: number;
    largura?: number;
    comprimento?: number;
    peso?: number;
  }) {
    await this.prisma.sessaoConferencia.update({
      where: { id: sessaoId },
      data: params,
    });
  }
}
