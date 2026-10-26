/**
 * Core type definitions for S Finder backend.
 */

export type SearchMode = "AI_ENHANCED" | "CATALOG_SEARCH" | "EMPTY" | "ERROR";

export type ContentType = "ALL" | "MOVIE" | "MOVIES" | "SERIES";

export type Category = 
  | "ALL"
  | "TV_SERIES"
  | "KDRAMA"
  | "TURKISH_DRAMA"
  | "ANIME"
  | "WEB_SERIES"
  | "MOVIES";

export interface Candidate {
  canonicalTitle: string;
  originalTitle?: string;
  approximateYear?: number;
  expectedMediaType: "TV_SERIES" | "KDRAMA" | "TURKISH_DRAMA" | "ANIME" | "WEB_SERIES" | "MOVIE";
  confidenceScore?: number;
  matchReason: string;
  searchKeywords?: string[];
}

export interface VerifiedEntertainmentItem {
  id: string;
  title: string;
  originalTitle?: string | null;
  releaseYear?: number | null;
  mediaType: string;
  genres: string[];
  originalLanguage?: string | null;
  countryOfOrigin?: string | null;
  countriesOfOrigin?: string[];
  rating?: number | null;
  synopsis: string;
  posterUrl?: string | null;
  matchExplanation: string;
  catalogSource: string;
  relevanceScore?: number | null;
}

export interface DiscoverRequest {
  query: string;
  category?: Category;
  contentType?: ContentType;
  genre?: string;
  country?: string;
  page?: number;
  limit?: number;
}

export interface DiscoverResponse {
  mode: SearchMode;
  query: string;
  resolvedCount: number;
  totalCount?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
  items: VerifiedEntertainmentItem[];
  disclaimer: string;
  fallbackUsed: boolean;
  error?: string;
  diagnostic?: PipelineDiagnostic;
}

export interface Env {
  GEMINI_API_KEY?: string;
  PRIMARY_MODEL?: string;
  MAX_CANDIDATES?: string;
  MAX_TVMAZE_CALLS?: string;
  GEMINI_TIMEOUT_MS?: string;
  TVMAZE_TIMEOUT_MS?: string;
  CACHE_TTL_SECONDS?: string;
  RETRY_DELAY_MS?: string;
  DB?: any;
}

export interface TVMazeShow {
  id: number;
  name: string;
  type: string;
  language: string | null;
  genres: string[];
  status: string;
  premiered: string | null;
  rating?: { average: number | null };
  network?: { country?: { name: string; code: string } } | null;
  webChannel?: { name: string; country?: { name: string; code: string } | null } | null;
  image?: { medium?: string; original?: string } | null;
  summary: string | null;
}

export interface TVMazeSearchResult {
  score: number;
  show: TVMazeShow;
}

export type DiagnosticStage =
  | "GEMINI_TIMEOUT"
  | "GEMINI_LOCATION_UNSUPPORTED"
  | "GEMINI_INVALID_ARGUMENT"
  | "GEMINI_PERMISSION_DENIED"
  | "GEMINI_MODEL_NOT_FOUND"
  | "GEMINI_QUOTA_EXCEEDED"
  | "GEMINI_UPSTREAM_UNAVAILABLE"
  | "GEMINI_UPSTREAM_ERROR"
  | "GEMINI_INVALID_RESPONSE"
  | "GEMINI_ZERO_CANDIDATES"
  | "CATALOG_NO_CANDIDATES_RESOLVED"
  | "CATALOG_RESOLUTION_ERROR"
  | "AI_ENHANCED_SUCCESS";

export type RejectionReason =
  | "NO_TVMAZE_RESULTS"
  | "NO_WIKIDATA_RESULTS"
  | "NOT_A_FILM"
  | "SCORE_BELOW_THRESHOLD"
  | "BUDGET_EXCEEDED"
  | "LOOKUP_ERROR"
  | "LOW_SEMANTIC_RELEVANCE"
  | "FILTER_MISMATCH";

export interface CandidateRejection {
  candidateTitle: string;
  reason: RejectionReason;
  highestScore?: number;
  relevanceScore?: number;
}

export interface PipelineDiagnostic {
  stage: DiagnosticStage;
  configuredModel?: string;
  geminiDurationMs?: number;
  tvmazeDurationMs?: number;
  wikidataDurationMs?: number;
  relevanceDurationMs?: number;
  geminiHttpStatus?: number;
  geminiErrorCode?: number;
  geminiErrorStatus?: string;
  geminiErrorMessage?: string;
  geminiFinishReason?: string;
  hasThoughtParts?: boolean;
  candidatesRawCount?: number;
  candidatesAcceptedCount?: number;
  retryAttempted?: boolean;
  retrySucceeded?: boolean;
  tvmazeCallsUsed: number;
  wikidataCallsUsed?: number;
  catalogRecordsReturned: number;
  candidateRejections: CandidateRejection[];
  finalMode: SearchMode;
  fallbackUsed: boolean;
  totalElapsedMs: number;
}
