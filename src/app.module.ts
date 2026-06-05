import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthAppGuard } from './core/guards/auth-app/auth-app.guard';
import { AuthAppModule } from './core/guards/auth-app/auth-app.module';
import { envMapping, envSchema } from './core/config/env.schema';
import { AuthModule } from './modules/auth/auth.module';
import { EmpresaModule } from './modules/empresa/empresa.module';
import { ConferenciaModule } from './modules/conferencia/conferencia.module';
import { ParceiroModule } from './modules/parceiro/parceiro.module';
import { SeparacaoModule } from './modules/separacao/separacao.module';
import { DominioModule } from './modules/dominio/dominio.module';
import { LoggerModule } from './core/logger/logger.module';
import { LoggerInterceptor } from './core/logger/logger.interceptor';
import { ArquivoModule } from './modules/arquivo/arquivo.module';
import { VolumeModule } from './modules/volume/volume.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SincronizacaoModule } from './modules/sincronizacao/sincronizacao.module';
import { UsuarioModule } from './modules/usuario/usuario.module';
import { SessaoHttpModule } from './modules/sessao-http/sessao-http.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuthAppModule,
    ConferenciaModule,
    DominioModule,
    ParceiroModule,
    EmpresaModule,
    SeparacaoModule,
    SincronizacaoModule,
    ArquivoModule,
    VolumeModule,
    UsuarioModule,
    SessaoHttpModule,
    DashboardModule,
    AuthModule,
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envMapping],
      validationSchema: envSchema,
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AuthAppGuard },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggerInterceptor,
    },
  ],
})
export class AppModule {}
