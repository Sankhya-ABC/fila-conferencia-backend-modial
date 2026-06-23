import { BalancaCompleta } from '../balanca.types';
import { BalancaDriver } from './balanca-driver.interface';

const PESOS_DEMO = [0.150, 0.320, 0.850, 1.250, 0.480, 2.130, 0.075, 0.960];

/**
 * Driver de simulação — não requer hardware.
 * Usado por simularPeso() e pelo toledo-mock.js de desenvolvimento.
 */
export class MockDriver implements BalancaDriver {
  private _pesoCurrent: number;
  private _conectado = true;

  get conectado() { return this._conectado; }
  get pesoCurrent() { return this._pesoCurrent; }
  get erro() { return undefined; }

  constructor(peso?: number) {
    this._pesoCurrent = peso ?? PESOS_DEMO[Math.floor(Math.random() * PESOS_DEMO.length)];
  }

  async conectar(_config: BalancaCompleta): Promise<void> {
    this._conectado = true;
  }

  async desconectar(): Promise<void> {
    this._conectado = false;
  }

  async lerPeso(): Promise<number | null> {
    return this._pesoCurrent;
  }

  /** Injeta peso diretamente (chamado por BalancaService.simularPeso). */
  simular(peso: number) {
    this._pesoCurrent = peso;
    this._conectado   = true;
  }
}
