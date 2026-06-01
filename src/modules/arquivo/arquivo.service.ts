import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import { NumeroConferenciaFilter } from '../dto/model';
import { ArquivoHelper } from './arquivo.helper';

@Injectable()
export class ArquivoService {
  constructor(private readonly arquivoHelper: ArquivoHelper) {}

  async downloadEtiqueta({
    numeroConferencia,
  }: NumeroConferenciaFilter): Promise<Buffer | null> {
    const isCubagemNaoDetalhada =
      await this.arquivoHelper.isCubagemNaoDetalhada({
        numeroConferencia,
      });

    let rows;
    if (isCubagemNaoDetalhada) {
      rows = await this.arquivoHelper.obterCubagemNaoDetalhada({
        numeroConferencia,
      });
    } else {
      rows = await this.arquivoHelper.obterCubagemDetalhada({
        numeroConferencia,
      });
    }

    if (!rows?.length) {
      return null;
    }

    const filePath = path.join(
      process.cwd(),
      'src/templates/template-etiqueta.html',
    );

    const html = fs.readFileSync(filePath, 'utf-8');

    const template = Handlebars.compile(html);

    const logoPath = path.join(process.cwd(), 'src/templates/modial-logo.png');

    const logoBase64 = `data:image/png;base64,${fs
      .readFileSync(logoPath)
      .toString('base64')}`;

    const totalVolumes = rows.length;
    const totalVol = String(totalVolumes).padStart(2, '0');

    const volumes = rows.map((row, index) => {
      let seqVol;
      if (isCubagemNaoDetalhada) {
        seqVol = String(index + 1).padStart(2, '0');
      } else {
        seqVol = String(row.seqVol).padStart(2, '0');
      }

      return {
        cliente: row.cliente,
        numeroUnico: row.numeroUnico,
        notaFiscal: row.notaFiscal ? String(row.notaFiscal) : null,
        uf: row.uf ?? '',

        seqVol,
        totalVol,

        notaFiscalDigitos: row.notaFiscal ? String(row.notaFiscal).split('') : [],
        seqVolDigitos: seqVol.split(''),
        totalVolDigitos: totalVol.split(''),

        logoBase64,
      };
    });

    const finalHtml = template({ volumes });

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();

    await page.setContent(finalHtml, {
      waitUntil: 'load',
    });

    const pdfUint8 = await page.pdf({
      width: '425px',
      height: '283px',
      printBackground: true,
    });

    await browser.close();

    return Buffer.from(pdfUint8);
  }
}
