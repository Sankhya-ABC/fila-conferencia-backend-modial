import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { execSync } from 'child_process';
import { ConfigService } from '@nestjs/config';
import { TenantService } from 'src/core/tenant/tenant.service';
import { SincronizacaoService } from '../sincronizacao/sincronizacao.service';
import { tenantStorage } from 'src/core/tenant/tenant.context';
import { CriarTenantDto, AtualizarTenantDto } from './dto/tenant-manager.dto';

@Injectable()
export class TenantManagerService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly sincronizacaoService: SincronizacaoService,
    private readonly config: ConfigService,
  ) {}

  listar() {
    return this.tenantService.listarTodos();
  }

  buscar(slug: string) {
    return this.tenantService.getConfigParaEdicao(slug);
  }

  async criar(dto: CriarTenantDto) {
    const dbName = `fila_conferencia_${dto.slug}`;
    const adminUrl = this.config.getOrThrow<string>('ADMIN_DATABASE_URL');
    // Deriva host/user/pass/port a partir da ADMIN_DATABASE_URL
    // postgresql://user:pass@host:port/db → postgresql://user:pass@host:port/<dbName>
    const dbUrl = adminUrl.replace(/\/[^/]+$/, `/${dbName}`);

    // 1. Cria banco
    try {
      execSync(
        `docker exec fila-conf-db psql -U postgres -c "CREATE DATABASE \\"${dbName}\\""`,
        { stdio: 'pipe' },
      );
    } catch (e: any) {
      const msg: string = e.stderr?.toString() ?? '';
      if (!msg.includes('already exists')) {
        throw new InternalServerErrorException(
          `Falha ao criar banco: ${msg || e.message}`,
        );
      }
    }

    // 2. Aplica migrations
    try {
      execSync('npx prisma migrate deploy', {
        env: { ...process.env, DATABASE_URL: dbUrl },
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    } catch (e: any) {
      throw new InternalServerErrorException(
        `Falha nas migrations: ${e.stderr?.toString() ?? e.message}`,
      );
    }

    // 3. Registra no admin DB
    try {
      await this.tenantService.criarTenantRecord({
        slug: dto.slug,
        nome: dto.nome,
        dbUrl,
        snkHost: dto.snkHost,
        snkGateway: dto.snkGateway,
        snkXToken: dto.snkXToken,
        snkClientId: dto.snkClientId,
        snkClientSecret: dto.snkClientSecret,
        dbDialect: dto.dbDialect,
        snkModulos: dto.snkModulos,
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException(`Tenant com slug "${dto.slug}" já existe`);
      }
      throw e;
    }

    return { slug: dto.slug, nome: dto.nome };
  }

  async atualizar(slug: string, dto: AtualizarTenantDto) {
    return this.tenantService.atualizarTenant(slug, dto);
  }

  async sincronizar(slug: string) {
    await this.tenantService.getClientForTenant(slug);

    const resultado: Record<string, any> = {};

    await tenantStorage.run(slug, async () => {
      resultado['tipoOperacao'] = await this.sincronizacaoService
        .popularTipoOperacao()
        .catch((e) => ({ erro: e.message }));

      resultado['usuarios'] = await this.sincronizacaoService
        .popularUsuarios()
        .catch((e) => ({ erro: e.message }));

      const prod = await this.sincronizacaoService
        .sincronizarProdutos()
        .catch((e) => ({ erro: e.message }));
      resultado['produtos'] = prod;
    });

    return resultado;
  }
}
