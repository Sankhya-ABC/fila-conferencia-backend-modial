import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TenantService } from './tenant.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class TenantMigratorService implements OnModuleInit {
  private readonly logger = new Logger(TenantMigratorService.name);
  private readonly migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');

  constructor(private readonly tenantService: TenantService) {}

  async onModuleInit() {
    await this.runPendingMigrations();
  }

  private async runPendingMigrations() {
    if (!fs.existsSync(this.migrationsDir)) {
      this.logger.warn('Diretório prisma/migrations não encontrado — migrações ignoradas');
      return;
    }

    const migrationDirs = fs
      .readdirSync(this.migrationsDir)
      .filter((d) => {
        const full = path.join(this.migrationsDir, d);
        return (
          fs.statSync(full).isDirectory() &&
          fs.existsSync(path.join(full, 'migration.sql'))
        );
      })
      .sort();

    const tenants = await this.tenantService.listarTodos();
    this.logger.log(
      `Tenant migrator: ${migrationDirs.length} migrações × ${tenants.length} tenant(s)`,
    );

    for (const tenant of tenants) {
      await this.migrateTenant(tenant.slug, migrationDirs);
    }
  }

  private async migrateTenant(slug: string, migrationDirs: string[]) {
    let client: Awaited<ReturnType<TenantService['getClientForTenant']>>;
    try {
      client = await this.tenantService.getClientForTenant(slug);
    } catch (err: any) {
      this.logger.error(`[${slug}] Falha ao conectar: ${err.message}`);
      return;
    }

    try {
      // Garante que a tabela de controle de migrações existe
      await client.$executeRaw`
        CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
          id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
          checksum            VARCHAR(64)  NOT NULL,
          finished_at         TIMESTAMPTZ,
          migration_name      VARCHAR(255) NOT NULL,
          logs                TEXT,
          rolled_back_at      TIMESTAMPTZ,
          started_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          applied_steps_count INTEGER      NOT NULL DEFAULT 0
        )
      `;

      const applied = await client.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
      `;
      const appliedSet = new Set(applied.map((r) => r.migration_name));

      let pendentes = 0;
      for (const migDir of migrationDirs) {
        if (appliedSet.has(migDir)) continue;

        const sqlFile = path.join(this.migrationsDir, migDir, 'migration.sql');
        const sql = fs.readFileSync(sqlFile, 'utf-8').trim();
        if (!sql) continue;

        const checksum = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 64);
        const id = crypto.randomUUID();

        this.logger.log(`[${slug}] Aplicando migração: ${migDir}`);
        try {
          await client.$executeRawUnsafe(sql);
          await client.$executeRaw`
            INSERT INTO "_prisma_migrations"
              (id, checksum, finished_at, migration_name, applied_steps_count)
            VALUES
              (${id}, ${checksum}, NOW(), ${migDir}, 1)
          `;
          pendentes++;
          this.logger.log(`[${slug}] ✓ ${migDir}`);
        } catch (err: any) {
          this.logger.error(`[${slug}] ✗ ${migDir}: ${err.message}`);
          // Não interrompe — continua tentando as demais migrações
        }
      }

      if (pendentes === 0) {
        this.logger.log(`[${slug}] Schema atualizado — nenhuma migração pendente`);
      } else {
        this.logger.log(`[${slug}] ${pendentes} migração(ões) aplicada(s)`);
      }
    } catch (err: any) {
      this.logger.error(`[${slug}] Erro ao verificar migrações: ${err.message}`);
    }
  }
}
