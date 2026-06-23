import { BalancaCompleta } from '../balanca.types';
import { BalancaDriver } from './balanca-driver.interface';
import { HttpDriver } from './http.driver';
import { MockDriver } from './mock.driver';
import { ToledoSerialDriver } from './toledo-serial.driver';
import { ToledoTcpDriver } from './toledo-tcp.driver';

/**
 * Seleciona e instancia o driver correto com base na configuração da balança.
 *
 * Adicionar nova marca serial:
 *   1. Crie FilizolaSerialDriver implements BalancaDriver em ./filizola-serial.driver.ts
 *   2. Adicione o case 'FILIZOLA' abaixo — zero mudança no service.
 *
 * Adicionar novo protocolo de rede:
 *   1. Crie o driver.
 *   2. Adicione um novo tipoComunicacao (ex: 'METTLER_TCP') ou detecte por fabricante.
 */
export function criarDriver(config: BalancaCompleta): BalancaDriver {
  const tipo = config.tipoComunicacao;

  // ─── Serial (RS-232 ou USB virtual COM) ─────────────────────────────────────
  if (tipo === 'SERIAL_RS232' || tipo === 'SERIAL_USB') {
    const marca = config.fabricante.toUpperCase().trim();
    switch (marca) {
      case 'TOLEDO':
      default:
        return new ToledoSerialDriver();
      // ↓ Adicione novas marcas aqui:
      // case 'FILIZOLA': return new FilizolaSerialDriver();
      // case 'URANO':    return new UranoSerialDriver();
      // case 'METTLER':  return new MettlerSerialDriver();
    }
  }

  // ─── TCP dedicado ────────────────────────────────────────────────────────────
  if (tipo === 'TOLEDO_TCP') {
    return new ToledoTcpDriver();
    // Futuramente: detectar por fabricante se houver outros TCP
  }

  // ─── HTTP genérico (padrão) ──────────────────────────────────────────────────
  return new HttpDriver();
}

export function criarMock(peso?: number): MockDriver {
  return new MockDriver(peso);
}
