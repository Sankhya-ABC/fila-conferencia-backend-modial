import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { randomUUID } from 'crypto';
import { AtualizarBalancaDto, CriarBalancaDto, TestarConexaoDiretaDto } from './dto/balanca.dto';
import { BalancaCompleta, COL } from './balanca.types';
import { BalancaDriver } from './drivers/balanca-driver.interface';
import { MockDriver } from './drivers/mock.driver';
import { criarDriver, criarMock } from './drivers/driver.registry';

export type { BalancaCompleta };

@Injectable()
export class BalancaService implements OnModuleDestroy {
  constructor(private readonly prisma: PrismaService) {}

  private driversAtivos = new Map<string, BalancaDriver>();

  async onModuleDestroy() {
    for (const [, driver] of this.driversAtivos) {
      try { await driver.desconectar(); } catch { /* ignore */ }
    }
    this.driversAtivos.clear();
  }

  // ─── CRUD (raw SQL — Prisma client pode estar desatualizado) ─────────────────

  async listar(): Promise<BalancaCompleta[]> {
    const rows: BalancaCompleta[] = await this.prisma.$queryRaw`
      SELECT b.*, COALESCE(
        (SELECT array_agg(bu."idUsuario") FROM "BalancaUsuario" bu WHERE bu."balancaId" = b.id),
        ARRAY[]::integer[]
      ) AS "idsUsuarios"
      FROM "Balanca" b WHERE b.ativo = true ORDER BY b.nome ASC
    `;
    return rows;
  }

  /** Balanças vinculadas ao usuário logado — fallback para todas as ativas se ele não tiver nenhum vínculo. */
  async listarParaUsuario(idUsuario: number): Promise<BalancaCompleta[]> {
    const vinculadas: BalancaCompleta[] = await this.prisma.$queryRaw`
      SELECT b.* FROM "Balanca" b
      JOIN "BalancaUsuario" bu ON bu."balancaId" = b.id
      WHERE b.ativo = true AND bu."idUsuario" = ${idUsuario}
      ORDER BY b.nome ASC
    `;
    if (vinculadas.length > 0) return vinculadas;

    const rows: BalancaCompleta[] = await this.prisma.$queryRaw`
      SELECT * FROM "Balanca" WHERE ativo = true ORDER BY nome ASC
    `;
    return rows;
  }

  async listarAtivas(): Promise<Pick<BalancaCompleta, 'id' | 'nome' | 'modelo' | 'tipoComunicacao'>[]> {
    const rows: Pick<BalancaCompleta, 'id' | 'nome' | 'modelo' | 'tipoComunicacao'>[] =
      await this.prisma.$queryRaw`
        SELECT id, nome, modelo, "tipoComunicacao" FROM "Balanca" WHERE ativo = true ORDER BY nome ASC
      `;
    return rows;
  }

