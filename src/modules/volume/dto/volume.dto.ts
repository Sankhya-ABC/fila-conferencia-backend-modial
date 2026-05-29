import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class PostAtualizarDimensoesVolumeDetalhadoParams {
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
  @IsOptional()
  largura?: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  comprimento?: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  altura?: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  peso?: number;
}

export class PostAtualizarDimensoesVolumeNaoDetalhadoLoteParams extends OmitType(
  PostAtualizarDimensoesVolumeDetalhadoParams,
  ['numeroVolume'],
) {
  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  numeroVolume: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  alturaAntiga?: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  larguraAntiga?: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  comprimentoAntigo?: number;

  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  pesoAntigo?: number;
}

export class PostAtualizarDimensoesVolumeParams extends PostAtualizarDimensoesVolumeNaoDetalhadoLoteParams {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  qtdVol?: number;
}

export class GerarVolumesLoteParams extends OmitType(
  PostAtualizarDimensoesVolumeDetalhadoParams,
  ['numeroVolume'],
) {
  @ApiProperty({ example: 1234 })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  quantidadeLote: number;
}

export class DeletarVolumesLoteParams extends OmitType(
  PostAtualizarDimensoesVolumeDetalhadoParams,
  ['numeroVolume'],
) {}
