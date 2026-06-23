import { Body, Controller, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { AuthUserService } from 'src/core/guards/auth-user/auth-user.service';
import { SessaoHttpService } from './sessao-http.service';

@ApiTags('Sessão')
@NoAuthApp()
@Controller('sessao')
export class SessaoHttpController {
  constructor(
    private readonly service: SessaoHttpService,
    private readonly authUserService: AuthUserService,
  ) {}

  private async resolveIdUsuario(req: any, bodyToken?: string): Promise<number | null> {
    const token = req.headers['authorization']?.split(' ')[1] ?? bodyToken;
    if (!token) return null;
    const session = await this.authUserService.getByToken(token);
    return session?.idUsuario ?? null;
  }

  @Post(':numeroUnico/abrir')
  async abrir(
    @Param('numeroUnico', ParseIntPipe) numeroUnico: number,
    @Req() req: any,
    @Body() body: { token?: string },
  ) {
    const idUsuario = await this.resolveIdUsuario(req, body?.token);
    if (idUsuario == null) return;
    return this.service.registrarAbertura(numeroUnico);
  }

  // Aceita token via Authorization header (fetch normal) OU via body (sendBeacon)
  @Post(':numeroUnico/fechar')
  async fechar(
    @Param('numeroUnico', ParseIntPipe) numeroUnico: number,
    @Req() req: any,
    @Body() body: { token?: string },
  ) {
    const idUsuario = await this.resolveIdUsuario(req, body?.token);
    if (idUsuario == null) return;
    return this.service.registrarFechamento(numeroUnico);
  }

  @Post('heartbeat')
  async heartbeat(@Body() body: { numeroConferencia?: number }, @Req() req: any) {
    const idUsuario = await this.resolveIdUsuario(req);
    if (idUsuario == null) return; // sessão sem idUsuario — ignora silenciosamente
    return this.service.registrarHeartbeat(idUsuario, body.numeroConferencia);
  }
}
