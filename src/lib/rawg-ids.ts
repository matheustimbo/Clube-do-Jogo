/**
 * IGDB → RAWG ids for the genres and platforms the app filters by and stores.
 * The app speaks IGDB ids everywhere (filters, games.platform_ids,
 * user_platforms.igdb_platform_id), so RAWG ids never leave src/lib/rawg.ts.
 *
 * Sources, checked 2026-11-23:
 * - RAWG ids: the genre and platform lists rawg.io embeds in its own pages
 *   (https://rawg.io/games/pc). The API equivalents, /api/genres and
 *   /api/platforms, need a key.
 * - IGDB ids: https://api-docs.igdb.com, whose examples name PC 6, PS4 48,
 *   Xbox One 49, Switch 130 and RPG 12. The rest are the ids this app already
 *   sends to IGDB: the discover filters (src/app/jogos/page.tsx,
 *   apps/mobile/app/(app)/(tabs)/jogos.tsx), the discover route's genre names
 *   and the offline fixture.
 *
 * Add a row only after checking both ids at a source. A missing row is safe:
 * a filter without a translation returns no games, and a RAWG platform without
 * one keeps its name but no id.
 */
const GENRES: ReadonlyArray<readonly [igdb: number, rawg: number]> = [
  [12, 5], // Role-playing (RPG) → RPG
  [31, 3], // Adventure → Adventure
  [32, 51], // Indie → Indie
  [8, 83], // Platform → Platformer
  [9, 7], // Puzzle → Puzzle
  [15, 10], // Strategy → Strategy
  [5, 2], // Shooter → Shooter
];

const PLATFORMS: ReadonlyArray<readonly [igdb: number, rawg: number]> = [
  [6, 4], // PC (Microsoft Windows) → PC
  [48, 18], // PlayStation 4
  [167, 187], // PlayStation 5
  [49, 1], // Xbox One
  [169, 186], // Xbox Series X|S → Xbox Series S/X
  [130, 7], // Nintendo Switch
];

const RAWG_GENRE_BY_IGDB = new Map(GENRES);
const RAWG_PLATFORM_BY_IGDB = new Map(PLATFORMS);
const IGDB_PLATFORM_BY_RAWG = new Map(PLATFORMS.map(([igdb, rawg]) => [rawg, igdb]));

export function rawgGenreFor(igdbGenreId: number): number | undefined {
  return RAWG_GENRE_BY_IGDB.get(igdbGenreId);
}

export function rawgPlatformFor(igdbPlatformId: number): number | undefined {
  return RAWG_PLATFORM_BY_IGDB.get(igdbPlatformId);
}

export function igdbPlatformFor(rawgPlatformId: number): number | undefined {
  return IGDB_PLATFORM_BY_RAWG.get(rawgPlatformId);
}