  async criar(dto: CriarBalancaDto): Promise<BalancaCompleta> {
    const id              = randomUUID();
    const tipoComunicacao = dto.tipoComunicacao ?? 'HTTP';

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "Balanca" (
          id, nome, fabricante, modelo, "tipoComunicacao",
          "portaCom", "baudRate", "dataBits", paridade, "stopBits", "protocoloSerial",
          protocolo, ip, porta, rota, ativo
        ) VALUES (
          ${id},
          ${dto.nome},
          ${dto.fabricante        ?? 'Toledo'},
          ${dto.modelo            ?? null},
          ${tipoComunicacao},
          ${dto.portaCom          ?? null},
          ${dto.baudRate          ?? 4800},
          ${dto.dataBits          ?? 8},
          ${dto.paridade          ?? 'NONE'},
          ${dto.stopBits          ?? 1},
          ${dto.protocoloSerial   ?? 'P05'},
          ${dto.protocolo         ?? (tipoComunicacao === 'TOLEDO_TCP' ? 'TOLEDO_TCP' : 'HTTP')},
          ${dto.ip                ?? null},
          ${dto.porta             ?? null},
          ${dto.rota              ?? '/peso'},
          ${dto.ativo             ?? true}
        )
      `;

      if (dto.idsUsuarios !== undefined) {
        await this.sincronizarVinculos(tx, id, dto.idsUsuarios);
      }
    });

    return this.buscarOuFalhar(id);
  }

  async atualizar(id: string, dto: AtualizarBalancaDto): Promise<BalancaCompleta> {
    await this.buscarOuFalhar(id);

    const campos: { col: string; val: unknown }[] = [];
    for (const [key, col] of Object.entries(COL)) {
      const val = (dto as any)[key];
      if (val !== undefined) campos.push({ col, val });
    }

    await this.prisma.$transaction(async (tx) => {
      if (campos.length > 0) {
        const set = campos.map((c, i) => `${c.col} = $${i + 2}`).join(', ');
        await tx.$executeRawUnsafe(
          `UPDATE "Balanca" SET ${set} WHERE id = $1`,
          id, ...campos.map(c => c.val),
        );
      }

      if (dto.idsUsuarios !== undefined) {
        await this.sincronizarVinculos(tx, id, dto.idsUsuarios);
      }
    });

    return this.buscarOuFalhar(id);
  }

  /** Substitui os vínculos usuário↔balança pela lista informada (delete + insert). */
  private async sincronizarVinculos(tx: any, balancaId: string, idsUsuarios: number[]): Promise<void> {
    await tx.$executeRaw`DELETE FROM "BalancaUsuario" WHERE "balancaId" = ${balancaId}`;
    for (const idUsuario of idsUsuarios) {
      await tx.$executeRaw`
        INSERT INTO "BalancaUsuario" (id, "balancaId", "idUsuario")
        VALUES (${randomUUID()}, ${balancaId}, ${idUsuario})
      `;
    }
  }

  async remover(id: string) {
    await this.buscarOuFalhar(id);
    if (this.driversAtivos.has(id)) await this.pararLeitura(id);
    await this.prisma.$executeRaw`DELETE FROM "Balanca" WHERE id = ${id}`;
    return { id };
  }

  // ─── Portas COM ───────────────────────────────────────────────────────────────

  async listarPortasCOM(): Promise<string[]> {
    try {
      const { SerialPort } = await import('serialport');
      const ports = await SerialPort.list();
      const paths = (ports as any[]).map((p) => p.path).sort();
      return paths.length > 0 ? paths : ['COM1', 'COM2', 'COM3', 'COM4', 'COM5'];
    } catch {
      return ['COM1', 'COM2', 'COM3', 'COM4', 'COM5'];
    }
  }

  // ─── Status ───────────────────────────────────────────────────────────────────

  async statusBalanca(id: string): Promise<{ conectado: boolean; pesoAtual: number }> {
    const driver = this.driversAtivos.get(id);
    if (driver?.conectado) {
      return { conectado: true, pesoAtual: driver.pesoCurrent };
    }

    const balanca = await this.buscarOuFalhar(id);
    const tipo    = balanca.tipoComunicacao;

    if (tipo === 'SERIAL_RS232' || tipo === 'SERIAL_USB' || tipo === 'TOLEDO_TCP') {
      return { conectado: false, pesoAtual: 0 };
    }

    // HTTP / TCP: teste de conectividade one-shot
    const tmp = criarDriver(balanca);
    try {
      await tmp.conectar(balanca);
      const result = { conectado: tmp.conectado, pesoAtual: tmp.pesoCurrent };
      try { await tmp.desconectar(); } catch { /* ignore */ }
      return result;
    } catch {
      try { await tmp.desconectar(); } catch { /* ignore */ }
      return { conectado: false, pesoAtual: 0 };
    }
  }

  // ─── Teste direto (serial, sem ID cadastrado) ─────────────────────────────────

  async testarConexaoDireta(
    config: TestarConexaoDiretaDto,
  ): Promise<{ sucesso: boolean; mensagem: string; peso?: number }> {
    const tempConfig: BalancaCompleta = {
      id: '', nome: '', fabricante: 'Toledo', modelo: null,
      tipoComunicacao: 'SERIAL_RS232',
      portaCom:        config.portaCom,
      baudRate:        config.baudRate,
      dataBits:        config.dataBits,
      paridade:        config.paridade,
      stopBits:        config.stopBits,
      protocoloSerial: config.protocoloSerial,
      protocolo: 'HTTP', ip: null, porta: null, rota: '/peso', ativo: true,
    };

    const driver = criarDriver(tempConfig);

    return new Promise(async (resolve) => {
      const done = async (result: { sucesso: boolean; mensagem: string; peso?: number }) => {
        try { await driver.desconectar(); } catch { /* ignore */ }
        resolve(result);
      };

      const timer = setTimeout(
        () => done({ sucesso: false, mensagem: 'Timeout: balança não respondeu em 5 segundos.' }),
        5000,
      );

      try {
        await driver.conectar(tempConfig);

        let tentativas = 0;
        const poll = setInterval(async () => {
          const peso = await driver.lerPeso();
          if (peso !== null && peso > 0) {
            clearInterval(poll);
            clearTimeout(timer);
            await done({ sucesso: true, mensagem: `Comunicação OK. Peso: ${peso.toFixed(3)} kg`, peso });
          } else if (++tentativas >= 15) {
            clearInterval(poll);
            clearTimeout(timer);
            await done({ sucesso: false, mensagem: 'Porta aberta mas nenhum dado de peso recebido.' });
          }
        }, 300);
      } catch (err: any) {
        clearTimeout(timer);
        await done({ sucesso: false, mensagem: err?.message ?? 'Erro ao abrir porta serial.' });
      }
    });
  }

  // ─── Leitura contínua (serial) ────────────────────────────────────────────────

  async iniciarLeitura(id: string): Promise<void> {
    const balanca = await this.buscarOuFalhar(id);
    if (this.driversAtivos.has(id)) await this.pararLeitura(id);

    const driver = criarDriver(balanca);
    await driver.conectar(balanca);
    this.driversAtivos.set(id, driver);
  }

  async pararLeitura(id: string): Promise<void> {
    const driver = this.driversAtivos.get(id);
    if (!driver) return;
    await driver.desconectar();
    this.driversAtivos.delete(id);
  }

  pesoAtual(id: string): { lendo: boolean; peso: number; erro?: string } {
    const driver = this.driversAtivos.get(id);
    if (!driver) return { lendo: false, peso: 0 };
    return { lendo: driver.conectado, peso: driver.pesoCurrent, erro: driver.erro };
  }

  // ─── Simulação ────────────────────────────────────────────────────────────────

  simularPeso(id: string): { peso: number } {
    const PESOS = [0.150, 0.320, 0.850, 1.250, 0.480, 2.130, 0.075, 0.960];
    const peso  = PESOS[Math.floor(Math.random() * PESOS.length)];

    const existing = this.driversAtivos.get(id);
    if (existing instanceof MockDriver) {
      existing.simular(peso);
    } else if (existing) {
      (existing as any)._pesoCurrent = peso; // injeta no driver ativo (real ou serial)
    } else {
      this.driversAtivos.set(id, criarMock(peso));
    }

    return { peso };
  }

  // ─── Captura backward-compat (usado pela Separação) ──────────────────────────

  async capturarPeso(id: string): Promise<number> {
    const balanca = await this.buscarOuFalhar(id);
    const tipo    = balanca.tipoComunicacao;

    if (tipo === 'SERIAL_RS232' || tipo === 'SERIAL_USB') {
      const driver = this.driversAtivos.get(id);
      if (!driver?.conectado) {
        throw new BadRequestException(
          `Balança serial "${balanca.nome}" não está em leitura. Inicie no painel de configuração.`,
        );
      }
      const peso = await driver.lerPeso();
      if (!peso || peso <= 0) throw new BadRequestException(`Balança "${balanca.nome}" retornou peso inválido.`);
      return peso;
    }

    // HTTP / TCP — one-shot
    try {
      const driver = criarDriver(balanca);
      await driver.conectar(balanca);
      const peso = await driver.lerPeso();
      if (!peso || peso <= 0) {
        throw new BadRequestException(
          `Balança "${balanca.nome}" retornou peso inválido. Verifique a conexão.`,
        );
      }
      return peso;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `Falha na comunicação com "${balanca.nome}": ${err?.message ?? 'erro desconhecido'}`,
      );
    }
  }

  // ─── Helper ───────────────────────────────────────────────────────────────────

  private async buscarOuFalhar(id: string): Promise<BalancaCompleta> {
    const rows: BalancaCompleta[] = await this.prisma.$queryRaw`
      SELECT * FROM "Balanca" WHERE id = ${id}
    `;
    if (!rows[0]) throw new BadRequestException('Balança não encontrada.');
    return rows[0];
  }
}
