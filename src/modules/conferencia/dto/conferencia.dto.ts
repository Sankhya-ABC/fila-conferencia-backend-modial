import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import {
  IdUsuarioFilter,
  NumeroConferenciaFilter,
  NumeroUnicoFilter,
  PaginationFilter,
} from 'src/modules/dto/model';

export class FilaConferenciaFilter extends PaginationFilter {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  codigoStatus?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  numeroModial?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  numeroNota?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  numeroUnico?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  dataInicio?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  dataFim?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  idParceiro?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  idEmpresa?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  codigoTipoMovimento?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  codigoTipoOperacao?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  codigoTipoEntrega?: string;
}

export class IniciarConferenciaBody extends IntersectionType(
  IdUsuarioFilter,
  NumeroUnicoFilter,
) {}

export class AtualizarCabecalhoConferenciaParams extends IntersectionType(
  NumeroUnicoFilter,
  NumeroConferenciaFilter,
  IdUsuarioFilter,
) {}

export class AtualizarCabecalhoNotaParams extends IntersectionType(
  NumeroUnicoFilter,
  NumeroConferenciaFilter,
) {}

export class FaturarNotaDto {
  @Type(() => Number) @IsInt() nunota: number;
  @Type(() => Number) @IsInt() codTipOper: number;
  @IsOptional() @IsString() serie?: string;
}
