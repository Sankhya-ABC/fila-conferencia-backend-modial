import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ordemCarga?: string;
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

export class ConcluirEtapaBody extends NumeroConferenciaFilter {
  @IsString() tipo: 'PESAVEL' | 'NAO_PESAVEL';

  // true = conclui mesmo com item pendente nessa categoria (divergência assumida)
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  manterPendente?: boolean;
}

export class FinalizarConferenciaBody extends NumeroConferenciaFilter {
  // true = finaliza mantendo os itens não conferidos como pendentes no pedido
  // (sem cortar). false/ausente = comportamento atual: corta o que não foi
  // conferido (ConferenciaSP.cortar).
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  manterPendente?: boolean;
}

export class ValidarLiberadorBody {
  @IsString() usuario: string;
  @IsString() senha: string;
}

export class LiberarCorteBody extends NumeroConferenciaFilter {
  // Usuário/senha do Sankhya de quem está aprovando/negando — a própria SP
  // de liberação (LiberacaoLimitesSP) exige essa validação, igual o app
  // nativo faz na tela de liberação.
  @IsString() usuario: string;
  @IsString() senha: string;

  // 'S' = libera o corte, 'N' = nega.
  @IsString() liberar: 'S' | 'N';

  // SEQUENCIA dos itens selecionados pelo operador (de
  // GET /conferencias/liberacoes-pendentes) — a ação roda em lote só pra
  // esses, não pra todos os pendentes da conferência.
  @IsInt({ each: true })
  sequencias: number[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  obs?: string;
}
