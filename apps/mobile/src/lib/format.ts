// Formatação de datas em pt-BR reimplementada para a UI mobile. Espelha src/lib/utils.ts
// (app web). Idealmente estas funções puras migram para o pacote @clube-do-jogo/domain
// numa próxima fatia, evitando esta duplicação (ver lacunas no resumo da entrega).

export function formatMonth(month: string, options: { includeYear?: boolean } = {}): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    ...(options.includeYear === false ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Fortaleza',
});

export function formatShortDate(value?: string | null): string {
  if (!value) return '-';
  return shortDateFormatter.format(new Date(value));
}

export function initials(name?: string | null): string {
  return (name || 'Membro')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

export function formatFinishedCount(count: number): string {
  return `${count} ${count === 1 ? 'finalizou' : 'finalizaram'}`;
}
