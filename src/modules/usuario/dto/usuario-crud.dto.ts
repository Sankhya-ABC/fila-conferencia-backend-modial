import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Perfil } from '@prisma/client';

export class CriarUsuarioDto {
  @IsString() nome: string;
  @IsString() email: string;
  @IsEnum(Perfil) perfil: Perfil;
  @IsString() @MinLength(6) senha: string;
}

export class AtualizarUsuarioDto {
  @IsOptional() @IsString() nome?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsEnum(Perfil) perfil?: Perfil;
  @IsOptional() @IsString() @MinLength(6) senha?: string;
}
