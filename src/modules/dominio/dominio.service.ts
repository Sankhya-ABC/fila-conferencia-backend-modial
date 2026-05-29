import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { SankhyaLoadRecordsClient } from 'src/http-client/load-records/load-records.client';

@Injectable()
export class DominioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadRecords: SankhyaLoadRecordsClient,
  ) {}

  getStatus() {
    return [
      { codigo: 'A',  descricao: 'Em andamento' },
      { codigo: 'AC', descricao: 'Aguardando conferência' },
      { codigo: 'AL', descricao: 'Aguardando liberação p/ conferência' },
      { codigo: 'C',  descricao: 'Aguardando liberação de corte' },
      { codigo: 'D',  descricao: 'Finalizada divergente' },
      { codigo: 'F',  descricao: 'Finalizada OK' },
      { codigo: 'R',  descricao: 'Aguardando recontagem' },
      { codigo: 'RA', descricao: 'Recontagem em andamento' },
      { codigo: 'RD', descricao: 'Recontagem finalizada divergente' },
      { codigo: 'RF', descricao: 'Recontagem finalizada OK' },
      { codigo: 'Z',  descricao: 'Aguardando finalização' },
    ];
  }

  getTipoMovimento() {
    return [
      { codigo: 'P', descricao: 'Pedido de Vendas' },
      { codigo: 'V', descricao: 'Venda' },
      { codigo: 'O', descricao: 'Pedido de Compra' },
      { codigo: 'C', descricao: 'Compra' },
    ];
  }

  getTipoEntrega() {
    return [
      { codigo: '1', descricao: 'Transportadora' },
      { codigo: '2', descricao: 'Cliente Retira' },
      { codigo: '3', descricao: 'Modial Entrega' },
      { codigo: '4', descricao: 'Correios' },
      { codigo: '5', descricao: 'Retira Feira' },
      { codigo: '6', descricao: 'Evento Modial' },
    ];
  }

  async getTipoOperacao() {
    const local = await this.prisma.dominio.findMany({
      where: { tipo: 'TIPO_OPERACAO' },
      select: { codigo: true, descricao: true },
      orderBy: { codigo: 'asc' },
    });

    if (local.length > 0) {
      return local;
    }

    await this.sincronizarTipoOperacao();

    return this.prisma.dominio.findMany({
      where: { tipo: 'TIPO_OPERACAO' },
      select: { codigo: true, descricao: true },
      orderBy: { codigo: 'asc' },
    });
  }

  private async sincronizarTipoOperacao() {
    const registros: Record<string, any>[] = [];
    let page = 0;
    while (true) {
      const raw = await this.loadRecords.loadRecords({
        rootEntity: 'TipoOperacao',
        fieldset: 'CODTIPOPER,DESCROPER',
        criteria: { expression: 'NUCCO IS NOT NULL' },
        offsetPage: page,
      });
      registros.push(...this.loadRecords.parseEntities(raw));
      if (!this.loadRecords.hasNextPage(raw)) break;
      page++;
    }

    await Promise.all(
      registros.map((r) =>
        this.prisma.dominio.upsert({
          where: { tipo_codigo: { tipo: 'TIPO_OPERACAO', codigo: String(r.CODTIPOPER) } },
          update: { descricao: r.DESCROPER },
          create: { tipo: 'TIPO_OPERACAO', codigo: String(r.CODTIPOPER), descricao: r.DESCROPER },
        }),
      ),
    );
  }
}
