import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';
import { AuthUserService } from 'src/core/guards/auth-user/auth-user.service';
import { MasterAuthService } from 'src/core/master/master-auth.service';
import { PrismaService } from 'prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TenantService } from 'src/core/tenant/tenant.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authUserService: AuthUserService,
    private readonly masterAuthService: MasterAuthService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly tenantService: TenantService,
  ) {}

  async logout(token: string) {
    await Promise.all([
      this.authUserService.deleteByToken(token),
      this.masterAuthService.delete(token),
    ]);
  }

  async login(body: { usuario: string; senha: string }) {
    const { usuario, senha } = body;

    // Verifica se é usuário master (sem tenant)
    const masterUser = await this.tenantService.findMasterUser(usuario);
    if (masterUser) {
      if (!masterUser.ativo) {
        throw new UnauthorizedException('Usuário master inativo.');
      }
      const senhaValida = await bcrypt.compare(senha, masterUser.senha);
      if (!senhaValida) {
        throw new UnauthorizedException('Usuário ou senha inválidos');
      }
      const token = randomUUID();
      await this.masterAuthService.set({ token, id: masterUser.id, nome: masterUser.nome, email: masterUser.email });
      return { token, nome: masterUser.nome, idUsuario: 0, perfil: 'MASTER' };
    }

    // Identifica o tenant a partir do e-mail
    const tenantRecord = await this.tenantService
      .findTenantByEmail(usuario)
      .catch(() => null);

    if (!tenantRecord) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    const tenantSlug = tenantRecord.tenantSlug;
    const db = await this.prisma.getClient(tenantSlug);

    const user = await db.user.findFirst({ where: { email: usuario } });

    if (!user || !user.senha) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    if (!user.ativo) {
      throw new UnauthorizedException('Usuário inativo. Contate o administrador.');
    }

    const token = randomUUID();

    await this.authUserService.set(user.codigo, {
      token,
      nome: user.nome,
      idUsuario: user.codigo,
      tenant: tenantSlug,
      perfil: user.perfil,
    });

    await db.logLogin.create({ data: { idUsuario: user.codigo } });

    const tenantCfg = await this.tenantService.getConfig(tenantSlug);

    return {
      token,
      nome: user.nome,
      idUsuario: user.codigo,
      perfil: user.perfil,
      snkModulos: (tenantCfg as any).snkModulos ?? '',
      resetarSenha: (user as any).resetarSenha ?? false,
    };
  }

  async esqueciMinhaSenha(email: string) {
    const tenantRecord = await this.tenantService
      .findTenantByEmail(email)
      .catch(() => null);

    if (!tenantRecord) {
      return { message: 'Se o email existir, enviaremos instruções.' };
    }

    const db = await this.prisma.getClient(tenantRecord.tenantSlug);
    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      return { message: 'Se o email existir, enviaremos instruções.' };
    }

    const token = randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 1000 * 60 * 30);

    await db.user.update({
      where: { email },
      data: { resetToken: token, resetTokenExp: exp },
    });

    const link = `${this.config.get<string>('APP_FRONTEND_HOST')}/redefinir-senha?token=${token}`;
    await this.emailService.enviarEmailRecuperacao(email, link);

    return { message: 'Se o email existir, enviaremos instruções.' };
  }

  async redefinirSenha(email: string, token: string, novaSenha: string) {
    const tenantRecord = await this.tenantService
      .findTenantByEmail(email)
      .catch(() => null);

    if (!tenantRecord) {
      throw new BadRequestException('Token inválido');
    }

    const db = await this.prisma.getClient(tenantRecord.tenantSlug);
    const user = await db.user.findFirst({ where: { email, resetToken: token } });

    if (!user) {
      throw new BadRequestException('Token inválido');
    }

    if (!user.resetTokenExp || user.resetTokenExp < new Date()) {
      throw new BadRequestException('Token expirado');
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);

    await db.user.update({
      where: { email },
      data: { senha: senhaHash, resetToken: null, resetTokenExp: null },
    });

    return { message: 'Senha redefinida com sucesso.' };
  }
}
