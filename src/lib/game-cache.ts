import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from './types';
import type { IGDBGameResult } from './igdb';

function payloadFor(game: IGDBGameResult) {
  return {
    igdb_id: game.id,
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

async function cacheOneByOne(supabase: SupabaseClient, games: IGDBGameResult[]): Promise<Game[]> {
  const saved: Game[] = [];
  for (const game of games) {
    const payload = payloadFor(game);
    let { data, error } = await supabase.from('games').upsert(payload, { onConflict: 'igdb_id' }).select().single();
    if (error?.code === 'PGRST204') {
      const { average_rating, release_year, screenshot_urls, trailer_url, genres, platforms, platform_ids, ...legacyPayload } = payload;
      const retry = await supabase.from('games').upsert(legacyPayload, { onConflict: 'igdb_id' }).select().single();
      data = retry.data ? { ...retry.data, average_rating, release_year, screenshot_urls, trailer_url, genres, platforms, platform_ids } : retry.data;
      error = retry.error;
    }
    if (!error && data) {
      saved.push(data as Game);
      continue;
    }
    if (error?.code === '23505') {
      const { data: existing } = await supabase.from('games').select('*').eq('title', game.title).maybeSingle();
      if (existing) {
        const metadata = {
          igdb_id: existing.igdb_id ?? game.id,
          average_rating: existing.average_rating ?? game.average_rating,
          release_year: existing.release_year ?? game.release_year,
          screenshot_urls: existing.screenshot_urls?.length ? existing.screenshot_urls : game.screenshot_urls,
          trailer_url: existing.trailer_url ?? game.trailer_url,
          genres: existing.genres?.length ? existing.genres : game.genres,
          platforms: existing.platforms?.length ? existing.platforms : game.platforms,
          platform_ids: existing.platform_ids?.length ? existing.platform_ids : game.platform_ids,
        };
        const { data: updated } = await supabase.from('games').update(metadata).eq('id', existing.id).select().single();
        saved.push((updated || { ...existing, ...metadata }) as Game);
      }
      continue;
    }
    if (error) console.error('Erro ao armazenar jogo da IGDB:', error);
  }
  return saved;
}

async function cacheBatch(supabase: SupabaseClient, games: IGDBGameResult[]): Promise<Game[]> {
  if (!games.length) return [];
  const { data, error } = await supabase.from('games').upsert(games.map(payloadFor), { onConflict: 'igdb_id' }).select();
  // Um lote é tudo ou nada, e as recuperações por linha (schema antigo, título
  // duplicado) só existem uma linha por vez, então a falha cai no caminho lento.
  if (error || !data) return cacheOneByOne(supabase, games);
  return data as Game[];
}

export async function cacheIGDBGames(supabase: SupabaseClient, games: IGDBGameResult[]): Promise<Game[]> {
  if (!games.length) return [];
  // Um lote só para quem tem capa e outro para quem não tem: o postgrest-js manda
  // `columns` com a união das chaves do lote, então misturar os dois faria a capa
  // ausente de um apagar a capa gravada do outro.
  const [withCover, withoutCover] = await Promise.all([
    cacheBatch(supabase, games.filter(game => game.image_url)),
    cacheBatch(supabase, games.filter(game => !game.image_url)),
  ]);
  const byIgdbId = new Map([...withCover, ...withoutCover].map(row => [row.igdb_id, row]));
  return games.map(game => byIgdbId.get(game.id)).filter((row): row is Game => Boolean(row));
}
