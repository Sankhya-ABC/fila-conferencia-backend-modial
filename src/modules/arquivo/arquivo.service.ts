import { Injectable } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import { NumeroConferenciaFilter } from '../dto/model';
import { ArquivoHelper } from './arquivo.helper';
import { formatarDataHoraBR } from '../../core/utils/data-hora.util';
import { tenantStorage } from '../../core/tenant/tenant.context';

// Logo por tenant na etiqueta de volume — cada cliente pode ter (ou não) sua
// própria marca impressa. Fora daqui, nenhum tenant mostra logo.
const LOGO_POR_TENANT: Record<string, string> = {
  modial: 'modial-logo.png',
};

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

    const slug = tenantStorage.getStore() ?? '';
    const logoArquivo = LOGO_POR_TENANT[slug];
    const logoBase64 = logoArquivo
      ? `data:image/png;base64,${fs
          .readFileSync(path.join(process.cwd(), 'src/templates', logoArquivo))
          .toString('base64')}`
      : null;

    const totalVolumes = rows.length;
    const totalVol = String(totalVolumes).padStart(2, '0');

    const printDateTime = formatarDataHoraBR();

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

  private async gerarCodigoBarrasBase64(codigo: string | number): Promise<string> {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: String(codigo),
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
      textfont: 'Helvetica',
      textsize: 8,
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  }

  async downloadMapaSeparacao(
    numeroUnico: number,
    tipo: 'PESAVEL' | 'NAO_PESAVEL',
  ): Promise<Buffer | null> {
    const dados = await this.arquivoHelper.obterMapaSeparacao(numeroUnico, tipo);
    if (!dados.itens.length) return null;

    const filePath = path.join(
      process.cwd(),
      'src/templates/template-mapa-separacao.html',
    );
    const html = fs.readFileSync(filePath, 'utf-8');
    const template = Handlebars.compile(html);

    const itens = await Promise.all(
      dados.itens.map(async (item) => ({
        ...item,
        codigoBarrasBase64: await this.gerarCodigoBarrasBase64(item.idProduto),
      })),
    );

    const finalHtml = template({
      ...dados,
      itens,
      tipoLabel: tipo === 'PESAVEL' ? 'Pesável' : 'Não Pesável',
      totalItens: dados.itens.length,
      printDateTime: formatarDataHoraBR(),
    });

    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();

    await page.setContent(finalHtml, { waitUntil: 'load' });

    const pdfUint8 = await page.pdf({ format: 'A4', printBackground: true });

    await browser.close();

    return Buffer.from(pdfUint8);
  }
}
