import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Game } from './types';
import { CatalogSchemaError, hasNoCatalogId, type CatalogGame, type CatalogKey } from './game-catalog';

function payloadFor(game: CatalogGame, key: CatalogKey) {
  return {
    [key]: game.id,
    title: game.title,
    duration_hours: game.duration_hours,
    average_rating: game.average_rating,
    release_year: game.release_year,
    // O PostgREST monta o ON CONFLICT DO UPDATE SET a partir das chaves do payload,
    // então omitir image_url preserva a capa já salva em vez de sobrescrevê-la.
    ...(game.image_url ? { image_url: game.image_url } : {}),
    description: game.description,
    screenshot_urls: game.screenshot_urls,
    trailer_url: game.trailer_url,
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

// A linha de mesmo título só recebe o id deste catálogo quando nenhum catálogo é dono
// dela e o ano não desmente que seja o mesmo jogo. Linha de outro catálogo nunca muda
// de dono: os upserts seguintes do catálogo ativo sobrescreveriam os dados dela.
function canClaim(existing: Game, game: CatalogGame) {
  const sameYear = existing.release_year == null || game.release_year == null || existing.release_year === game.release_year;
  return hasNoCatalogId(existing) && sameYear;
}

// Cada jogo de entrada junto da linha que o representa no banco. A linha pode ter
// outra chave (título repetido no fallback 23505), então ninguém casa pelo id dela.
type CachedGame = [CatalogGame, Game];

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
      if (!canClaim(existing, game)) {
        saved.push([game, existing as Game]);
        continue;
      }
      const metadata = {
        [key]: game.id,
        average_rating: existing.average_rating ?? game.average_rating,
        release_year: existing.release_year ?? game.release_year,
        screenshot_urls: existing.screenshot_urls?.length ? existing.screenshot_urls : game.screenshot_urls,
        trailer_url: existing.trailer_url ?? game.trailer_url,
        genres: existing.genres?.length ? existing.genres : game.genres,
        platforms: existing.platforms?.length ? existing.platforms : game.platforms,
        platform_ids: existing.platform_ids?.length ? existing.platform_ids : game.platform_ids,
      };
      const { data: updated } = await supabase.from('games').update(metadata).eq('id', existing.id).select().single();
      saved.push([game, (updated || { ...existing, ...metadata }) as Game]);
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
  // Um lote é tudo ou nada, e as recuperações por linha (schema antigo, título
  // duplicado) só existem uma linha por vez, então a falha cai no caminho lento.
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
 * `key` é a coluna do catálogo de onde os jogos vieram, não a do catálogo ativo: a
 * busca GOTY lê sempre a IGDB, mesmo quando o app explora pela RAWG.
 */
export async function cacheCatalogGames(supabase: SupabaseClient, games: CatalogGame[], key: CatalogKey): Promise<Game[]> {
  if (!games.length) return [];
  // Um lote só para quem tem capa e outro para quem não tem: o postgrest-js manda
  // `columns` com a união das chaves do lote, então misturar os dois faria a capa
  // ausente de um apagar a capa gravada do outro.
  const [withCover, withoutCover] = await Promise.all([
    cacheBatch(supabase, games.filter(game => game.image_url), key),
    cacheBatch(supabase, games.filter(game => !game.image_url), key),
  ]);
  const saved = new Map([...withCover, ...withoutCover]);
  return games.flatMap(game => saved.get(game) ?? []);
}
