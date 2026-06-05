import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { AuthUserService } from 'src/core/guards/auth-user/auth-user.service';
import { SessaoHttpService } from './sessao-http.service';

@ApiTags('Sessão')
@Controller('sessao')
export class SessaoHttpController {
  constructor(
    private readonly service: SessaoHttpService,
    private readonly authUserService: AuthUserService,
  ) {}

  @Post(':numeroUnico/abrir')
  @UseGuards(AuthUserGuard)
  async abrir(
    @Param('numeroUnico', ParseIntPipe) numeroUnico: number,
  ) {
    return this.service.registrarAbertura(numeroUnico);
  }

  // Aceita token via Authorization header (fetch normal) OU via body (sendBeacon)
  @Post(':numeroUnico/fechar')
  @NoAuthApp()
  async fechar(
    @Param('numeroUnico', ParseIntPipe) numeroUnico: number,
    @Req() req: any,
    @Body() body: { token?: string },
  ) {
    const token = req.headers['authorization']?.split(' ')[1] ?? body?.token;
    if (!token) return;
    const session = await this.authUserService.getByToken(token);
    if (!session) return;
    return this.service.registrarFechamento(numeroUnico);
  }

  @Post('heartbeat')
  @UseGuards(AuthUserGuard)
  async heartbeat(
    @Body() body: { numeroConferencia?: number },
    @Req() req: any,
  ) {
    const idUsuario: number = req.user?.idUsuario;
    if (!idUsuario) throw new UnauthorizedException();
    return this.service.registrarHeartbeat(idUsuario, body.numeroConferencia);
  }
}
