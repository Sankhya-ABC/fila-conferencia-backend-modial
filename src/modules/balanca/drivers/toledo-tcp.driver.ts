import * as net from 'net';
import { BalancaCompleta } from '../balanca.types';
import { BalancaDriver } from './balanca-driver.interface';

/**
 * Driver Toledo TCP — protocolo SICS via rede (porta padrão 8008).
 * Mantém um ciclo de polling interno (1 s) para não criar uma conexão TCP
 * por requisição do frontend. O backend armazena este driver em driversAtivos
 * e retorna o peso cacheado em cada chamada a statusBalanca().
 */
export class ToledoTcpDriver implements BalancaDriver {
  private _config?: BalancaCompleta;
  private _pesoCurrent = 0;
  private _conectado = false;
  private _erro?: string;
  private _pollingTimer?: ReturnType<typeof setTimeout>;
  private _parado = false;

  get conectado() { return this._conectado; }
  get pesoCurrent() { return this._pesoCurrent; }
  get erro() { return this._erro; }

  async conectar(config: BalancaCompleta): Promise<void> {
    this._config = config;
    this._erro   = undefined;
    this._parado = false;

    // Leitura inicial para confirmar que a balança responde
    try {
      const peso = await this.requestSICS(config.ip!, config.porta!);
      this._conectado   = peso !== null;
      this._pesoCurrent = peso ?? 0;
    } catch (err: any) {
      this._conectado = false;
      this._erro      = err?.message;
    }

    this.agendarProximaLeitura();
  }

  async desconectar(): Promise<void> {
    this._parado = true;
    if (this._pollingTimer) {
      clearTimeout(this._pollingTimer);
      this._pollingTimer = undefined;
    }
    this._conectado = false;
  }

  async lerPeso(): Promise<number | null> {
    if (!this._config?.ip || this._config?.porta == null) return null;
    return this.requestSICS(this._config.ip, this._config.porta);
  }

  // ─── Ciclo interno de polling (1 s) ─────────────────────────────────────────

  private agendarProximaLeitura() {
    if (this._parado) return;
    this._pollingTimer = setTimeout(async () => {
      if (this._parado || !this._config?.ip) return;
      try {
        const peso = await this.requestSICS(this._config.ip!, this._config.porta!);
        this._conectado   = peso !== null;
        this._pesoCurrent = peso ?? this._pesoCurrent;
        this._erro        = undefined;
      } catch (err: any) {
        this._conectado = false;
        this._erro      = err?.message;
      }
      this.agendarProximaLeitura();
    }, 1000);
  }

  // ─── SICS over TCP (one-shot) ────────────────────────────────────────────────

  private requestSICS(ip: string, porta: number): Promise<number | null> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let buffer = '';

      socket.setTimeout(5000);
      socket.on('connect', () => socket.write('SI\r\n'));

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        if (buffer.includes('\r\n') || buffer.length > 64) {
          socket.destroy();
          resolve(this.parseSICS(buffer));
        }
      });

      socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout Toledo TCP')); });
      socket.on('error',   (err) => { socket.destroy(); reject(err); });
      socket.connect(porta, ip);
    });
  }

  private parseSICS(raw: string): number | null {
    const line = raw.trim();

    // Resposta padrão SICS: "S S   1.234 kg"
    const sics = line.match(/^S\s+([SDI+\-E])\s*([\d.]+)?\s*(kg|g|lb|t)?/i);
    if (sics) {
      const status = sics[1].toUpperCase();
      if (status !== 'S' && status !== 'D') return null;
      const val = parseFloat(sics[2] ?? '');
      return isNaN(val) ? null : val;
    }

    // Fallback compacto: qualquer número com unidade
    const compact = line.match(/([+-]?)\s*([\d.]+)\s*(kg|g|lb|t)?/i);
    if (compact) {
      const val = parseFloat(compact[2]);
      return isNaN(val) ? null : val;
    }

    return null;
  }
}
