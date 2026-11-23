import { isOfflineCatalogEnabled, offlineBrowseGames, offlineGameById, offlineGameMugshots, offlineSearchGames, offlineSearchPlatforms } from './igdb-offline';
import { browseGamesWithIGDB, getGameByIGDBId, getGameMugshotsByIGDBId, searchGamesWithIGDB, searchPlatformsWithIGDB } from './igdb';
import { browseGamesWithRAWG, getGameByRAWGId, getGameMugshotsByRAWGId, searchGamesWithRAWG, searchPlatformsWithRAWG } from './rawg';

export interface CatalogGame {
  id: number;
  title: string;
  duration_hours: number;
  average_rating: number | null;
  release_year: number | null;
  image_url: string | null;
  description: string;
  screenshot_urls: string[];
  trailer_url: string | null;
  genres: string[];
  platforms: string[];
  platform_ids: number[];
}

export interface CatalogPlatform {
  igdb_platform_id: number;
  name: string;
  abbreviation: string | null;
  logo_url: string | null;
}

export interface CatalogCharacterMugshot {
  id: number;
  name: string;
  image_url: string;
}

export type CatalogBrowseSort = 'popular' | 'rated' | 'recent' | 'anticipated';

export interface CatalogBrowseOptions {
  query?: string;
  sort?: CatalogBrowseSort;
  genre?: number;
  platform?: number;
  year?: number;
  offset?: number;
  limit?: number;
}

/**
 * The games column that holds each catalog's id. The numberings overlap, so a row
 * never keeps one catalog's id in another catalog's column.
 */
export type CatalogKey = 'igdb_id' | 'rawg_id';

const CATALOG_KEYS: readonly CatalogKey[] = ['igdb_id', 'rawg_id'];

export interface CatalogProvider {
  key: CatalogKey;
  searchGames(query: string): Promise<CatalogGame[]>;
  browseGames(options: CatalogBrowseOptions): Promise<CatalogGame[]>;
  getGameById(id: number): Promise<CatalogGame | null>;
  getGameMugshots(gameId: number): Promise<CatalogCharacterMugshot[]>;
  searchPlatforms(query: string): Promise<CatalogPlatform[]>;
}

export type CatalogProviderId = 'igdb' | 'rawg' | 'offline';

const PROVIDERS: Record<CatalogProviderId, CatalogProvider> = {
  igdb: {
    key: 'igdb_id',
    searchGames: searchGamesWithIGDB,
    browseGames: browseGamesWithIGDB,
    getGameById: getGameByIGDBId,
    getGameMugshots: getGameMugshotsByIGDBId,
    searchPlatforms: searchPlatformsWithIGDB,
  },
  rawg: {
    key: 'rawg_id',
    searchGames: searchGamesWithRAWG,
    browseGames: browseGamesWithRAWG,
    getGameById: getGameByRAWGId,
    getGameMugshots: getGameMugshotsByRAWGId,
    searchPlatforms: searchPlatformsWithRAWG,
  },
  // The fixture mirrors IGDB: its seed rows carry these ids in igdb_id.
  offline: {
    key: 'igdb_id',
    searchGames: async query => offlineSearchGames(query),
    browseGames: async options => offlineBrowseGames(options),
    getGameById: async id => offlineGameById(id),
    getGameMugshots: async gameId => offlineGameMugshots(gameId),
    searchPlatforms: async query => offlineSearchPlatforms(query),
  },
};

export function activeCatalogProviderId(): CatalogProviderId {
  if (isOfflineCatalogEnabled()) return 'offline';
  return process.env.GAME_CATALOG_PROVIDER === 'rawg' ? 'rawg' : 'igdb';
}

function activeProvider(): CatalogProvider {
  return PROVIDERS[activeCatalogProviderId()];
}

export function activeCatalogKey(): CatalogKey {
  return activeProvider().key;
}

/** The database has no column (or no unique index) for the active catalog's id yet. */
export class CatalogSchemaError extends Error {
  constructor(readonly column: CatalogKey) {
    super(`games.${column} não existe ou não é única neste banco. Aplique supabase/migrations/20261123120000_catalog_provider_ids.sql antes de usar este catálogo.`);
    this.name = 'CatalogSchemaError';
  }
}

type CatalogIds = Partial<Record<CatalogKey, number | null>>;

/** A row with a catalog id belongs to that catalog; another catalog must not write its id there. */
export function hasNoCatalogId(row: CatalogIds) {
  return CATALOG_KEYS.every(key => row[key] == null);
}

export function searchGames(query: string): Promise<CatalogGame[]> {
  return activeProvider().searchGames(query);
}

export function browseGames(options: CatalogBrowseOptions): Promise<CatalogGame[]> {
  return activeProvider().browseGames(options);
}

export function getGameById(id: number): Promise<CatalogGame | null> {
  return activeProvider().getGameById(id);
}

export function getGameMugshots(gameId: number): Promise<CatalogCharacterMugshot[]> {
  return activeProvider().getGameMugshots(gameId);
}

export function searchPlatforms(query: string): Promise<CatalogPlatform[]> {
  return activeProvider().searchPlatforms(query);
}
