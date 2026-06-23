import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Perfil } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { SankhyaLoadRecordsClient } from 'src/http-client/load-records/load-records.client';
import { SankhyaDBExplorerSPClient } from 'src/http-client/db-explorer-sp/db-explorer-sp.client';
import { TenantService } from 'src/core/tenant/tenant.service';
import { tenantStorage } from 'src/core/tenant/tenant.context';

@Injectable()
export class SincronizacaoService {
  private readonly logger = new Logger(SincronizacaoService.name);

  constructor(
    private prisma: PrismaService,
    private readonly loadRecords: SankhyaLoadRecordsClient,
    private readonly dbExplorer: SankhyaDBExplorerSPClient,
    private readonly tenantService: TenantService,
  ) {}

  private async runForAllTenants(fn: () => Promise<any>) {
    const CONCURRENCY = 5;
    const tenants = await this.tenantService.listarAtivos();

    for (let i = 0; i < tenants.length; i += CONCURRENCY) {
      const lote = tenants.slice(i, i + CONCURRENCY);
      await Promise.all(
        lote.map(async (tenant) => {
          await this.tenantService.getClientForTenant(tenant.slug);
          await tenantStorage.run(tenant.slug, fn);
        }),
      );
    }
  }

  @Cron('0 */4 * * *')
  async popularTipoOperacaoCron() {
    await this.runForAllTenants(() => this.popularTipoOperacao());
  }

  async popularTipoOperacao() {
    try {
      this.logger.log('INÍCIO: SINCRONIZAÇÃO - TIPO OPERAÇÃO');

      const registros: Record<string, any>[] = [];
      let page = 0;
      while (true) {
        const raw = await this.loadRecords.loadRecords({
          rootEntity: 'TipoOperacao',
          fieldset: 'CODTIPOPER,DESCROPER',
          criteria: { expression: 'NUCCO IS NOT NULL' },
          offsetPage: page,
        });
        registros.push(...this.loadRecords.parseEntities(raw));
        if (!this.loadRecords.hasNextPage(raw)) break;
        page++;
      }

      await Promise.all(
        registros.map((r) =>
          this.prisma.dominio.upsert({
            where: { tipo_codigo: { tipo: 'TIPO_OPERACAO', codigo: String(r.CODTIPOPER) } },
            update: { descricao: r.DESCROPER },
            create: { tipo: 'TIPO_OPERACAO', codigo: String(r.CODTIPOPER), descricao: r.DESCROPER },
          }),
        ),
      );

      this.logger.log('FIM: SINCRONIZAÇÃO - TIPO OPERAÇÃO');
    } catch (error) {
      this.logger.error('Erro na sincronização de tipo operação', error instanceof Error ? error.message : String(error));
      throw new BadRequestException('Erro ao sincronizar tipo operação');
    }
  }

  @Cron('*/10 * * * *')
  async popularUsuariosCron() {
    await this.runForAllTenants(() => this.popularUsuarios());
  }

  async popularUsuarios() {
    try {
      this.logger.log('INÍCIO: SINCRONIZAÇÃO - USUÁRIOS');

      const usuarioRows: Record<string, any>[] = [];
      let page = 0;
      while (true) {
        const raw = await this.loadRecords.loadRecords({
          rootEntity: 'Usuario',
          fieldset: 'CODUSU,NOMEUSU,EMAIL,FOTO,CODGRUPO',
          criteria: { expression: 'EMAIL IS NOT NULL' },
          joins: [{ path: 'GrupoUsuario', fieldset: 'NOMEGRUPO' }],
          offsetPage: page,
        });
        usuarioRows.push(...this.loadRecords.parseEntities(raw));
        if (!this.loadRecords.hasNextPage(raw)) break;
        page++;
      }

      const usuarios = usuarioRows.map((data) => {
        const nomeGrupo = (data['GrupoUsuario_NOMEGRUPO'] ?? '').trim();
        return {
          codigo: Number(data.CODUSU),
          nome: String(data.NOMEUSU ?? '').trim(),
          email: data.EMAIL,
          foto: data.FOTO ?? null,
          perfil:
            nomeGrupo === 'ADMINISTRADOR' || nomeGrupo === 'DIRETORIA' || nomeGrupo === ''
              ? Perfil.ADMINISTRADOR
              : Perfil.SEPARADOR,
        };
      });

      await Promise.all(
        usuarios.map((usuario) =>
          this.prisma.user.upsert({
            where: { codigo: usuario.codigo },
            update: {
              nome: usuario.nome,
              email: usuario.email,
              foto: usuario.foto,
              perfil: usuario.perfil,
            },
            create: {
              ...usuario,
              ativo: usuario.perfil === Perfil.ADMINISTRADOR,
            },
          }),
        ),
      );

      this.logger.log('FIM: SINCRONIZAÇÃO - USUÁRIOS');
    } catch (error) {
      this.logger.error('Erro na sincronização de usuários', error instanceof Error ? error.message : String(error));
      throw new BadRequestException('Erro ao sincronizar usuários');
    }
  }

