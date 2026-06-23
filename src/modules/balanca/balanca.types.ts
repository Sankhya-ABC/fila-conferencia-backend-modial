export interface BalancaCompleta {
  id: string;
  nome: string;
  fabricante: string;
  modelo: string | null;
  tipoComunicacao: string;
  portaCom: string | null;
  baudRate: number;
  dataBits: number;
  paridade: string;
  stopBits: number;
  protocoloSerial: string;
  protocolo: string;
  ip: string | null;
  porta: number | null;
  rota: string;
  ativo: boolean;
}

/** Mapa campo DTO → coluna SQL (com aspas para camelCase) */
export const COL: Record<string, string> = {
  nome:            'nome',
  fabricante:      'fabricante',
  modelo:          'modelo',
  tipoComunicacao: '"tipoComunicacao"',
  portaCom:        '"portaCom"',
  baudRate:        '"baudRate"',
  dataBits:        '"dataBits"',
  paridade:        'paridade',
  stopBits:        '"stopBits"',
  protocoloSerial: '"protocoloSerial"',
  protocolo:       'protocolo',
  ip:              'ip',
  porta:           'porta',
  rota:            'rota',
  ativo:           'ativo',
};
