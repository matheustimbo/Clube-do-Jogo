/**
 * Ids IGDB → RAWG dos gêneros e plataformas que o app filtra e grava. O app fala ids
 * da IGDB em todo lugar (filtros, games.platform_ids, user_platforms.igdb_platform_id),
 * então id da RAWG nunca sai de src/lib/rawg.ts.
 *
 * Fontes, conferidas em 2026-11-23:
 * - Ids da RAWG: as listas de gêneros e plataformas que o rawg.io embute nas próprias
 *   páginas (https://rawg.io/games/pc). Os equivalentes na API, /api/genres e
 *   /api/platforms, exigem chave.
 * - Ids da IGDB: https://api-docs.igdb.com, cujos exemplos nomeiam PC 6, PS4 48,
 *   Xbox One 49, Switch 130 e RPG 12. Os demais são os ids que o app já manda para a
 *   IGDB: os filtros de descoberta (src/app/jogos/page.tsx,
 *   apps/mobile/app/(app)/(tabs)/jogos.tsx), os nomes de gênero da rota de descoberta
 *   e a fixture offline. O 3DS (37) foi conferido na revisão da integração.
 * - Ids da IGDB de Wii U em diante na lista de plataformas: IGDB_PLATFORM_LIST do RomM
 *   (https://github.com/rommapp/romm/blob/master/backend/adapters/services/igdb.py),
 *   que guarda o id de cada plataforma da IGDB. Os ids da RAWG deles vêm da mesma
 *   página do rawg.io acima.
 *
 * Só acrescente uma linha depois de conferir os dois ids numa fonte. Linha que falta é
 * segura: filtro sem tradução não devolve jogos, e plataforma da RAWG sem tradução
 * fica com o nome e sem id.
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
  [37, 8], // Nintendo 3DS
  [41, 10], // Wii U
  [5, 11], // Wii
  [9, 16], // PlayStation 3
  [8, 15], // PlayStation 2
  [46, 19], // PlayStation Vita → PS Vita
  [12, 14], // Xbox 360
  [39, 3], // iOS
  [34, 21], // Android
  [14, 5], // Mac → macOS
  [3, 6], // Linux
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
