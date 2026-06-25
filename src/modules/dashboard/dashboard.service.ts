import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

type Periodo = 'hoje' | 'semana' | 'mes' | 'custom';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAtividadeAgora() {
    const CINCO_MIN = new Date(Date.now() - 5 * 60 * 1000);

    const recentHbs = await this.prisma.logHeartbeat.findMany({
      where: { criadoEm: { gte: CINCO_MIN } },
      orderBy: { criadoEm: 'desc' },
    });

    const hbByUser = new Map<number, (typeof recentHbs)[0]>();
    for (const hb of recentHbs) {
      if (!hbByUser.has(hb.idUsuario)) hbByUser.set(hb.idUsuario, hb);
    }

    const userIds = [...hbByUser.keys()];
    const separadores = await this.prisma.user.findMany({
      where: { codigo: { in: userIds }, perfil: 'SEPARADOR' },
      select: { codigo: true, nome: true },
    });
    const separadorMap = new Map(separadores.map(u => [u.codigo, u.nome]));

    const atividadeAgora = [...hbByUser.values()]
      .filter(hb => separadorMap.has(hb.idUsuario))
      .map(hb => ({
        idUsuario: hb.idUsuario,
        nomeUsuario: separadorMap.get(hb.idUsuario) ?? `Usuário ${hb.idUsuario}`,
        numeroConferencia: hb.numeroConferencia ?? null,
        minutosAtivo: Math.floor((Date.now() - hb.criadoEm.getTime()) / 60000),
      }));

    return { atividadeAgora, usuariosAtivos: atividadeAgora.length };
  }

  private getPeriodStart(periodo: Periodo): Date {
    const now = new Date();
    if (periodo === 'hoje')   return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (periodo === 'semana') return new Date(now.getTime() - 7  * 24 * 3600 * 1000);
    return new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  }

  async getProdutividade(params: {
    periodo: Periodo;
    idUsuario?: string | null;
    idUsuarioTimeline?: number | null;
    dataInicio?: string | null;
    dataFim?: string | null;
  }) {
    const { periodo, idUsuario, idUsuarioTimeline } = params;

    // Resolve intervalo de datas
    const DATA_MINIMA = new Date('2026-07-26T00:00:00');
    let from: Date;
    let to: Date = new Date();
    if (periodo === 'custom' && params.dataInicio && params.dataFim) {
      from = new Date(params.dataInicio);
      to   = new Date(params.dataFim);
      to.setHours(23, 59, 59, 999);
    } else {
      from = this.getPeriodStart(periodo);
    }
    if (from < DATA_MINIMA) from = DATA_MINIMA;

    // ── Sessões do período ──────────────────────────────────────────────────
    const sessoes = await this.prisma.sessaoConferencia.findMany({
      where: {
        criadoEm: { gte: from, lte: to },
        ...(idUsuario ? { idUsuario: Number(idUsuario) } : {}),
      },
      select: {
        id: true,
        idUsuario: true,
        numeroConferencia: true,
        numeroUnico: true,
        status: true,
        criadoEm: true,
        dtAbertura: true,
        dtFechamento: true,
        itens: { select: { qtdConferidaLocal: true } },
        _count: { select: { leituras: true, volumes: true } },
      },
    });

    const sessoesFin = sessoes.filter(s => s.status === 'F');

    // ── KPIs globais ────────────────────────────────────────────────────────
    const totalConferencias = sessoesFin.length;

    const comTempo = sessoesFin.filter(s =>
      s.dtAbertura && s.dtFechamento &&
      s.dtFechamento.getTime() > s.dtAbertura.getTime(),
    );
    const tempoMedioSegundos = comTempo.length
      ? Math.round(comTempo.reduce((acc, s) =>
          acc + (s.dtFechamento!.getTime() - s.dtAbertura!.getTime()) / 1000, 0) / comTempo.length)
      : 0;

    const totalItensConf = sessoesFin.reduce(
      (acc, s) => acc + s.itens.reduce((a, i) => a + i.qtdConferidaLocal, 0), 0,
    );

    const totalCubagens = sessoesFin.reduce((a, s) => a + s._count.volumes, 0);

    const horaAtual = new Date().getHours();

    // ── Atividade agora (via método compartilhado) ──────────────────────────
    const { atividadeAgora, usuariosAtivos } = await this.getAtividadeAgora();

    // ── Mapa de nomes (para ranking) ─────────────────────────────────────────
    const allUserIds = [...new Set(sessoes.map(s => s.idUsuario))];
    const users = await this.prisma.user.findMany({
      where: { codigo: { in: allUserIds } },
      select: { codigo: true, nome: true, perfil: true },
    });
    const userMap = new Map(users.map(u => [u.codigo, u]));

    // ── Logins no período ───────────────────────────────────────────────────
    const loginGroups = await this.prisma.logLogin.groupBy({
      by: ['idUsuario'],
      where: { criadoEm: { gte: from, lte: to } },
      _count: { id: true },
    });
    const loginMap = new Map(loginGroups.map(l => [l.idUsuario, l._count.id]));

    // ── Ranking ─────────────────────────────────────────────────────────────
    const sessaoUserIds = [...new Set(sessoes.map(s => s.idUsuario))];
    const ranking = sessaoUserIds.map(uid => {
      const us = sessoes.filter(s => s.idUsuario === uid);
      const usFin = us.filter(s => s.status === 'F');
      const usComTempo = usFin.filter(s =>
        s.dtAbertura && s.dtFechamento &&
        s.dtFechamento.getTime() > s.dtAbertura.getTime(),
      );
      const tempoMedio = usComTempo.length
        ? Math.round(usComTempo.reduce((a, s) =>
            a + (s.dtFechamento!.getTime() - s.dtAbertura!.getTime()) / 1000, 0) / usComTempo.length)
        : 0;

      return {
        idUsuario: uid,
        nomeUsuario: userMap.get(uid)?.nome ?? `Usuário ${uid}`,
        totalConferencias: usFin.length,
        tempoMedioSegundos: tempoMedio,
        totalItens: Math.round(usFin.reduce(
          (a, s) => a + s.itens.reduce((b, i) => b + i.qtdConferidaLocal, 0), 0) * 10) / 10,
        totalBipagens: usFin.reduce((a, s) => a + s._count.leituras, 0),
        totalCubagens: usFin.reduce((a, s) => a + s._count.volumes, 0),
        totalLogins: loginMap.get(uid) ?? 0,
      };
    }).sort((a, b) => b.totalConferencias - a.totalConferencias);

    // ── Picos por hora ──────────────────────────────────────────────────────
    const picosMap = new Map<number, number>();
    for (const s of sessoesFin) {
      const hora = s.criadoEm.getHours();
      picosMap.set(hora, (picosMap.get(hora) ?? 0) + 1);
    }
    const picos = Array.from({ length: 24 }, (_, h) => ({
      hora: h,
      total: picosMap.get(h) ?? 0,
    }));

    // ── Heatmap (dia×hora) ──────────────────────────────────────────────────
    // dia: 0=Seg … 4=Sex (sáb/dom ignorados)
    const heatmapMap = new Map<string, number>();
    for (const s of sessoesFin) {
      const dt = s.criadoEm;
      const diaSemana = dt.getDay(); // 0=Dom, 1=Seg … 6=Sáb
      if (diaSemana === 0 || diaSemana === 6) continue;
      const dia  = diaSemana - 1; // 0=Seg … 4=Sex
      const hora = dt.getHours();
      const key  = `${dia}_${hora}`;
      heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + 1);
    }
    const heatmap = [...heatmapMap.entries()].map(([key, total]) => {
      const [dia, hora] = key.split('_').map(Number);
      return { dia, hora, total };
    });

    // ── Linha do tempo ──────────────────────────────────────────────────────
    let linhaDoTempo: any[] = [];
    if (idUsuarioTimeline != null) {
      const tlSessoes = await this.prisma.sessaoConferencia.findMany({
        where: {
          idUsuario: Number(idUsuarioTimeline),
          criadoEm: { gte: from, lte: to },
        },
        orderBy: { criadoEm: 'desc' },
        select: {
          numeroConferencia: true,
          numeroUnico: true,
          nomeParceiro: true,
          status: true,
          criadoEm: true,
          dtAbertura: true,
          dtFechamento: true,
          _count: { select: { itens: true, volumes: true } },
        },
      });

      linhaDoTempo = tlSessoes.map(s => ({
        numeroConferencia: s.numeroConferencia,
        nomeParceiro: s.nomeParceiro ?? `Pedido ${s.numeroUnico}`,
        dtAbertura: s.dtAbertura ?? s.criadoEm,
        dtFechamento: s.dtFechamento ?? null,
        duracaoSegundos:
          s.dtAbertura && s.dtFechamento && s.dtFechamento > s.dtAbertura
            ? Math.round((s.dtFechamento.getTime() - s.dtAbertura.getTime()) / 1000)
            : 0,
        totalItens: s._count.itens,
        totalVolumes: s._count.volumes,
        abandonada: s.status !== 'F',
      }));
    }

    const producaoUltimaHora = picos.find(p => p.hora === horaAtual)?.total ?? 0;

    return {
      usuariosAtivos,
      totalConferencias,
      totalCubagens,
      tempoMedioSegundos,
      totalItens: Math.round(totalItensConf * 10) / 10,
      producaoUltimaHora,
      atividadeAgora,
      ranking,
      picos,
      heatmap,
      linhaDoTempo,
    };
  }
}
