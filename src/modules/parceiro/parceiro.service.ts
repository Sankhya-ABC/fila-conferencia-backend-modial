import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { SankhyaLoadRecordsClient } from 'src/http-client/load-records/load-records.client';
import { ParceiroFilter } from './dto/parceiro.dto';

@Injectable()
export class ParceiroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadRecords: SankhyaLoadRecordsClient,
  ) {}

  async getParceiros({ search }: ParceiroFilter) {
    const local = await this.prisma.parceiro.findMany({
      where: {
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { cpfCnpj: { contains: search } },
        ],
      },
      take: 50,
      orderBy: { nome: 'asc' },
    });

    if (local.length > 0) {
      return local.map((p) => ({ id: p.codigo, nome: p.nome, cpfCnpj: p.cpfCnpj }));
    }

    return this.buscarESalvarDoSankhya(search);
  }

  private async buscarESalvarDoSankhya(search: string) {
    const safe = search.replace(/'/g, "''");
    const raw = await this.loadRecords.loadRecords({
      rootEntity: 'Parceiro',
      fieldset: 'CODPARC,RAZAOSOCIAL,CGC_CPF',
      criteria: {
        expression: `UPPER(this.RAZAOSOCIAL) LIKE UPPER('%${safe}%') OR this.CGC_CPF LIKE '%${safe}%'`,
      },
      limit: 50,
    });

    const rows = this.loadRecords.parseEntities(raw);
    const mapped = rows.map((r) => ({
      id: Number(r.CODPARC),
      nome: String(r.RAZAOSOCIAL ?? ''),
      cpfCnpj: (r.CGC_CPF as string | null),
    }));

    if (mapped.length > 0) {
      await Promise.all(
        mapped.map((p) =>
          this.prisma.parceiro.upsert({
            where: { codigo: p.id },
            update: { nome: p.nome, cpfCnpj: p.cpfCnpj },
            create: { codigo: p.id, nome: p.nome, cpfCnpj: p.cpfCnpj },
          }),
        ),
      );
    }

    return mapped;
  }
}
