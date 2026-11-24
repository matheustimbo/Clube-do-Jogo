import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Game } from './types';
import { CATALOG_KEYS, CatalogSchemaError, hasNoCatalogId, isSameRelease, normalizedTitle, type CatalogGame, type CatalogKey } from './game-catalog';

function payloadFor(game: CatalogGame, key: CatalogKey) {
  return {
    [key]: game.id,
    title: game.title,
    duration_hours: game.duration_hours,
    average_rating: game.average_rating,
    release_year: game.release_year,
    // O PostgREST monta o ON CONFLICT DO UPDATE SET a partir das chaves do payload,
    // então o campo que o catálogo não trouxe fica de fora e o valor salvo (a capa, a
    // descrição e o trailer que a rota de mídia gravou) sobrevive à listagem.
    ...(game.image_url ? { image_url: game.image_url } : {}),
    ...(game.description ? { description: game.description } : {}),
    screenshot_urls: game.screenshot_urls,
    ...(game.trailer_url ? { trailer_url: game.trailer_url } : {}),
    genres: game.genres,
    platforms: game.platforms,
    platform_ids: game.platform_ids,
  };
}

// Sem a coluna do catálogo (migration não aplicada) o PostgREST recusa o payload, e
// sem a unique dela o Postgres recusa o ON CONFLICT. Nos dois casos o certo é parar:
// tentar de novo com outra chave gravaria o id na coluna de outro catálogo.
function throwIfKeyMissing(error: Pick<PostgrestError, 'code' | 'message'> | null, key: CatalogKey) {
  if (!error) return;
  const namesKey = error.message?.includes(key);
  if (((error.code === 'PGRST204' || error.code === '42703') && namesKey) || error.code === '42P10') throw new CatalogSchemaError(key);
}

// Cada jogo de entrada junto da linha que o representa no banco. A linha pode ter
// outra chave (título repetido), então ninguém casa pelo id dela.
type CachedGame = [CatalogGame, Game];

/** O que um jogo faz com a linha que já tem o título dele. */
type TitleClash =
  | { kind: 'own' }
  | { kind: 'other-release' }
  | { kind: 'stand-in'; row: Game }
  | { kind: 'claim'; row: Game };

function clashWith(row: Game, game: CatalogGame, key: CatalogKey): TitleClash {
  if (row[key] === game.id) return { kind: 'own' };
  // A linha de outro ano é outro jogo, e devolvê-la poria o jogo errado na página.
  if (!isSameRelease(row, game)) return { kind: 'other-release' };
  // Linha de outro catálogo (ou de outro jogo deste) nunca muda de dono: os upserts
  // seguintes do catálogo ativo sobrescreveriam os dados dela.
  return hasNoCatalogId(row) ? { kind: 'claim', row } : { kind: 'stand-in', row };
}

function warnOtherRelease(game: CatalogGame, row: Game, key: CatalogKey) {
  console.warn('Jogo do catálogo fora do resultado: o título já é de um jogo de outro ano.', {
    [key]: game.id, title: game.title, release_year: game.release_year, row: row.id, row_release_year: row.release_year,
  });
}

/**
 * Grava `patch` na linha só enquanto nenhum catálogo é dono dela, então dois pedidos, de
 * um catálogo ou de dois, nunca dão dono à mesma linha. Quem chega depois não acha a
 * linha e recebe [], ou 23505 quando o id do jogo já está noutra linha.
 */
export function updateUnownedRow(supabase: SupabaseClient, row: Game, patch: Record<string, unknown>) {
  let update = supabase.from('games').update(patch).eq('id', row.id);
  // Só as colunas que o banco tem: antes da migration não existe rawg_id.
  for (const catalogKey of CATALOG_KEYS) if (catalogKey in row) update = update.is(catalogKey, null);
  return update.select();
}

/**
 * 23505 no claim: o id do jogo já está noutra linha, gravada com outra grafia do título.
 * Ela é o jogo quando o título normalizado e o ano batem (Okami HD e Ōkami HD); senão
 * mostrá-la poria outro título na página, e o jogo sai do resultado. Título sem letra
 * nem número não casa com nada, como em findGameByTitle.
 */
async function rowHoldingId(supabase: SupabaseClient, game: CatalogGame, key: CatalogKey): Promise<Game | null> {
  const { data: holder } = await supabase.from('games').select('*').eq(key, game.id).maybeSingle();
  const title = normalizedTitle(game.title);
  if (holder && title && normalizedTitle(holder.title) === title && isSameRelease(holder, game)) return holder as Game;
  console.warn('Jogo do catálogo fora do resultado: o id dele já está numa linha de outro título.', { [key]: game.id, title: game.title, row: holder?.id });
  return null;
}

