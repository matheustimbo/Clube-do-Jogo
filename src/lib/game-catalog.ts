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

export interface CatalogProvider {
  searchGames(query: string): Promise<CatalogGame[]>;
  browseGames(options: CatalogBrowseOptions): Promise<CatalogGame[]>;
  getGameById(id: number): Promise<CatalogGame | null>;
  getGameMugshots(gameId: number): Promise<CatalogCharacterMugshot[]>;
  searchPlatforms(query: string): Promise<CatalogPlatform[]>;
}

export type CatalogProviderId = 'igdb' | 'rawg' | 'offline';

const PROVIDERS: Record<CatalogProviderId, CatalogProvider> = {
  igdb: {
    searchGames: searchGamesWithIGDB,
    browseGames: browseGamesWithIGDB,
    getGameById: getGameByIGDBId,
    getGameMugshots: getGameMugshotsByIGDBId,
    searchPlatforms: searchPlatformsWithIGDB,
  },
  rawg: {
    searchGames: searchGamesWithRAWG,
    browseGames: browseGamesWithRAWG,
    getGameById: getGameByRAWGId,
    getGameMugshots: getGameMugshotsByRAWGId,
    searchPlatforms: searchPlatformsWithRAWG,
  },
  offline: {
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
