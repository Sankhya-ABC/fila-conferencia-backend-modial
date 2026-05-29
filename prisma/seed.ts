import { PrismaClient, Perfil } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash('senha123', 10);

  await prisma.user.upsert({
    where: { email: 'joaoh@sankhya.com.br' },
    update: {},
    create: {
      codigo: 999999,
      nome: 'super.separador',
      email: 'joaoh@sankhya.com.br',
      senha: senhaHash,
      perfil: Perfil.ADMINISTRADOR,
      ativo: true,
    },
  });

  console.log('Seed: admin criado — joaoh@sankhya.com.br / senha123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
