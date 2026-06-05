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

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const printDateTime = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

    const volumes = rows.map((row, index) => {
      let seqVol;
      if (isCubagemNaoDetalhada) {
        seqVol = String(index + 1).padStart(2, '0');
      } else {
        seqVol = String(row.seqVol).padStart(2, '0');
      }

      return {
        cliente: row.cliente,
        numTalao: row.numTalao ?? '',
        uf: row.uf ?? '',

        seqVolDig1: seqVol[0] ?? '0',
        seqVolDig2: seqVol[1] ?? '0',
        totalVolDig1: totalVol[0] ?? '0',
        totalVolDig2: totalVol[1] ?? '0',

        logoBase64,
        printDateTime,
      };
    });

    const finalHtml = template({ volumes });

    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();

    await page.setContent(finalHtml, {
      waitUntil: 'load',
    });

    const pdfUint8 = await page.pdf({
      width: '15cm',
      height: '10cm',
      printBackground: true,
    });

    await browser.close();

    return Buffer.from(pdfUint8);
  }
}
