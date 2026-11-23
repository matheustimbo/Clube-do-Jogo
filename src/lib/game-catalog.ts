import { isOfflineCatalogEnabled, offlineBrowseGames, offlineGameById, offlineGameMugshots, offlineSearchGames, offlineSearchPlatforms } from './igdb-offline';
import { browseGamesWithIGDB, getGameByIGDBId, getGameMugshotsByIGDBId, searchGamesWithIGDB, searchPlatformsWithIGDB } from './igdb';
import type { CatalogAttribution } from './types';
import { browseGamesWithRAWG, getGameByRAWGId, getGameMugshotsByRAWGId, searchGamesWithRAWG, searchPlatformsWithRAWG } from './rawg';

export interface CatalogGame {
  id: number;
  title: string;
  duration_hours: number;
  average_rating: number | null;
  release_year: number | null;
  image_url: string | null;
  description: string | null;
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
 * A coluna de games que guarda o id de cada catálogo. As numerações se sobrepõem,
 * então uma linha nunca guarda o id de um catálogo na coluna de outro.
 */
export type CatalogKey = 'igdb_id' | 'rawg_id';

const CATALOG_KEYS: readonly CatalogKey[] = ['igdb_id', 'rawg_id'];

export interface CatalogProvider {
  key: CatalogKey;
  attribution: CatalogAttribution | null;
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
    attribution: null,
    searchGames: searchGamesWithIGDB,
    browseGames: browseGamesWithIGDB,
    getGameById: getGameByIGDBId,
    getGameMugshots: getGameMugshotsByIGDBId,
    searchPlatforms: searchPlatformsWithIGDB,
  },
  rawg: {
    key: 'rawg_id',
    // Os termos da RAWG pedem um link ativo para ela em toda tela que mostra os dados dela.
    attribution: { name: 'RAWG', url: 'https://rawg.io' },
    searchGames: searchGamesWithRAWG,
    browseGames: browseGamesWithRAWG,
    getGameById: getGameByRAWGId,
    getGameMugshots: getGameMugshotsByRAWGId,
    searchPlatforms: searchPlatformsWithRAWG,
  },
  // A fixture imita a IGDB: as linhas do seed guardam esses ids em igdb_id.
  offline: {
    key: 'igdb_id',
    attribution: null,
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

export function activeCatalogAttribution(): CatalogAttribution | null {
  return activeProvider().attribution;
}

/** O banco ainda não tem a coluna (ou a unique) do id do catálogo ativo. */
export class CatalogSchemaError extends Error {
  constructor(readonly column: CatalogKey) {
    super(`games.${column} não existe ou não é única neste banco. Aplique supabase/migrations/20261123210000_catalog_provider_ids.sql antes de usar este catálogo.`);
    this.name = 'CatalogSchemaError';
  }
}

type CatalogIds = Partial<Record<CatalogKey, number | null>>;

/** Linha com id de um catálogo pertence a ele; outro catálogo não grava o próprio id nela. */
export function hasNoCatalogId(row: CatalogIds) {
  return CATALOG_KEYS.every(key => row[key] == null);
}

/** Como o catálogo ativo pode achar uma linha de games já gravada. */
export type CatalogLookup =
  | { by: 'id'; id: number }
  | { by: 'title'; title: string }
  /** Outro catálogo é dono da linha; o id dele não quer dizer nada para o ativo. */
  | { by: 'none' };

export function catalogLookupFor(row: CatalogIds & { title: string }): CatalogLookup {
  const key = activeCatalogKey();
  // select('*') só traz a chave quando a coluna existe.
  if (!(key in row)) throw new CatalogSchemaError(key);
  const id = row[key];
  if (id) return { by: 'id', id };
  return hasNoCatalogId(row) ? { by: 'title', title: row.title } : { by: 'none' };
}

function normalizedTitle(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function findGameByExactTitle(title: string): Promise<CatalogGame | null> {
  return (await searchGames(title)).find(candidate => normalizedTitle(candidate.title) === normalizedTitle(title)) ?? null;
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
