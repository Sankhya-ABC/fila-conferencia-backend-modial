import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NoAuthApp } from 'src/core/guards/auth-app/no-auth-app.decorator';
import { LoginRequest } from 'src/modules/auth/dto/auth.dto';
import { AuthService } from './auth.service';

@ApiTags('Auths')
@Controller('auths')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login' })
  login(@Body() body: LoginRequest) {
    return this.service.login(body);
  }

  @NoAuthApp()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout — invalida sessão no Redis' })
  logout(@Headers('authorization') auth: string) {
    const token = auth?.split(' ')[1];
    if (token) return this.service.logout(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('esqueci-minha-senha')
  async esqueciMinhaSenha(@Body('email') email: string) {
    await this.service.esqueciMinhaSenha(email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('redefinir-senha')
  async redefinirSenha(
    @Body() body: { email: string; token: string; senha: string },
  ) {
    return this.service.redefinirSenha(body.email, body.token, body.senha);
  }
}