/**
 * Dá à linha sem dono o id do jogo. Quem chega depois relê a linha e fica com o que o
 * banco tem; null tira o jogo do resultado.
 */
async function claim(supabase: SupabaseClient, row: Game, game: CatalogGame, key: CatalogKey): Promise<Game | null> {
  const metadata = {
    [key]: game.id,
    average_rating: row.average_rating ?? game.average_rating,
    release_year: row.release_year ?? game.release_year,
    screenshot_urls: row.screenshot_urls?.length ? row.screenshot_urls : game.screenshot_urls,
    trailer_url: row.trailer_url ?? game.trailer_url,
    genres: row.genres?.length ? row.genres : game.genres,
    platforms: row.platforms?.length ? row.platforms : game.platforms,
    platform_ids: row.platform_ids?.length ? row.platform_ids : game.platform_ids,
  };
  // A coluna do catálogo existe: a consulta por título ou o upsert do lote já pararam
  // com CatalogSchemaError antes de qualquer claim num banco sem ela.
  const { data, error } = await updateUnownedRow(supabase, row, metadata);
  const [claimed] = (data ?? []) as Game[];
  if (claimed) return claimed;
  if (error?.code === '23505') return rowHoldingId(supabase, game, key);
  if (error) {
    console.error('Erro ao reivindicar linha para o catálogo:', error);
    return null;
  }
  // Sem erro e sem linha: outro pedido chegou antes, ou a linha sumiu.
  const { data: current } = await supabase.from('games').select('*').eq('id', row.id).maybeSingle();
  if (!current) return null;
  const clash = clashWith(current as Game, game, key);
  if (clash.kind === 'own' || clash.kind === 'stand-in') return current as Game;
  if (clash.kind === 'other-release') warnOtherRelease(game, current as Game, key);
  else console.error('Linha sem dono que o banco não deixou reivindicar:', { [key]: game.id, row: row.id });
  return null;
}

// Rede de segurança para a corrida em que outro pedido grava um título entre a
// consulta e o upsert: uma linha por vez, cada 23505 resolvido como na classificação.
async function cacheOneByOne(supabase: SupabaseClient, games: CatalogGame[], key: CatalogKey): Promise<CachedGame[]> {
  const saved: CachedGame[] = [];
  for (const game of games) {
    const payload = payloadFor(game, key);
    let { data, error } = await supabase.from('games').upsert(payload, { onConflict: key }).select().single();
    throwIfKeyMissing(error, key);
    if (error?.code === 'PGRST204') {
      const { average_rating, release_year, screenshot_urls, trailer_url, genres, platforms, platform_ids, ...legacyPayload } = payload;
      const retry = await supabase.from('games').upsert(legacyPayload, { onConflict: key }).select().single();
      throwIfKeyMissing(retry.error, key);
      data = retry.data ? { ...retry.data, average_rating, release_year, screenshot_urls, trailer_url, genres, platforms, platform_ids } : retry.data;
      error = retry.error;
    }
    if (!error && data) {
      saved.push([game, data as Game]);
      continue;
    }
    if (error?.code === '23505') {
      const { data: existing } = await supabase.from('games').select('*').eq('title', game.title).maybeSingle();
      if (!existing) continue;
      const clash = clashWith(existing as Game, game, key);
      // A própria linha: outro pedido inseriu o mesmo jogo junto com este upsert, e o
      // Postgres conferiu a unique de título antes da chave do catálogo.
      if (clash.kind === 'own' || clash.kind === 'stand-in') saved.push([game, existing as Game]);
      if (clash.kind === 'other-release') warnOtherRelease(game, existing as Game, key);
      if (clash.kind === 'claim') {
        const claimed = await claim(supabase, clash.row, game, key);
        if (claimed) saved.push([game, claimed]);
      }
      continue;
    }
    if (error) console.error('Erro ao armazenar jogo do catálogo:', error);
  }
  return saved;
}

async function cacheBatch(supabase: SupabaseClient, games: CatalogGame[], key: CatalogKey): Promise<CachedGame[]> {
  if (!games.length) return [];
  const { data, error } = await supabase.from('games').upsert(games.map(game => payloadFor(game, key)), { onConflict: key }).select();
  throwIfKeyMissing(error, key);
  // Um lote é tudo ou nada, e as recuperações por linha (schema antigo, título gravado
  // por outro pedido depois da consulta) só existem uma linha por vez.
  if (error || !data) return cacheOneByOne(supabase, games, key);
  // O lote volta fora de ordem, mas o ON CONFLICT na chave do catálogo garante que
  // cada linha carrega o id do jogo que a gravou.
  const rows = new Map((data as Game[]).map(row => [row[key], row]));
  return games.flatMap(game => {
    const row = rows.get(game.id);
    return row ? [[game, row] satisfies CachedGame] : [];
  });
}

