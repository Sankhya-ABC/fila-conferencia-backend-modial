import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { RolesGuard } from 'src/core/guards/auth-user/roles.guard';
import { Roles } from 'src/core/guards/auth-user/roles.decorator';
import { UsuarioService } from './usuario.service';
import { AlterarSenhaDto, CriarUsuarioDto, AtualizarUsuarioDto } from './dto/usuario-crud.dto';

@UseGuards(AuthUserGuard, RolesGuard)
@Controller('usuarios')
export class UsuarioController {
  constructor(private readonly service: UsuarioService) {}

  @Get()
  async getUsuarios(@Query() query: any) {
    return this.service.getUsuarios(query);
  }

  @Post()
  @Roles('ADMINISTRADOR')
  async criarUsuario(@Body() dto: CriarUsuarioDto) {
    return this.service.criarUsuario(dto);
  }

  @Put(':codigo')
  @Roles('ADMINISTRADOR')
  async atualizarUsuario(
    @Param('codigo') codigo: string,
    @Body() dto: AtualizarUsuarioDto,
  ) {
    return this.service.atualizarUsuario(Number(codigo), dto);
  }

  @Delete(':codigo')
  @Roles('ADMINISTRADOR')
  async deletarUsuario(@Param('codigo') codigo: string) {
    return this.service.deletarUsuario(Number(codigo));
  }

  @Patch(':codigo/status')
  @Roles('ADMINISTRADOR')
  async toogleStatus(@Param('codigo') codigo: number) {
    return this.service.toogleStatus(Number(codigo));
  }

  @Patch(':codigo/senha')
  async alterarSenha(
    @Param('codigo') codigo: string,
    @Body() dto: AlterarSenhaDto,
    @Req() req: any,
  ) {
    return this.service.alterarSenha(Number(codigo), dto.novaSenha, req.user);
  }

  @Post('redefinir-ativar-lote')
  @Roles('ADMINISTRADOR')
  async redefinirAtivarLote(@Body('emails') emails: string[]) {
    return this.service.redefinirAtivarLote(emails);
  }

  @Post('reparar-tenant-users')
  @Roles('ADMINISTRADOR')
  async repararTenantUsers() {
    return this.service.repararTenantUsers();
  }
}
