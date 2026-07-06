import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ControleFilter, IDProdutoFilter } from 'src/modules/dto/model';

export class PostRemoverVolumeParams {
  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  numeroConferencia: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  numeroVolume: number;
}

export class GarantirVolumeParams extends PostRemoverVolumeParams {}

export class PostItemConferidoVolume {
  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  numeroConferencia: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  numeroVolume: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  idProduto: number;

  @ApiProperty({ example: 'Rosa' })
  @IsString()
  @IsOptional()
  controle: string;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  quantidadePadrao: number;

  @ApiProperty({ example: 'UN' })
  @IsString()
  @IsNotEmpty()
  unidade: string;

  @ApiProperty({ example: 1.5, required: false })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  peso?: number;
}

export class PostDevolverItemConferido {
  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  numeroConferencia: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  numeroUnico: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  idProduto: number;

  @ApiProperty({ example: 'Rosa' })
  @IsString()
  controle: string;
}

export class CodigosDeBarraParams extends IntersectionType(
  IDProdutoFilter,
  ControleFilter,
) {}

export class MoverItemVolumeParams {
  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  numeroConferencia: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  idProduto: number;

  @ApiProperty({ example: 'Rosa' })
  @IsString()
  @IsOptional()
  controle: string;

  @ApiProperty({ example: 1, required: false })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  seqVolOrigem?: number;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  seqVolDestino: number;

  @ApiProperty({ example: 3, required: false })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  qtd?: number;
}

export class ResolverCodigoBarrasDto {
  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  numeroConferencia: number;

  @ApiProperty({ example: '7891234567890' })
  @IsString()
  @IsNotEmpty()
  codigoBarras: string;
}

export class VerificarItemConferidoVolumeParams extends IntersectionType(
  GarantirVolumeParams,
  CodigosDeBarraParams,
) {}

export class AtualizarItemConferidoVolumeParams extends PostRemoverVolumeParams {
  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  seqItem: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  quantidadePadrao: number;
}

export class InserirItemConferidoVolumeParams extends VerificarItemConferidoVolumeParams {
  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  quantidadePadrao: number;

  @ApiProperty({ example: 'UN' })
  @IsString()
  @IsNotEmpty()
  unidade: string;
}