  private async getDialect(): Promise<string> {
    const slug = tenantStorage.getStore();
    if (!slug) return 'SQLSERVER';
    const cfg = await this.tenantService.getConfig(slug);
    return (cfg as any).dbDialect ?? 'SQLSERVER';
  }

  private sqlImgHex(dialect: string, where: string): string {
    const hexExpr = dialect === 'ORACLE'
      ? `RAWTOHEX(DBMS_LOB.SUBSTR(IMAGEM, 32767, 1))`
      : `CONVERT(NVARCHAR(MAX), CAST(IMAGEM AS VARBINARY(MAX)), 2)`;
    return `SELECT CODPROD, DESCRPROD, COMPLDESC, ${hexExpr} AS IMAGEM_HEX FROM TGFPRO WHERE ${where}`;
  }

  async diagnosticoImagem(codprod?: number) {
    const dialect = await this.getDialect();
    const datalenExpr = dialect === 'ORACLE'
      ? `DBMS_LOB.GETLENGTH(IMAGEM)`
      : `DATALENGTH(IMAGEM)`;
    const stats = await this.dbExplorer.executeQuery(
      `SELECT COUNT(*) AS TOTAL, AVG(${datalenExpr}) AS MEDIA_BYTES, MAX(${datalenExpr}) AS MAX_BYTES FROM TGFPRO WHERE IMAGEM IS NOT NULL`,
    ).catch((e) => ({ erro: String(e?.message ?? e) }));

    return { stats };
  }

  @Cron('0 */6 * * *')
  async sincronizarProdutosCron() {
    await this.runForAllTenants(() => this.sincronizarProdutos());
  }

