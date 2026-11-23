import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type GamesRow = Record<string, unknown> & { id: string; title: string };
export type GamesPatch = { id: string; patch: Record<string, unknown> };

/**
 * Lê a lista de um filtro `in.(…)` como o PostgREST v12 lê. Espaços e tabs logo depois
 * do `(` não contam. Um valor entre aspas, em que `\` escapa o caractere seguinte, só
 * vale se vier seguido de `,` ou `)`; senão o valor é lido sem aspas até a próxima `,`
 * ou `)`. O primeiro `)` fora de aspas fecha a lista, e o PostgREST ignora o que vem
 * depois. Uma lista que é só um valor vazio, `()` ou `("")`, é a lista vazia. Só a lista
 * que nunca fecha é erro de sintaxe (PGRST100), e aí a função devolve null.
 */
export function parseInList(text: string): string[] | null {
  if (!text.startsWith('(')) return null;
  const values: string[] = [];
  let at = 1;
  while (text[at] === ' ' || text[at] === '\t') at += 1;
  for (;;) {
    let value: string | null = null;
    if (text[at] === '"') {
      let end = at + 1;
      let quoted = '';
      while (end < text.length && text[end] !== '"') {
        if (text[end] === '\\') end += 1;
        quoted += text[end] ?? '';
        end += 1;
      }
      if (text[end + 1] === ',' || text[end + 1] === ')') {
        value = quoted;
        at = end + 1;
      }
    }
    if (value === null) {
      let end = at;
      while (end < text.length && text[end] !== ',' && text[end] !== ')') end += 1;
      value = text.slice(at, end);
      at = end;
    }
    values.push(value);
    if (text[at] === ',') {
      at += 1;
      continue;
    }
    if (text[at] !== ')') return null;
    return values.length === 1 && values[0] === '' ? [] : values;
  }
}

type RestOptions = {
  /** A tabela games, por título. O fake lê e grava nos próprios objetos. */
  rows: Map<string, GamesRow>;
  /** Colunas que o banco ainda não tem, como rawg_id antes da migration. */
  missingColumns?: string[];
  /** Cada PATCH que chega, com o id do filtro e o corpo, tenha ele mudado uma linha ou não. */
  patches?: GamesPatch[];
  /** Erro que o banco devolve a todo PATCH. */
  patchError?: { code: string; message: string };
  /** Roda antes de cada pedido; pode esperar, como um banco ocupado. */
  onRequest?: (method: string) => void | Promise<void>;
};

const UNIQUE_COLUMNS = ['title', 'igdb_id', 'rawg_id'];

function fail(status: number, code: string, message: string) {
  return Response.json({ code, message, details: null, hint: null }, { status });
}

/**
 * Um supabase-js de verdade, com o fetch respondendo como o PostgREST v12 sobre a tabela
 * games em memória. Serve os GET e os PATCH com filtros eq, is e in; o código sob teste
 * monta a URL com o postgrest-js real, e o filtro in passa pela leitura de parseInList.
 */
export function gamesRest(options: RestOptions): SupabaseClient {
  const { rows, missingColumns = [], patches, patchError, onRequest } = options;
  const respond = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    await onRequest?.(method);
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const filters: Array<(row: GamesRow) => boolean> = [];
    let id = '';
    for (const [column, expression] of url.searchParams) {
      if (column === 'select' || column === 'columns') continue;
      if (missingColumns.includes(column)) return fail(400, '42703', `column games.${column} does not exist`);
      const dot = expression.indexOf('.');
      const [operator, operand] = [expression.slice(0, dot), expression.slice(dot + 1)];
      if (column === 'id' && operator === 'eq') id = operand;
      if (operator === 'eq') filters.push(row => row[column] != null && String(row[column]) === operand);
      else if (operator === 'is' && operand === 'null') filters.push(row => row[column] == null);
      else if (operator === 'in') {
        const values = parseInList(operand);
        if (!values) return fail(400, 'PGRST100', `"failed to parse filter (${expression})" (line 1, column 4)`);
        filters.push(row => row[column] != null && values.includes(String(row[column])));
      } else throw new Error(`filtro que o fake não conhece: ${column}=${expression}`);
    }
    let matched = [...rows.values()].filter(row => filters.every(filter => filter(row)));
    if (method === 'PATCH') {
      const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches?.push({ id, patch });
      const missing = Object.keys(patch).find(column => missingColumns.includes(column));
      if (missing) return fail(400, 'PGRST204', `Could not find the '${missing}' column of 'games' in the schema cache`);
      if (patchError) return fail(400, patchError.code, patchError.message);
      // Como no Postgres, só a linha que o UPDATE acha passa pelas uniques: um PATCH que
      // não acha nada volta [] mesmo com um valor que outra linha já tem.
      const taken = matched.length > 0 && UNIQUE_COLUMNS.find(column => patch[column] != null
        && [...rows.values()].some(row => !matched.includes(row) && row[column] === patch[column]));
      if (taken) return fail(409, '23505', `duplicate key value violates unique constraint "games_${taken}_key"`);
      matched.forEach(row => Object.assign(row, patch));
      matched = matched.map(row => ({ ...row }));
    } else if (method !== 'GET') {
      throw new Error(`método que o fake não conhece: ${method}`);
    }
    const body = matched.map(row => ({ ...row }));
    if (headers.get('Accept')?.includes('application/vnd.pgrst.object+json')) {
      if (body.length !== 1) return fail(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
      return Response.json(body[0]);
    }
    return Response.json(body);
  };
  return createClient('http://banco.falso', 'chave-anon', {
    global: { fetch: respond as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
