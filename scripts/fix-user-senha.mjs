// Diagnóstico e reset de senha + reparo de TenantUser
// Uso: node scripts/fix-user-senha.mjs <email> [nova-senha]

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const ADMIN_URL = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://postgres:postgres@localhost:5433/fila_conferencia_admin';

const emailBusca = process.argv[2];
const novaSenha  = process.argv[3];

if (!emailBusca) {
  console.error('Uso: node scripts/fix-user-senha.mjs <email> [nova-senha]');
  process.exit(1);
}

const adminDb = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });

async function main() {
  // 1. Lista todos os tenants
  const tenants = await adminDb.tenant.findMany({ select: { slug: true, dbUrl: true } });
  console.log(`Tenants configurados: ${tenants.map(t => t.slug).join(', ')}`);

  // 2. Busca mapeamento no admin DB
  const tuExistente = await adminDb.tenantUser.findUnique({ where: { email: emailBusca } });
  if (tuExistente) {
    console.log(`TenantUser já existe: email="${tuExistente.email}", tenant="${tuExistente.tenantSlug}"`);
  } else {
    console.log(`[AVISO] TenantUser não encontrado para "${emailBusca}" — buscando em todos os tenants...`);
  }

  // 3. Procura o usuário em todos os tenants
  let tenantEncontrado = null;
  let userEncontrado = null;

  for (const tenant of tenants) {
    const tenantDb = new PrismaClient({ datasources: { db: { url: tenant.dbUrl } } });
    try {
      const user = await tenantDb.user.findFirst({
        where: { email: { equals: emailBusca, mode: 'insensitive' } },
      });
      if (user) {
        tenantEncontrado = tenant;
        userEncontrado = user;
        console.log(`\nUsuário encontrado no tenant "${tenant.slug}":`);
        console.log(`  codigo: ${user.codigo}`);
        console.log(`  nome:   ${user.nome}`);
        console.log(`  email:  ${user.email}`);
        console.log(`  perfil: ${user.perfil}`);
        console.log(`  ativo:  ${user.ativo}`);
        console.log(`  senha definida: ${!!user.senha}`);
      }
    } catch (e) {
      console.log(`[AVISO] Erro ao conectar tenant "${tenant.slug}": ${e.message}`);
    } finally {
      await tenantDb.$disconnect();
    }
  }

  if (!userEncontrado || !tenantEncontrado) {
    console.error(`\n[ERRO] Usuário "${emailBusca}" não encontrado em nenhum tenant.`);
    return;
  }

  // 4. Repara TenantUser se necessário
  if (!tuExistente) {
    await adminDb.tenantUser.create({
      data: { email: userEncontrado.email, tenantSlug: tenantEncontrado.slug },
    });
    console.log(`\n[OK] TenantUser criado: "${userEncontrado.email}" → "${tenantEncontrado.slug}"`);
  }

  // 5. Atualiza senha e ativa se solicitado
  if (novaSenha) {
    const tenantDb = new PrismaClient({ datasources: { db: { url: tenantEncontrado.dbUrl } } });
    const hash = await bcrypt.hash(novaSenha, 10);
    await tenantDb.user.update({
      where: { codigo: userEncontrado.codigo },
      data: { senha: hash, ativo: true },
    });
    await tenantDb.$disconnect();
    console.log(`[OK] Senha atualizada para "${novaSenha}" e usuário ativado.`);
  }

  console.log('\nPronto. Tente logar agora.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => adminDb.$disconnect());
