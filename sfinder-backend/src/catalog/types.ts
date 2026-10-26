export interface CatalogItem {
  itemId?: number;                  // Explicit, permanent SQLite INTEGER PRIMARY KEY
  id: string;                       // e.g. 'tvmaze-1', 'wikidata-Q25188'
  provider: "TVMAZE" | "WIKIDATA";
  providerId: string;                // e.g. '1', 'Q25188'
  mediaType: "SERIES" | "MOVIE";
  title: string;
  originalTitle?: string | null;
  normalizedTitle: string;
  releaseYear?: number | null;
  genres: string[];
  primaryGenre?: string | null;
  countries: string[];
  primaryCountry?: string | null;
  synopsis?: string | null;
  rating?: number | null;
  voteCount?: number | null;
  popularityScore?: number | null;
  posterUrl?: string | null;
  catalogSource: string;
  tropeTags?: string | null;
  providerUpdatedAt?: number | null;
  indexedAt: number;
  compositeScore?: number;
}

export interface ImportCursor {
  provider: "TVMAZE" | "WIKIDATA";
  lastPage: number;
  totalImported: number;
  lastImportedId?: string | null;
  status: "IDLE" | "IN_PROGRESS" | "COMPLETED" | "ERROR";
  errorMessage?: string | null;
  updatedAt: number;
}

export interface IngestionBudgetRecord {
  dayUtc: string;
  rowsWritten: number;
  rowsRead: number;
  recordsImported: number;
  batchesProcessed: number;
  updatedAt: number;
}

export interface CatalogSearchParams {
  query: string;
  mediaType?: "ALL" | "MOVIE" | "SERIES";
  genre?: string;
  country?: string;
  page?: number;     // 1-indexed, default 1
  limit?: number;    // default 20, max 100
}

export interface CatalogSearchResult {
  items: CatalogItem[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  searchMode: "AI_ENHANCED" | "CATALOG_SEARCH" | "EMPTY";
  disclaimer?: string;
}

export interface DatabaseAdapter {
  prepare(sql: string): PreparedStatementAdapter;
  batch?(statements: PreparedStatementAdapter[]): Promise<any[]>;
  exec?(sql: string): Promise<any>;
}

export interface PreparedStatementAdapter {
  bind(...values: any[]): PreparedStatementAdapter;
  all<T = any>(): Promise<{ results: T[]; success: boolean }>;
  first<T = any>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: any }>;
}
