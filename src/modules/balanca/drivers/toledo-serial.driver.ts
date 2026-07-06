import { BalancaCompleta } from '../balanca.types';
import { BalancaDriver } from './balanca-driver.interface';

/**
 * Driver Toledo — porta serial RS-232 / USB virtual COM.
 * Suporta protocolos: P05 (contínuo), PRT1, PRT2, SOB_REQUISICAO.
 */
export class ToledoSerialDriver implements BalancaDriver {
  private _port: any = null;
  private _config?: BalancaCompleta;
  private _buffer = '';

  _pesoCurrent = 0; // público para MockDriver e simularPeso injetarem valor
  private _conectado = false;
  private _erro?: string;

  get conectado() { return this._conectado; }
  get pesoCurrent() { return this._pesoCurrent; }
  get erro() { return this._erro; }

  async conectar(config: BalancaCompleta): Promise<void> {
    this._config = config;
    if (!config.portaCom) throw new Error('Porta COM não configurada para esta balança.');

    const { SerialPort } = await import('serialport');

    return new Promise((resolve, reject) => {
      this._port = new (SerialPort as any)({
        path:     config.portaCom,
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        parity:   config.paridade.toLowerCase(),
        stopBits: config.stopBits,
        autoOpen: true,
      });

      this._port.on('open', () => {
        this._conectado = true;
        this._erro      = undefined;
        if (config.protocoloSerial === 'SOB_REQUISICAO') {
          this._port.write('SI\r\n');
        }
        resolve();
      });

      this._port.on('data', (data: Buffer) => {
        this._buffer += data.toString();
        const linhas = this._buffer.split(/\r?\n/);
        this._buffer = linhas.pop() ?? '';
        for (const linha of linhas) {
          const peso = this.parse(linha);
          if (peso !== null && peso >= 0) {
            this._pesoCurrent = peso;
            this._erro        = undefined;
          }
        }
        if (config.protocoloSerial === 'SOB_REQUISICAO') {
          setTimeout(() => { if (this._conectado) this._port?.write('SI\r\n'); }, 300);
        }
      });

      this._port.on('error', (err: any) => {
        this._erro      = err.message;
        this._conectado = false;
        reject(err);
      });

      this._port.on('close', () => { this._conectado = false; });
    });
  }

  async desconectar(): Promise<void> {
    return new Promise((resolve) => {
      this._conectado = false;
      if (!this._port) return resolve();
      try {
        this._port.close(() => { this._port = null; resolve(); });
      } catch {
        this._port = null;
        resolve();
      }
    });
  }

  async lerPeso(): Promise<number | null> {
    return this._pesoCurrent > 0 ? this._pesoCurrent : null;
  }

  // ─── Parser Toledo serial ──────────────────────────────────────────────────

  private parse(raw: string): number | null {
    if (!raw?.trim()) return null;
    const s = raw.replace(/[\x00-\x1F\x7F]/g, ' ').trim();
    if (!s) return null;

    // Formato CSV contínuo: "0,015.080,000.000,015.080" (status,bruto,tara,líquido —
    // vírgula separa campos, ponto é decimal). Usa o último campo (peso líquido).
    if (s.includes(',')) {
      const campos = s.split(',').map((c) => c.trim());
      const pesos = campos.filter((c) => /^\d+\.\d+$/.test(c)).map(Number);
      if (pesos.length > 0) return Math.abs(pesos[pesos.length - 1]);
    }

    // Formato decimal:  +1.234 kg  /  +001,234
    const dec = s.match(/([+-]?\s*\d+[.,]\d+)\s*(kg|g|t)?\s*$/i);
    if (dec) {
      const n = parseFloat(dec[1].replace(',', '.').replace(/\s/g, ''));
      if (!isNaN(n)) return Math.abs(n);
    }

    // Formato inteiro P05:  +00350  (valor em gramas × 10)
    const int = s.match(/^[+-]?\s*(\d{5,6})\s*(ST)?$/i);
    if (int) {
      const n = parseInt(int[1].replace(/\s/g, ''));
      if (!isNaN(n)) return Math.abs(n) / 1000;
    }

    return null;
  }
}