  async sincronizarProdutos() {
    this.logger.log('INÍCIO: SINCRONIZAÇÃO - PRODUTOS E CÓDIGOS DE BARRAS');

    // ── 1. Produtos (dados básicos via loadRecords) ──────────────────────────
    const produtoRows: Record<string, any>[] = [];
    let page = 0;
    while (true) {
      const raw = await this.loadRecords.loadRecords({
        rootEntity: 'Produto',
        fieldset: 'CODPROD,DESCRPROD,COMPLDESC',
        offsetPage: page,
      });
      produtoRows.push(...this.loadRecords.parseEntities(raw));
      if (!this.loadRecords.hasNextPage(raw)) break;
      page++;
    }

    // Upsert básico (sem imagem ainda)
    for (let i = 0; i < produtoRows.length; i += 200) {
      const batch = produtoRows.slice(i, i + 200);
      await Promise.all(
        batch.map((p) =>
          this.prisma.produtoCache.upsert({
            where: { idProduto: Number(p.CODPROD) },
            update: { nome: p.DESCRPROD || '', complemento: p.COMPLDESC ?? null },
            create: { idProduto: Number(p.CODPROD), nome: p.DESCRPROD || '', complemento: p.COMPLDESC ?? null, imagem: null },
          }),
        ),
      );
    }

    // ── 1b. Imagens via DbExplorer (dialeto por tenant: Oracle ou SQL Server) ──
    const dialect = await this.getDialect();
    const codprodsComImagem = await this.dbExplorer.executeQuery(
      `SELECT CODPROD FROM TGFPRO WHERE IMAGEM IS NOT NULL ORDER BY CODPROD`,
    ).catch(() => [] as any[]);

    // Lotes de 3: respostas menores evitam timeout no gateway (30s) para imagens grandes
    const imagemBatchSize = 3;
    let imagensSincronizadas = 0;

    const salvarImagem = async (codprod: number): Promise<boolean> => {
      try {
        const rows = await this.dbExplorer.executeQuery(
          this.sqlImgHex(dialect, `CODPROD = ${codprod}`),
        );
        const row = (rows as any[])[0];
        const hex = row?.IMAGEM_HEX as string | null;
        if (!hex) return false;
        const mime = hex.startsWith('89504E47') ? 'image/png'
                   : hex.startsWith('FFD8FF')   ? 'image/jpeg'
                   : 'image/jpeg';
        const imagem = `data:${mime};base64,${Buffer.from(hex, 'hex').toString('base64')}`;
        await this.prisma.produtoCache.upsert({
          where: { idProduto: codprod },
          update: { imagem },
          create: {
            idProduto: codprod,
            nome: row.DESCRPROD || String(codprod),
            complemento: row.COMPLDESC ?? null,
            imagem,
          },
        });
        return true;
      } catch {
        return false;
      }
    };

    for (let i = 0; i < codprodsComImagem.length; i += imagemBatchSize) {
      const batch = codprodsComImagem.slice(i, i + imagemBatchSize);
      const ids = batch.map((r: any) => Number(r.CODPROD)).join(',');

      // Tenta o lote inteiro primeiro (mais rápido)
      const rowsLote = await this.dbExplorer.executeQuery(
        this.sqlImgHex(dialect, `CODPROD IN (${ids})`),
      ).catch(() => null);

      if (rowsLote !== null) {
        // Lote OK: salva todos
        const resultados = await Promise.all(
          (rowsLote as any[]).map(async (row: any) => {
            const hex = row.IMAGEM_HEX as string | null;
            if (!hex) return false;
            const mime = hex.startsWith('89504E47') ? 'image/png'
                       : hex.startsWith('FFD8FF')   ? 'image/jpeg'
                       : 'image/jpeg';
            const imagem = `data:${mime};base64,${Buffer.from(hex, 'hex').toString('base64')}`;
            return this.prisma.produtoCache.upsert({
              where: { idProduto: Number(row.CODPROD) },
              update: { imagem },
              create: {
                idProduto: Number(row.CODPROD),
                nome: row.DESCRPROD || String(row.CODPROD),
                complemento: row.COMPLDESC ?? null,
                imagem,
              },
            }).then(() => true).catch(() => false);
          }),
        );
        imagensSincronizadas += resultados.filter(Boolean).length;
      } else {
        // Lote falhou (provavelmente imagem grande): retry individual
        for (const r of batch) {
          const ok = await salvarImagem(Number(r.CODPROD));
          if (ok) imagensSincronizadas++;
        }
      }
    }

    // ── 2. Códigos de barras (BAR) ───────────────────────────────────────────
    const barRows: Record<string, any>[] = [];
    page = 0;
    while (true) {
      const raw = await this.loadRecords.loadRecords({
        rootEntity: 'CodigoBarras',
        fieldset: 'CODPROD,CODVOL,CODBARRA',
        offsetPage: page,
      });
      barRows.push(...this.loadRecords.parseEntities(raw));
      if (!this.loadRecords.hasNextPage(raw)) break;
      page++;
    }

    // ── 3. Códigos de barras (VOA) ───────────────────────────────────────────
    const voaRows: Record<string, any>[] = [];
    page = 0;
    while (true) {
      const raw = await this.loadRecords.loadRecords({
        rootEntity: 'VolumeAlternativo',
        fieldset: 'CODPROD,CODVOL,CONTROLE,DIVIDEMULTIPLICA,QUANTIDADE,CODBARRA',
        criteria: { expression: 'CODBARRA IS NOT NULL' },
        offsetPage: page,
      });
      voaRows.push(...this.loadRecords.parseEntities(raw));
      if (!this.loadRecords.hasNextPage(raw)) break;
      page++;
    }

    type CacheCodigo = {
      codigoBarra: string; idProduto: number; codvol: string | null;
      controle: string; quantidade: number | null; divideMult: string | null; origem: string;
    };

    const allCodigos: CacheCodigo[] = [
      ...barRows
        .filter((b) => b.CODBARRA)
        .map((b) => ({
          codigoBarra: String(b.CODBARRA).trim(),
          idProduto: Number(b.CODPROD),
          codvol: b.CODVOL || null,
          controle: ' ',
          quantidade: null,
          divideMult: null,
          origem: 'BAR',
        })),
      ...voaRows
        .filter((v) => v.CODBARRA)
        .map((v) => ({
          codigoBarra: String(v.CODBARRA).trim(),
          idProduto: Number(v.CODPROD),
          codvol: v.CODVOL || null,
          controle: String(v.CONTROLE ?? ' ').trim() || ' ',
          quantidade: v.QUANTIDADE != null ? Number(v.QUANTIDADE) : null,
          divideMult: v.DIVIDEMULTIPLICA ?? null,
          origem: 'VOA',
        })),
    ];

    for (let i = 0; i < allCodigos.length; i += 200) {
      const batch = allCodigos.slice(i, i + 200);
      await Promise.all(
        batch.map((c) =>
          this.prisma.codigoBarrasCache.upsert({
            where: {
              codigoBarra_idProduto_controle_origem: {
                codigoBarra: c.codigoBarra,
                idProduto: c.idProduto,
                controle: c.controle,
                origem: c.origem,
              },
            },
            update: { codvol: c.codvol, quantidade: c.quantidade, divideMult: c.divideMult },
            create: c,
          }),
        ),
      );
    }

    const resumo = { produtos: produtoRows.length, imagens: imagensSincronizadas, codigos: allCodigos.length };
    this.logger.log(`FIM: SINCRONIZAÇÃO - PRODUTOS (${resumo.produtos} produtos, ${resumo.imagens} imagens, ${resumo.codigos} códigos)`);
    return resumo;
  }
}
