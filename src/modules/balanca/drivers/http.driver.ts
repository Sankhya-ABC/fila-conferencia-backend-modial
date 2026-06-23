import axios from 'axios';
import { BalancaCompleta } from '../balanca.types';
import { BalancaDriver } from './balanca-driver.interface';

/**
 * Driver HTTP genérico.
 * Faz GET na rota configurada e extrai o peso do JSON ou texto de resposta.
 * Stateless — cada lerPeso() é uma requisição independente.
 */
export class HttpDriver implements BalancaDriver {
  private _config?: BalancaCompleta;
  private _pesoCurrent = 0;
  private _conectado = false;
  private _erro?: string;

  get conectado() { return this._conectado; }
  get pesoCurrent() { return this._pesoCurrent; }
  get erro() { return this._erro; }

  async conectar(config: BalancaCompleta): Promise<void> {
    this._config = config;
    this._erro   = undefined;
    try {
      const peso = await this.lerPeso();
      this._conectado   = peso !== null;
      this._pesoCurrent = peso ?? 0;
    } catch (err: any) {
      this._conectado = false;
      this._erro      = err?.message;
    }
  }

  async desconectar(): Promise<void> {
    this._conectado = false;
  }

  async lerPeso(): Promise<number | null> {
    if (!this._config?.ip || this._config?.porta == null) return null;
    const url = `http://${this._config.ip}:${this._config.porta}${this._config.rota}`;
    const res = await axios.get<unknown>(url, { timeout: 5000 });
    const peso = this.extrair(res.data);
    if (peso !== null) {
      this._pesoCurrent = peso;
      this._conectado   = true;
    }
    return peso;
  }

  // ─── Extração de peso da resposta ─────────────────────────────────────────

  private extrair(data: unknown): number | null {
    if (typeof data === 'number') return data;
    if (typeof data === 'string') {
      const n = parseFloat(data.replace(',', '.'));
      return isNaN(n) ? null : n;
    }
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      // Tenta campos comuns: peso / value / weight / data
      const val = obj['peso'] ?? obj['value'] ?? obj['weight'] ?? obj['data'];
      return this.extrair(val);
    }
    return null;
  }
}
