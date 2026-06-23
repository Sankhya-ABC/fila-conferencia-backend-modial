import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TenantService } from '../src/core/tenant/tenant.service';
import { SincronizacaoService } from '../src/modules/sincronizacao/sincronizacao.service';
import { tenantStorage } from '../src/core/tenant/tenant.context';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const tenantService = app.get(TenantService);
  const sincronizacao = app.get(SincronizacaoService);

  const tenants = await tenantService.listarAtivos();
  console.log(`\nTenants ativos: ${tenants.map((t) => t.nome).join(', ')}\n`);

  for (const tenant of tenants) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`SINCRONIZANDO: ${tenant.nome.toUpperCase()} (${tenant.slug})`);
    console.log('='.repeat(50));

    await tenantService.getClientForTenant(tenant.slug);

    await tenantStorage.run(tenant.slug, async () => {
      console.log('\n[1/3] Tipo de Operação...');
      await sincronizacao
        .popularTipoOperacao()
        .catch((e) => console.error('  ERRO:', e.message));

      console.log('\n[2/3] Usuários...');
      await sincronizacao
        .popularUsuarios()
        .catch((e) => console.error('  ERRO:', e.message));

      console.log('\n[3/3] Produtos e Códigos...');
      const res = await sincronizacao.sincronizarProdutos().catch((e) => {
        console.error('  ERRO:', e.message);
        return null;
      });
      if (res) {
        console.log(
          `  ✔ ${res.produtos} produtos, ${res.imagens} imagens, ${res.codigos} códigos`,
        );
      }
    });

    console.log(`\n✔ ${tenant.nome} sincronizado.`);
  }

  await app.close();
  console.log('\nSincronização completa!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