/**
 * A lista de um filtro `in` do PostgREST com cada valor entre aspas. O `.in()` do
 * postgrest-js só põe aspas no valor que tem `,()` e não escapa `"` nem `\`: entre aspas,
 * o PostgREST lê `\` como escape e fecha a lista no primeiro `)` que sobra, então
 * `Ōkami "HD" (2017)` sumia da consulta junto com todo título depois dele.
 */
function quotedList(values: string[]) {
  return `(${values.map(value => `"${value.replace(/[\\"]/g, '\\$&')}"`).join(',')})`;
}

// As linhas que já têm os títulos da página, numa consulta só. Sem elas (a consulta
// falhou), todo jogo vai para o lote e um título repetido cai no caminho lento.
async function rowsByTitle(supabase: SupabaseClient, games: CatalogGame[], key: CatalogKey): Promise<Map<string, Game>> {
  const { data, error } = await supabase.from('games').select('*').filter('title', 'in', quotedList([...new Set(games.map(game => game.title))]));
  if (error || !data) {
    if (error) console.error('Erro ao consultar os títulos do catálogo:', error);
    return new Map();
  }
  // select('*') só traz a chave quando a coluna existe. Sem ela, reivindicar uma linha
  // gravaria numa coluna que não existe, e o lote não chegaria a acusar o schema.
  if (data.some(row => !(key in row))) throw new CatalogSchemaError(key);
  return new Map((data as Game[]).map(row => [row.title, row]));
}

/** Cada jogo de entrada que ficou com uma linha no banco, junto dela. */
export async function cacheCatalogGameRows(supabase: SupabaseClient, games: CatalogGame[], key: CatalogKey): Promise<Map<CatalogGame, Game>> {
  if (!games.length) return new Map();
  // Toda listagem passa pelas linhas de mesmo título que outro catálogo tem, e elas
  // nunca mudam de dono. Classificar antes do upsert tira esses jogos do lote; senão
  // um 23505 derrubaria o lote inteiro para o caminho lento em toda página.
  const byTitle = await rowsByTitle(supabase, games, key);
  // Títulos que um jogo da página já vai gravar, num upsert ou num claim. O próximo jogo
  // com o mesmo título cairia na linha dele, que a página já mostra, ou seria de outro ano.
  const writing = new Set<string>();
  const toUpsert: CatalogGame[] = [];
  const standIns: CachedGame[] = [];
  const claims: Array<Promise<CachedGame | null>> = [];
  for (const game of games) {
    if (writing.has(game.title)) continue;
    const row = byTitle.get(game.title);
    if (!row) {
      writing.add(game.title);
      toUpsert.push(game);
      continue;
    }
    const clash = clashWith(row, game, key);
    if (clash.kind === 'own') toUpsert.push(game);
    else if (clash.kind === 'other-release') warnOtherRelease(game, row, key);
    else if (clash.kind === 'stand-in') standIns.push([game, row]);
    else {
      writing.add(game.title);
      claims.push(claim(supabase, row, game, key).then(claimed => (claimed ? [game, claimed] satisfies CachedGame : null)));
    }
  }
  // Um lote por conjunto de chaves: o postgrest-js manda `columns` com a união das
  // chaves do lote, e a chave que falta numa linha vira NULL. Misturar um jogo sem
  // descrição com um que tem apagaria a descrição gravada do primeiro.
  const batches = new Map<string, CatalogGame[]>();
  for (const game of toUpsert) {
    const keys = Object.keys(payloadFor(game, key)).join(',');
    batches.set(keys, [...(batches.get(keys) ?? []), game]);
  }
  const [cached, claimed] = await Promise.all([
    Promise.all([...batches.values()].map(batch => cacheBatch(supabase, batch, key))),
    Promise.all(claims),
  ]);
  return new Map([...standIns, ...cached.flat(), ...claimed.filter(entry => entry !== null)]);
}

/**
 * `key` é a coluna do catálogo de onde os jogos vieram, não a do catálogo ativo: a
 * busca GOTY lê sempre a IGDB, mesmo quando o app explora pela RAWG.
 */
export async function cacheCatalogGames(supabase: SupabaseClient, games: CatalogGame[], key: CatalogKey): Promise<Game[]> {
  const saved = await cacheCatalogGameRows(supabase, games, key);
  // Dois jogos da página podem cair na mesma linha de mesmo título; a lista usa o id
  // da linha como key, então ela aparece uma vez só.
  const rowIds = new Set<string>();
  return games.flatMap(game => {
    const row = saved.get(game);
    if (!row || rowIds.has(row.id)) return [];
    rowIds.add(row.id);
    return [row];
  });
}
