import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { DbDialect } from '@prisma/client';

export class CriarTenantDto {
  @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'slug deve conter apenas letras minúsculas, números e hífens' })
  slug: string;

  @IsString() nome: string;
  @IsString() snkHost: string;
  @IsString() snkGateway: string;
  @IsString() snkXToken: string;
  @IsString() snkClientId: string;
  @IsString() snkClientSecret: string;
  @IsOptional() @IsEnum(DbDialect) dbDialect?: DbDialect;
  @IsOptional() @IsString() snkModulos?: string;
}

export class AtualizarTenantDto {
  @IsOptional() @IsString() nome?: string;
  @IsOptional() @IsString() snkHost?: string;
  @IsOptional() @IsString() snkGateway?: string;
  @IsOptional() @IsString() snkXToken?: string;
  @IsOptional() @IsString() snkClientId?: string;
  @IsOptional() @IsString() snkClientSecret?: string;
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsEnum(DbDialect) dbDialect?: DbDialect;
  @IsOptional() @IsString() snkModulos?: string;
}
