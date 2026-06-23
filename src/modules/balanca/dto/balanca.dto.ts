import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export enum TipoComunicacao {
  SERIAL_RS232 = 'SERIAL_RS232',
  SERIAL_USB   = 'SERIAL_USB',
  HTTP         = 'HTTP',
  TOLEDO_TCP   = 'TOLEDO_TCP',
}

export enum ProtocoloSerial {
  P05            = 'P05',
  PRT1           = 'PRT1',
  PRT2           = 'PRT2',
  CONTINUO       = 'CONTINUO',
  SOB_REQUISICAO = 'SOB_REQUISICAO',
}

// mantido para backward-compat com separação
export enum ProtocoloBalanca {
  HTTP       = 'HTTP',
  TOLEDO_TCP = 'TOLEDO_TCP',
}

export class CriarBalancaDto {
  @ApiProperty({ example: 'Balança Toledo 1' })
  @IsString() @IsNotEmpty()
  nome: string;

  @ApiProperty({ example: 'Toledo', required: false })
  @IsString() @IsOptional()
  fabricante?: string;

  @ApiProperty({ example: 'Checkout 8217', required: false })
  @IsString() @IsOptional()
  modelo?: string;

  @ApiProperty({ enum: TipoComunicacao, default: TipoComunicacao.SERIAL_RS232, required: false })
  @IsEnum(TipoComunicacao) @IsOptional()
  tipoComunicacao?: TipoComunicacao;

  // ── Serial ──────────────────────────────────────────────────────────────────

  @ApiProperty({ example: 'COM3', required: false })
  @IsString() @IsOptional()
  portaCom?: string;

  @ApiProperty({ example: 4800, required: false })
  @Type(() => Number)
  @IsInt() @IsOptional()
  baudRate?: number;

  @ApiProperty({ example: 8, required: false })
  @Type(() => Number)
  @IsInt() @IsOptional()
  dataBits?: number;

  @ApiProperty({ example: 'NONE', required: false })
  @IsString() @IsOptional()
  paridade?: string;

  @ApiProperty({ example: 1, required: false })
  @Type(() => Number)
  @IsInt() @IsOptional()
  stopBits?: number;

  @ApiProperty({ enum: ProtocoloSerial, default: ProtocoloSerial.P05, required: false })
  @IsString() @IsOptional()
  protocoloSerial?: string;

  // ── Rede (backward compat) ──────────────────────────────────────────────────

  @ApiProperty({ enum: ProtocoloBalanca, default: ProtocoloBalanca.HTTP, required: false })
  @IsEnum(ProtocoloBalanca) @IsOptional()
  protocolo?: ProtocoloBalanca;

  @ApiProperty({ example: '192.168.1.100', required: false })
  @IsString() @IsOptional()
  ip?: string;

  @ApiProperty({ example: 8000, required: false })
  @Type(() => Number)
  @IsInt() @Min(1) @Max(65535) @IsOptional()
  porta?: number;

  @ApiProperty({ example: '/peso', required: false })
  @IsString() @IsOptional()
  rota?: string;

  @ApiProperty({ example: true, required: false })
  @IsBoolean() @IsOptional()
  ativo?: boolean;
}

export class AtualizarBalancaDto extends PartialType(CriarBalancaDto) {}

export class TestarConexaoDiretaDto {
  @IsString() @IsNotEmpty()
  portaCom: string;

  @Type(() => Number) @IsInt()
  baudRate: number;

  @Type(() => Number) @IsInt()
  dataBits: number;

  @IsString()
  paridade: string;

  @Type(() => Number) @IsInt()
  stopBits: number;

  @IsString()
  protocoloSerial: string;
}
