#!/usr/bin/env node
/**
 * Simulador de Balança Toledo — para testes sem hardware físico
 *
 * Sobe três servidores:
 *   HTTP        → http://localhost:8765/peso   (fila-de-conferencia Tipo=HTTP)
 *   TCP SICS    → localhost:8766               (fila-de-conferencia Tipo=TOLEDO_TCP)
 *   TCP Sankhya → localhost:9090               (Sankhya WebConnection TCP/IP)
 *
 * Sankhya WebConnection — configurar assim:
 *   IP da Balança        : localhost
 *   Porta de comunicação : 9090
 *   Início da string     : 0
 *   Fim da string        : 6
 *   Casa decimal         : 3
 *   Utiliza expressão    : NÃO
 */

const http = require('http');
const net  = require('net');

// ─── Estado compartilhado ─────────────────────────────────────────────────────

let pesoAtual = 1.250;
let estavel   = true;
let modoFixo  = false;

// Oscilação automática (desativada quando modoFixo=true)
setInterval(() => {
  if (modoFixo) return;
  const variacao = (Math.random() - 0.5) * 0.012;
  pesoAtual = Math.max(0.001, pesoAtual + variacao);
  pesoAtual = Math.round(pesoAtual * 1000) / 1000;
  estavel   = Math.random() > 0.25; // 75% do tempo estável
}, 700);

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const HTTP_PORT = 8765;

http.createServer((req, res) => {
  const origin = req.headers['origin'] || '(sem origin)';
  console.log(`[HTTP]  ${req.method} ${req.url} — origin: ${origin}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && (req.url === '/peso' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ peso: pesoAtual, estavel, unidade: 'kg' }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(HTTP_PORT, () => {
  console.log(`[HTTP]  http://localhost:${HTTP_PORT}/peso`);
  console.log(`        → Cadastro: Tipo=HTTP, IP=localhost, Porta=${HTTP_PORT}, Rota=/peso\n`);
});

// ─── TCP Server — Toledo SICS ─────────────────────────────────────────────────

const TCP_PORT = 8766;

net.createServer((socket) => {
  const addr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[TCP ]  Conexão: ${addr}`);

  // Broadcast contínuo (protocolo P05 / PRT1)
  const loop = setInterval(() => {
    if (!socket.writable) return clearInterval(loop);
    socket.write(formatSICS(pesoAtual, estavel));
  }, 250);

  let buf = '';
  socket.on('data', (d) => {
    buf += d.toString();
    const linhas = buf.split(/\r?\n/);
    buf = linhas.pop() ?? '';
    for (const linha of linhas) {
      const cmd = linha.trim().toUpperCase();
      if (cmd === 'SI' || cmd === 'SI\r') {
        // Resposta Sob Requisição
        socket.write(formatSICS(pesoAtual, estavel));
      }
    }
  });

  socket.on('close', () => { clearInterval(loop); console.log(`[TCP ]  Desconectado: ${addr}`); });
  socket.on('error', () => clearInterval(loop));

}).listen(TCP_PORT, () => {
  console.log(`[TCP ]  localhost:${TCP_PORT}  (Toledo SICS)`);
  console.log(`        → Cadastro: Tipo=TOLEDO_TCP, IP=localhost, Porta=${TCP_PORT}\n`);
});

/** Formata resposta SICS: S S   1.234 kg\r\n */
function formatSICS(peso, estavel) {
  const s = estavel ? 'S' : 'D';
  return `S ${s} ${peso.toFixed(3).padStart(9)} kg\r\n`;
}

// ─── TCP Server — Formato Sankhya (NNNNNN\r\n) ───────────────────────────────
// Sankhya lê caracteres INICIO..FIM e divide por 10^DECIMAL.
// Com INICIO=0, FIM=6, DECIMAL=3: "001234\r\n" → 1.234 kg

const SANKHYA_PORT = 9090;

net.createServer((socket) => {
  const addr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`\n[SNK ]  Sankhya conectou: ${addr}`);

  // Envia continuamente (Sankhya faz polling ao clicar "Testar")
  const loop = setInterval(() => {
    if (!socket.writable) return clearInterval(loop);
    socket.write(formatSankhya(pesoAtual));
  }, 200);

  socket.on('close', () => { clearInterval(loop); console.log(`[SNK ]  Sankhya desconectou: ${addr}`); });
  socket.on('error', () => clearInterval(loop));

}).listen(SANKHYA_PORT, () => {
  console.log(`[SNK ]  localhost:${SANKHYA_PORT}  (Sankhya WebConnection)`);
  console.log(`        → IP: localhost | Porta: ${SANKHYA_PORT} | Início: 0 | Fim: 6 | Casa decimal: 3\n`);
});

/**
 * Formato Sankhya: 6 dígitos sem ponto, com DECIMAL=3 o sistema divide por 1000.
 * Ex: 1.234 kg → "001234\r\n"
 */
function formatSankhya(peso) {
  const gramas = Math.round(peso * 1000);
  return String(gramas).padStart(6, '0').slice(-6) + '\r\n';
}

// ─── Interface de controle ────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════════════');
console.log('    Simulador de Balança Toledo — Fila de Conferência  ');
console.log('══════════════════════════════════════════════════════');
console.log('  Comandos (Enter para confirmar):');
console.log('    p <valor>   Fixar peso        ex: p 2.500');
console.log('    r           Retomar oscilação aleatória');
console.log('    s           Forçar ESTÁVEL');
console.log('    i           Forçar INSTÁVEL (oscilando)');
console.log('    q           Sair');
console.log('══════════════════════════════════════════════════════\n');

process.stdin.setEncoding('utf8');
try { process.stdin.setRawMode && process.stdin.setRawMode(false); } catch { /* ignore */ }
process.stdin.resume();

process.stdin.on('data', (chunk) => {
  const cmd = chunk.toString().trim();
  if (!cmd) return;

  if (cmd.startsWith('p ')) {
    const val = parseFloat(cmd.slice(2).replace(',', '.'));
    if (!isNaN(val) && val >= 0) {
      pesoAtual = Math.round(val * 1000) / 1000;
      modoFixo  = true;
      estavel   = true;
      console.log(`\n[CTRL] Peso fixado: ${pesoAtual.toFixed(3)} kg (estável)\n`);
    } else {
      console.log('\n[CTRL] Valor inválido. Use: p 1.500\n');
    }
  } else if (cmd === 'r') {
    modoFixo = false;
    console.log('\n[CTRL] Oscilação aleatória ativada\n');
  } else if (cmd === 's') {
    estavel = true;
    console.log('\n[CTRL] Leitura: ESTÁVEL\n');
  } else if (cmd === 'i') {
    estavel = false;
    console.log('\n[CTRL] Leitura: INSTÁVEL\n');
  } else if (cmd === 'q') {
    console.log('\nSaindo...\n');
    process.exit(0);
  } else {
    console.log(`\n[CTRL] Comando desconhecido: "${cmd}"\n`);
  }
});

// Linha de status no terminal
setInterval(() => {
  const modo  = modoFixo ? 'fixo    ' : 'aleatório';
  const stat  = estavel  ? '✓ estável ' : '~ oscilando';
  process.stdout.write(`\r  peso: ${pesoAtual.toFixed(3)} kg   ${stat}   modo: ${modo}   `);
}, 500);
