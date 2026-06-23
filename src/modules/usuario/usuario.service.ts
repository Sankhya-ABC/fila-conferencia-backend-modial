import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { TenantService } from 'src/core/tenant/tenant.service';
import { tenantStorage } from 'src/core/tenant/tenant.context';
import { CriarUsuarioDto, AtualizarUsuarioDto } from './dto/usuario-crud.dto';

@Injectable()
export class UsuarioService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private tenantService: TenantService,
  ) {}

  async getUsuarios(params: any) {
    const { nomeEmail, perfil, status, page = 0, perPage = 5 } = params;
    const safePerPage = Math.min(Number(perPage), 100);

    const where: any = {};

    if (nomeEmail) {
      where.OR = [
        { nome: { contains: nomeEmail, mode: 'insensitive' } },
        { email: { contains: nomeEmail, mode: 'insensitive' } },
      ];
    }

    if (perfil) {
      where.perfil = perfil;
    }

    if (status !== undefined && status !== null && status !== '') {
      where.ativo = status === 'true' || status === true;
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: Number(page) * safePerPage,
        take: safePerPage,
        orderBy: { nome: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const treatedData = data.map((usuario) => {
      let foto: string | null = null;
      if (usuario.foto) {
        foto = Buffer.from(usuario.foto, 'hex').toString('base64');
      }
      return {
        codigo: usuario.codigo,
        nome: usuario.nome,
        email: usuario.email,
        foto: foto,
        perfil: usuario.perfil,
        ativo: usuario.ativo,
        criadoEm: usuario.createdAt,
        atualizadoEm: usuario.updatedAt,
      };
    });

    return { data: treatedData, total };
  }

  async toogleStatus(codigo: number) {
    const user = await this.prisma.user.findUnique({ where: { codigo } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.user.update({
      where: { codigo },
      data: { ativo: !user.ativo },
    });
  }

  async redefinirAtivarLote(emails: string[]) {
    const tenant = tenantStorage.getStore()!;
    const existentes: string[] = [];
    const naoExistentes: string[] = [];

    await Promise.all(
      emails.map(async (email) => {
        const user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
          return naoExistentes.push(email);
        }

        existentes.push(email);

        await this.prisma.user.update({
          where: { codigo: user.codigo },
          data: { ativo: true },
        });

        // Vincula o usuário ao tenant no DB admin
        await this.tenantService.addTenantUser(email, tenant);

        await this.authService.esqueciMinhaSenha(email);
      }),
    );

    return {
      message: 'Processamento concluído',
      sucesso: existentes,
      erro: naoExistentes,
    };
  }

  async criarUsuario(dto: CriarUsuarioDto) {
    const tenant = tenantStorage.getStore()!;

    const existente = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existente) throw new BadRequestException('E-mail já cadastrado');

    const maxCodigo = await this.prisma.user.aggregate({
      _max: { codigo: true },
    });
    const proximoCodigo = Math.max((maxCodigo._max.codigo ?? 0) + 1, 90000);

    const senhaHash = await bcrypt.hash(dto.senha, 10);

    const user = await this.prisma.user.create({
      data: {
        codigo: proximoCodigo,
        nome: dto.nome,
        email: dto.email,
        perfil: dto.perfil,
        senha: senhaHash,
        ativo: true,
      },
    });

    await this.tenantService.addTenantUser(dto.email, tenant);

    return {
      codigo: user.codigo,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      ativo: user.ativo,
    };
  }

  async atualizarUsuario(codigo: number, dto: AtualizarUsuarioDto) {
    const user = await this.prisma.user.findUnique({ where: { codigo } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.perfil !== undefined) data.perfil = dto.perfil;
    if (dto.senha !== undefined) data.senha = await bcrypt.hash(dto.senha, 10);

    if (dto.email !== undefined && dto.email !== user.email) {
      const existente = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existente) throw new BadRequestException('E-mail já em uso');
      data.email = dto.email;

      const tenant = tenantStorage.getStore()!;
      await this.tenantService.removeTenantUser(user.email);
      await this.tenantService.addTenantUser(dto.email, tenant);
    }

    const updated = await this.prisma.user.update({
      where: { codigo },
      data,
    });

    return {
      codigo: updated.codigo,
      nome: updated.nome,
      email: updated.email,
      perfil: updated.perfil,
      ativo: updated.ativo,
    };
  }

  async deletarUsuario(codigo: number) {
    const user = await this.prisma.user.findUnique({ where: { codigo } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    await this.prisma.user.delete({ where: { codigo } });
    await this.tenantService.removeTenantUser(user.email);

    return { message: 'Usuário removido com sucesso' };
  }
}
