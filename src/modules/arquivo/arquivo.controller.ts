import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthUserGuard } from 'src/core/guards/auth-user/auth-user.guard';
import { NumeroConferenciaFilter, NumeroUnicoFilter } from '../dto/model';
import { ArquivoService } from './arquivo.service';
import { IsIn } from 'class-validator';

class MapaSeparacaoQuery extends NumeroUnicoFilter {
  @IsIn(['PESAVEL', 'NAO_PESAVEL'])
  tipo: 'PESAVEL' | 'NAO_PESAVEL';
}

@UseGuards(AuthUserGuard)
@ApiTags('Arquivos')
@Controller('arquivos')
export class ArquivoController {
  constructor(private readonly service: ArquivoService) {}

  @Get('etiqueta/download')
  @ApiOperation({ summary: 'Baixar Etiquetas' })
  async downloadEtiqueta(
    @Query() queryParam: NumeroConferenciaFilter,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const pdfBuffer = await this.service.downloadEtiqueta(queryParam);

    if (!pdfBuffer) {
      reply.status(404).send('Nenhuma etiqueta encontrada');
      return;
    }

    reply
      .type('application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename=etiquetas_conferencia_${queryParam.numeroConferencia}.pdf`,
      )
      .send(pdfBuffer);
  }

  @Get('mapa-separacao/download')
  @ApiOperation({ summary: 'Baixar Mapa de Separação (guia pesável / não-pesável)' })
  async downloadMapaSeparacao(
    @Query() queryParam: MapaSeparacaoQuery,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const pdfBuffer = await this.service.downloadMapaSeparacao(
      Number(queryParam.numeroUnico),
      queryParam.tipo,
    );

    if (!pdfBuffer) {
      reply.status(404).send('Nenhum item encontrado para esta guia');
      return;
    }

    reply
      .type('application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename=mapa_separacao_${queryParam.tipo.toLowerCase()}_${queryParam.numeroUnico}.pdf`,
      )
      .send(pdfBuffer);
  }
}
