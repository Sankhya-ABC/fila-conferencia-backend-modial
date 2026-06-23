import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbDialect, PrismaClient } from '@prisma/client';

@Injectable()
export class TenantService implements OnModuleDestroy {
  private readonly admin: PrismaClient;
  private readonly tenantClients = new Map<string, PrismaClient>();
  private readonly configCache = new Map<string, any>();

  constructor(private readonly config: ConfigService) {
    this.admin = new PrismaClient({
      datasources: { db: { url: config.getOrThrow('ADMIN_DATABASE_URL') } },
    });
  }

  async findTenantByEmail(email: string) {
    const record = await this.admin.tenantUser.findUnique({
      where: { email },
      include: { tenant: true },
    });
    if (!record) throw new NotFoundException('Usuário não vinculado a nenhuma empresa');
    return record;
  }

  async getConfig(slug: string) {
    if (this.configCache.has(slug)) return this.configCache.get(slug);
    const tenant = await this.admin.tenant.findUniqueOrThrow({ where: { slug } });
    this.configCache.set(slug, tenant);
    return tenant;
  }

  getCachedClient(slug: string): PrismaClient | undefined {
    return this.tenantClients.get(slug);
  }

  async getClientForTenant(slug: string): Promise<PrismaClient> {
    if (!this.tenantClients.has(slug)) {
      const cfg = await this.getConfig(slug);
      const url = cfg.dbUrl.includes('?')
        ? `${cfg.dbUrl}&connection_limit=10&pool_timeout=20`
        : `${cfg.dbUrl}?connection_limit=10&pool_timeout=20`;
      const client = new PrismaClient({ datasources: { db: { url } } });
      await client.$connect();
      this.tenantClients.set(slug, client);
    }
    return this.tenantClients.get(slug)!;
  }

  async addTenantUser(email: string, tenantSlug: string) {
    await this.admin.tenantUser.upsert({
      where: { email },
      update: { tenantSlug },
      create: { email, tenantSlug },
    });
  }

  async removeTenantUser(email: string) {
    await this.admin.tenantUser.deleteMany({ where: { email } });
  }

  async listarAtivos() {
    return this.admin.tenant.findMany({
      where: { ativo: true },
      select: { slug: true, nome: true },
    });
  }

  async listarTodos() {
    return this.admin.tenant.findMany({
      orderBy: { criadoEm: 'asc' },
      select: {
        slug: true,
        nome: true,
        ativo: true,
        snkHost: true,
        snkGateway: true,
        snkClientId: true,
        dbDialect: true,
        snkModulos: true,
        criadoEm: true,
      },
    });
  }

  async getConfigParaEdicao(slug: string) {
    return this.admin.tenant.findUniqueOrThrow({
      where: { slug },
      select: {
        slug: true,
        nome: true,
        ativo: true,
        snkHost: true,
        snkGateway: true,
        snkXToken: true,
        snkClientId: true,
        snkClientSecret: true,
        dbDialect: true,
        snkModulos: true,
        criadoEm: true,
      },
    });
  }

  async hasModulo(slug: string, modulo: string): Promise<boolean> {
    const tenant = await this.admin.tenant.findUnique({ where: { slug }, select: { snkModulos: true } });
    const lista = (tenant?.snkModulos ?? '') as string;
    return lista.split(',').map((m) => m.trim()).includes(modulo);
  }

  async criarTenantRecord(data: {
    slug: string;
    nome: string;
    dbUrl: string;
    snkHost: string;
    snkGateway: string;
    snkXToken: string;
    snkClientId: string;
    snkClientSecret: string;
    dbDialect?: DbDialect;
    snkModulos?: string;
  }) {
    return this.admin.tenant.create({ data });
  }

  async atualizarTenant(
    slug: string,
    data: Partial<{
      nome: string;
      snkHost: string;
      snkGateway: string;
      snkXToken: string;
      snkClientId: string;
      snkClientSecret: string;
      ativo: boolean;
      dbDialect: DbDialect;
      snkModulos: string;
    }>,
  ) {
    this.configCache.delete(slug);
    return this.admin.tenant.update({ where: { slug }, data });
  }

  async findMasterUser(email: string) {
    try {
      return await this.admin.masterUser.findUnique({ where: { email } });
    } catch {
      return null;
    }
  }

  getAdminClient() {
    return this.admin;
  }

  async onModuleDestroy() {
    await this.admin.$disconnect();
    for (const client of this.tenantClients.values()) {
      await client.$disconnect();
    }
  }
}
