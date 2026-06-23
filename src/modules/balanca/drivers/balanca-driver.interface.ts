import { BalancaCompleta } from '../balanca.types';

/**
 * Contrato que todo driver de balança deve implementar.
 *
 * Drivers contínuos (serial) acumulam peso no cache durante a sessão.
 * Drivers stateless (HTTP, TCP) fazem requisição síncrona em lerPeso().
 */
export interface BalancaDriver {
  /** Abre conexão / inicia streaming. Stores config internally. */
  conectar(config: BalancaCompleta): Promise<void>;

  /** Encerra conexão. */
  desconectar(): Promise<void>;

  /**
   * Lê o peso atual.
   * - Serial/contínuo: retorna cache (populado pelo stream).
   * - HTTP/TCP: faz requisição síncrona.
   */
  lerPeso(): Promise<number | null>;

  readonly conectado: boolean;
  readonly pesoCurrent: number;
  readonly erro?: string;
}
