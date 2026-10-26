import { Env } from "./types";

export const CONFIG_DEFAULTS = {
  PRIMARY_MODEL: "gemini-3.1-flash-lite",
  MAX_CANDIDATES: 6,
  MAX_TVMAZE_CALLS: 6,
  GEMINI_TIMEOUT_MS: 16000,
  TVMAZE_TIMEOUT_MS: 5000,
  CACHE_TTL_SECONDS: 86400, // 24 hours
  MAX_QUERY_LENGTH: 1000,
  MIN_QUERY_LENGTH: 1,
  TVMAZE_BASE_URL: "https://api.tvmaze.com",
  GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
  CATALOG_ATTRIBUTION: "Data provided by TVmaze (CC BY-SA 4.0)"
};

export function getResolvedConfig(env: Env) {
  return {
    primaryModel: env.PRIMARY_MODEL || CONFIG_DEFAULTS.PRIMARY_MODEL,
    maxCandidates: parseInt(env.MAX_CANDIDATES || String(CONFIG_DEFAULTS.MAX_CANDIDATES), 10),
    maxTvMazeCalls: parseInt(env.MAX_TVMAZE_CALLS || String(CONFIG_DEFAULTS.MAX_TVMAZE_CALLS), 10),
    geminiTimeoutMs: parseInt(env.GEMINI_TIMEOUT_MS || String(CONFIG_DEFAULTS.GEMINI_TIMEOUT_MS), 10),
    tvMazeTimeoutMs: parseInt(env.TVMAZE_TIMEOUT_MS || String(CONFIG_DEFAULTS.TVMAZE_TIMEOUT_MS), 10),
    cacheTtlSeconds: parseInt(env.CACHE_TTL_SECONDS || String(CONFIG_DEFAULTS.CACHE_TTL_SECONDS), 10),
    tvMazeBaseUrl: CONFIG_DEFAULTS.TVMAZE_BASE_URL,
    geminiBaseUrl: CONFIG_DEFAULTS.GEMINI_BASE_URL,
    catalogAttribution: CONFIG_DEFAULTS.CATALOG_ATTRIBUTION
  };
}
