import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { SankhyaLoadRecordsClient } from 'src/http-client/load-records/load-records.client';
import { EmpresaFilter } from './dto/empresa.dto';

@Injectable()
export class EmpresaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadRecords: SankhyaLoadRecordsClient,
  ) {}

  async getEmpresas({ search }: EmpresaFilter) {
    const local = await this.prisma.empresa.findMany({
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
      return local.map((e) => ({ id: e.codigo, nome: e.nome, cpfCnpj: e.cpfCnpj }));
    }

    return this.buscarESalvarDoSankhya(search);
  }

  private async buscarESalvarDoSankhya(search: string) {
    const safe = search.replace(/'/g, "''");
    const raw = await this.loadRecords.loadRecords({
      rootEntity: 'Empresa',
      fieldset: 'CODEMP,RAZAOSOCIAL,CGC',
      criteria: {
        expression: `UPPER(this.RAZAOSOCIAL) LIKE UPPER('%${safe}%') OR this.CGC LIKE '%${safe}%'`,
      },
      limit: 50,
    });

    const rows = this.loadRecords.parseEntities(raw);
    const mapped = rows.map((r) => ({
      id: Number(r.CODEMP),
      nome: String(r.RAZAOSOCIAL ?? ''),
      cpfCnpj: (r.CGC as string | null),
    }));

    if (mapped.length > 0) {
      await Promise.all(
        mapped.map((e) =>
          this.prisma.empresa.upsert({
            where: { codigo: e.id },
            update: { nome: e.nome, cpfCnpj: e.cpfCnpj },
            create: { codigo: e.id, nome: e.nome, cpfCnpj: e.cpfCnpj },
          }),
        ),
      );
    }

    return mapped;
  }
}
