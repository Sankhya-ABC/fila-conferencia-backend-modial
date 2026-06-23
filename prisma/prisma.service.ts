import { Injectable, InternalServerErrorException, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantStorage } from 'src/core/tenant/tenant.context';
import { TenantService } from 'src/core/tenant/tenant.service';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  constructor(private readonly tenantService: TenantService) {}

  async onModuleDestroy() {}

  /** Retorna o PrismaClient para um tenant específico (uso em login e crons). */
  async getClient(tenantSlug: string): Promise<PrismaClient> {
    return this.tenantService.getClientForTenant(tenantSlug);
  }

  private current(): PrismaClient {
    const slug = tenantStorage.getStore();
    if (!slug) {
      throw new InternalServerErrorException('Sem contexto de tenant na requisição');
    }
    const client = this.tenantService.getCachedClient(slug);
    if (!client) {
      throw new InternalServerErrorException(
        `PrismaClient não inicializado para tenant "${slug}"`,
      );
    }
    return client;
  }

  // ── Modelos de negócio (proxy para o cliente do tenant atual) ────────────────

  get user() { return this.current().user; }
  get dominio() { return this.current().dominio; }
  get empresa() { return this.current().empresa; }
  get parceiro() { return this.current().parceiro; }
  get sessaoConferencia() { return this.current().sessaoConferencia; }
  get sessaoItem() { return this.current().sessaoItem; }
  get sessaoVolume() { return this.current().sessaoVolume; }
  get sessaoLeitura() { return this.current().sessaoLeitura; }
  get sessaoCodigoBarras() { return this.current().sessaoCodigoBarras; }
  get produtoCache() { return this.current().produtoCache; }
  get codigoBarrasCache() { return this.current().codigoBarrasCache; }
  get logLogin() { return this.current().logLogin; }
  get logHeartbeat() { return this.current().logHeartbeat; }
  get balanca() { return this.current().balanca; }

  $transaction(...args: Parameters<PrismaClient['$transaction']>): any {
    return (this.current().$transaction as any)(...args);
  }

  $queryRaw(...args: Parameters<PrismaClient['$queryRaw']>): any {
    return (this.current().$queryRaw as any)(...args);
  }

  $executeRaw(...args: Parameters<PrismaClient['$executeRaw']>): any {
    return (this.current().$executeRaw as any)(...args);
  }

  $executeRawUnsafe(query: string, ...values: unknown[]): any {
    return (this.current().$executeRawUnsafe as any)(query, ...values);
  }
}
