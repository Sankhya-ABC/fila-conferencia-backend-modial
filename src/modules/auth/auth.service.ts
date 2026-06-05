import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';
import { AuthUserService } from 'src/core/guards/auth-user/auth-user.service';
import { PrismaService } from 'prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly authUserService: AuthUserService,
    private prisma: PrismaService,
    private emailService: EmailService,
    private config: ConfigService,
  ) {}

  async login(body: { usuario: string; senha: string }) {
    const { usuario, senha } = body;

    const user = await this.prisma.user.findFirst({
      where: { email: usuario },
    });

    if (!user || !user.senha) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);

    if (!senhaValida) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    if (!user.ativo) {
      throw new UnauthorizedException(
        'Usuário inativo. Contate o administrador.',
      );
    }

    const token = randomUUID();

    await this.authUserService.set(user.codigo, {
      token,
      nome: user.nome,
      idUsuario: user.codigo,
    });

    await this.prisma.logLogin.create({ data: { idUsuario: user.codigo } });

    return {
      token,
      nome: user.nome,
      idUsuario: user.codigo,
      perfil: user.perfil,
    };
  }

  async esqueciMinhaSenha(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { message: 'Se o email existir, enviaremos instruções.' };
    }

    const token = randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 1000 * 60 * 30);

    await this.prisma.user.update({
      where: { email },
      data: {
        resetToken: token,
        resetTokenExp: exp,
      },
    });

    const link = `${this.config.get<string>('APP_FRONTEND_HOST')}/redefinir-senha?token=${token}&email=${email}`;

    await this.emailService.enviarEmailRecuperacao(email, link);

    return { message: 'Se o email existir, enviaremos instruções.' };
  }

  async redefinirSenha(email: string, token: string, novaSenha: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        resetToken: token,
      },
    });

    if (!user) {
      throw new BadRequestException('Token inválido');
    }

    if (!user.resetTokenExp || user.resetTokenExp < new Date()) {
      throw new BadRequestException('Token expirado');
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);

    await this.prisma.user.update({
      where: { email },
      data: {
        senha: senhaHash,
        resetToken: null,
        resetTokenExp: null,
      },
    });

    return { message: 'Senha redefinida com sucesso!' };
  }
}
