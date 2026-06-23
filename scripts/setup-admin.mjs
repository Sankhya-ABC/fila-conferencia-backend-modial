/**
 * Cria o banco admin e registra um tenant.
 *
 * Uso:
 *   node scripts/setup-admin.mjs
 *   node scripts/setup-admin.mjs --slug=modial --nome="Modial" --db-url="postgresql://..." \
 *     --snk-host="https://api.sankhya.com.br" --snk-gateway="gateway/v1" \
 *     --snk-token="..." --snk-client-id="..." --snk-client-secret="..."
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);

const slug            = args['slug']              ?? 'negri';
const nome            = args['nome']              ?? 'Negri';
const dbUrl           = args['db-url']            ?? 'postgresql://postgres:postgres@localhost:5433/fila_conferencia_negri';
const snkHost         = args['snk-host']          ?? 'https://api.sankhya.com.br';
const snkGateway      = args['snk-gateway']       ?? 'gateway/v1';
const snkXToken       = args['snk-token']         ?? '';
const snkClientId     = args['snk-client-id']     ?? '';
const snkClientSecret = args['snk-client-secret'] ?? '';

const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) {
  console.error('ADMIN_DATABASE_URL não definida no .env');
  process.exit(1);
}

const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });

async function main() {
  console.log(`Conectando ao DB admin: ${adminUrl}`);
  await admin.$connect();

  // Cria as tabelas se não existirem (idempotente)
  await admin.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Tenant" (
      "slug"            TEXT PRIMARY KEY,
      "nome"            TEXT NOT NULL,
      "ativo"           BOOLEAN NOT NULL DEFAULT true,
      "dbUrl"           TEXT NOT NULL,
      "snkHost"         TEXT NOT NULL,
      "snkGateway"      TEXT NOT NULL,
      "snkXToken"       TEXT NOT NULL,
      "snkClientId"     TEXT NOT NULL,
      "snkClientSecret" TEXT NOT NULL,
      "criadoEm"        TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await admin.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TenantUser" (
      "email"      TEXT PRIMARY KEY,
      "tenantSlug" TEXT NOT NULL REFERENCES "Tenant"("slug")
    );
  `);

  // Upsert tenant
  await admin.tenant.upsert({
    where: { slug },
    update: { nome, dbUrl, snkHost, snkGateway, snkXToken, snkClientId, snkClientSecret },
    create: { slug, nome, ativo: true, dbUrl, snkHost, snkGateway, snkXToken, snkClientId, snkClientSecret },
  });

  console.log(`✔ Tenant "${nome}" (${slug}) registrado no DB admin.`);
  console.log('');
  console.log('Próximos passos:');
  console.log(`  1. Crie o banco de dados do tenant: CREATE DATABASE "$(basename ${dbUrl})";`);
  console.log(`  2. Rode as migrations no banco do tenant:`);
  console.log(`       DATABASE_URL="${dbUrl}" npx prisma migrate deploy`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => admin.$disconnect());
