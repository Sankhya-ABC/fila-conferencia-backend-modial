const formatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// Independe do fuso horário configurado no SO do servidor (containers geralmente rodam em UTC).
export function formatarDataHoraBR(date: Date = new Date()): string {
  const partes = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}
