/**
 * Cria ou atualiza um usuário master no admin DB.
 * Uso: node scripts/create-master.mjs --email=master@seudominio.com --nome="Seu Nome" --senha=suasenha
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { parseArgs } from 'util';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    nome:  { type: 'string' },
    senha: { type: 'string' },
  },
});

if (!values.email || !values.nome || !values.senha) {
  console.error('Uso: node scripts/create-master.mjs --email=x --nome="Nome" --senha=x');
  process.exit(1);
}

const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) {
  console.error('ADMIN_DATABASE_URL não definida no ambiente. Rode com: ADMIN_DATABASE_URL=... node ...');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

const senhaHash = await bcrypt.hash(values.senha, 10);

const master = await prisma.masterUser.upsert({
  where: { email: values.email },
  update: { nome: values.nome, senha: senhaHash, ativo: true },
  create: { email: values.email, nome: values.nome, senha: senhaHash },
});

console.log(`\n✔ Master criado/atualizado: ${master.nome} (${master.email})\n`);
await prisma.$disconnect();
