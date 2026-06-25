import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class SessaoHttpService {
  constructor(private readonly prisma: PrismaService) {}

  async registrarAbertura(numeroUnico: number) {
    await this.prisma.sessaoConferencia.updateMany({
      where: { numeroUnico, dtAbertura: null, status: { not: 'F' } },
      data: { dtAbertura: new Date() },
    });
  }

  async registrarFechamento(numeroUnico: number) {
    await this.prisma.sessaoConferencia.updateMany({
      where: { numeroUnico, dtFechamento: null, status: { not: 'F' } },
      data: { dtFechamento: new Date() },
    });
  }

  async registrarHeartbeat(idUsuario: number, numeroConferencia?: number) {
    await this.prisma.logHeartbeat.create({
      data: { idUsuario, numeroConferencia: numeroConferencia ?? null },
    });
  }
}
