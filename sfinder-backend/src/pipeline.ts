import { getResolvedConfig } from "./config";
import { BroadDiscoveryEngine } from "./catalog/discoveryEngine";
import { GeminiDiagnosticInfo, GeminiError, GeminiQuotaExceededError, GeminiTimeoutError, requestGeminiCandidates } from "./gemini";
import { evaluateSemanticRelevance } from "./relevance";
import { matchesCountryFilter, matchesGenreFilter, TvMazeResolver } from "./tvmaze";
import { Candidate, CandidateRejection, DiagnosticStage, DiscoverRequest, DiscoverResponse, Env, PipelineDiagnostic, SearchMode, VerifiedEntertainmentItem } from "./types";
import {
  extractWikidataCountries,
  extractWikidataCountry,
  extractWikidataGenres,
  extractWikidataReleaseYear,
  isFilmInstance,
  matchesMovieCountryFilter,
  matchesMovieGenreFilter,
  WikidataResolver
} from "./wikidata";

const COMMON_GENRES = new Set([
  "action", "comedy", "drama", "thriller", "romance", "horror",
  "sci-fi", "science fiction", "fantasy", "mystery", "crime",
  "animation", "anime", "documentary", "adventure", "family"
]);

const NARRATIVE_OR_MOOD_PREFIXES = [
  "i'm in the mood",
  "in the mood",
  "i vaguely remember",
  "vaguely remember",
  "i remember",
  "looking for a",
  "show about",
  "series about",
  "movie about"
];

/**
 * Evaluates whether a search query is suitable for direct catalog title search.
 */
export function isDirectCatalogQuery(query: string): boolean {
  if (typeof query !== "string") return false;
  const trimmed = query.trim();
  if (trimmed.length === 0 || trimmed.length > 60) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  for (const prefix of NARRATIVE_OR_MOOD_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return false;
    }
  }

  // Multi-sentence check (contains sentence-ending punctuation followed by whitespace and next word)
  if (/[.?!;]\s+[A-Za-z]/.test(trimmed)) {
    return false;
  }

  // Word count check (split by whitespace)
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 6) {
    return false;
  }

  return true;
}

function logDiscoveryDiagnostic(diag: PipelineDiagnostic) {
  const retryDetails = diag.retryAttempted
    ? ` retryAttempted=true retrySucceeded=${diag.retrySucceeded ?? false}`
    : "";
  const errDetails = diag.geminiHttpStatus 
    ? ` httpStatus=${diag.geminiHttpStatus}${diag.geminiErrorStatus ? ` errorStatus=${diag.geminiErrorStatus}` : ""}${diag.geminiErrorCode ? ` errorCode=${diag.geminiErrorCode}` : ""}${diag.geminiErrorMessage ? ` errorMsg="${diag.geminiErrorMessage}"` : ""}`
    : "";
  console.log(
    `[DiscoveryDiagnostic] stage=${diag.stage} model=${diag.configuredModel || "unknown"} mode=${diag.finalMode} geminiTimedOut=${diag.stage === "GEMINI_TIMEOUT"} elapsedMs=${diag.totalElapsedMs} geminiMs=${diag.geminiDurationMs ?? 0} tvmazeMs=${diag.tvmazeDurationMs ?? 0} wikidataMs=${diag.wikidataDurationMs ?? 0} relevanceMs=${diag.relevanceDurationMs ?? 0} fallbackUsed=${diag.fallbackUsed} resolvedCount=${diag.catalogRecordsReturned} rejections=${diag.candidateRejections.length}${retryDetails}${errDetails}`
  );
}

export async function executeDiscoveryPipeline(
  request: DiscoverRequest,
  env: Env,
  fetchFn: typeof fetch = fetch
): Promise<DiscoverResponse> {
  const startTime = Date.now();
  const config = getResolvedConfig(env);
  const rawQuery = request?.query;

  // 1. Request Validation
  if (typeof rawQuery !== "string" || rawQuery.trim().length === 0) {
    return {
      mode: "ERROR",
      query: "",
      resolvedCount: 0,
      items: [],
      disclaimer: "Query must not be empty.",
      fallbackUsed: false,
      error: "Invalid query: query string is required."
    };
  }

  const trimmedQuery = rawQuery.trim();
  if (trimmedQuery.length > 1000) {
    return {
      mode: "ERROR",
      query: trimmedQuery.substring(0, 50) + "...",
      resolvedCount: 0,
      items: [],
      disclaimer: "Query exceeds maximum allowed length of 1,000 characters.",
      fallbackUsed: false,
      error: "Query too long: maximum 1,000 characters supported."
    };
  }

  const rawContentType = request.contentType || (request.category === "MOVIES" ? "MOVIE" : "ALL");
  const contentType = (rawContentType === "MOVIES" ? "MOVIE" : rawContentType) as "ALL" | "MOVIE" | "SERIES";
  const category = request.category || "ALL";
  const isSingleWordGenre = COMMON_GENRES.has(trimmedQuery.toLowerCase());

  // 1b. Check Searchable Catalog D1 Index (if provisioned and populated)
  if (env.DB) {
    try {
      const broadEngine = new BroadDiscoveryEngine(env.DB);
      const d1Result = await broadEngine.discover(request);
      if (d1Result.resolvedCount > 0) {
        return d1Result;
      }
    } catch {
      // Graceful fallback to live catalog resolution on D1 unavailability or missing tables
    }
  }

  // 2. Initialize Catalog Resolvers with strict call budgets
  const tvmazeResolver = new TvMazeResolver(
    config.tvMazeBaseUrl,
    config.tvMazeTimeoutMs,
    config.maxTvMazeCalls,
    config.catalogAttribution,
    fetchFn
  );

  const wikidataMaxCalls = Math.max(8, config.maxCandidates * 2);
  const wikidataResolver = new WikidataResolver(
    "https://www.wikidata.org/w/api.php",
    config.tvMazeTimeoutMs,
    wikidataMaxCalls,
    "Data provided by Wikidata (CC0)",
    fetchFn
  );

  let verifiedItems: VerifiedEntertainmentItem[] = [];
  let geminiFailed = false;
  let geminiTimedOut = false;
  let failureReason = "";
  let diagnosticStage: DiagnosticStage = "CATALOG_NO_CANDIDATES_RESOLVED";
  let geminiDiagInfo: GeminiDiagnosticInfo | undefined;
  let tvmazeDurationMs: number | undefined;
  let wikidataDurationMs: number | undefined;
  let relevanceDurationMs: number | undefined;
  const candidateRejections: CandidateRejection[] = [];

  function buildDiagnostic(
    finalMode: SearchMode,
    fallbackUsed: boolean,
    catalogRecordsReturned: number
  ): PipelineDiagnostic {
    return {
      stage: diagnosticStage,
      configuredModel: config.primaryModel,
      geminiDurationMs: geminiDiagInfo?.durationMs,
      tvmazeDurationMs,
      wikidataDurationMs,
      relevanceDurationMs,
      geminiHttpStatus: geminiDiagInfo?.httpStatus,
      geminiErrorCode: geminiDiagInfo?.errorCode,
      geminiErrorStatus: geminiDiagInfo?.errorStatus,
      geminiErrorMessage: geminiDiagInfo?.errorMessage,
      geminiFinishReason: geminiDiagInfo?.finishReason,
      hasThoughtParts: geminiDiagInfo?.hasThoughtParts,
      candidatesRawCount: geminiDiagInfo?.rawCandidatesCount,
      candidatesAcceptedCount: geminiDiagInfo?.acceptedCandidatesCount,
      retryAttempted: geminiDiagInfo?.retryAttempted,
      retrySucceeded: geminiDiagInfo?.retrySucceeded,
      tvmazeCallsUsed: tvmazeResolver.getCallCount(),
      wikidataCallsUsed: wikidataResolver.getCallCount(),
      catalogRecordsReturned,
      candidateRejections,
      finalMode,
      fallbackUsed,
      totalElapsedMs: Date.now() - startTime
    };
  }

  // 3. Attempt AI-Assisted Context Discovery if Gemini API key exists
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim() !== "") {
    try {
      const retryDelayMs = env.RETRY_DELAY_MS ? parseInt(env.RETRY_DELAY_MS, 10) : undefined;
      const candidates = await requestGeminiCandidates({
        apiKey: env.GEMINI_API_KEY,
        query: trimmedQuery,
        category,
        contentType,
        genre: request.genre,
        country: request.country,
        model: config.primaryModel,
        baseUrl: config.geminiBaseUrl,
        timeoutMs: config.geminiTimeoutMs,
        maxCandidates: config.maxCandidates,
        fetchFn,
        retryDelayMs: isNaN(retryDelayMs as number) ? undefined : retryDelayMs,
        onDiagnostic: (info) => {
          geminiDiagInfo = info;
        }
      });

      if (geminiDiagInfo?.parseError) {
        diagnosticStage = "GEMINI_INVALID_RESPONSE";
      } else if (candidates.length === 0) {
        diagnosticStage = "GEMINI_ZERO_CANDIDATES";
      } else {
        // Deduplicate candidates by normalized title to prevent duplicate adaptations or repeat titles from consuming budget
        const seenCandidateTitles = new Set<string>();
        const uniqueCandidates: Candidate[] = [];
        for (const c of candidates) {
          const norm = c.canonicalTitle.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
          if (!seenCandidateTitles.has(norm)) {
            seenCandidateTitles.add(norm);
            uniqueCandidates.push(c);
          }
        }

        // Bound candidate resolution budget to leave at least 1 call for potential keyword fallback
        const candidateBudget = Math.min(
          config.maxCandidates,
          Math.max(1, config.maxTvMazeCalls - 1)
        );
        const candidatesToResolve = uniqueCandidates.slice(0, candidateBudget);

        const tvmazeCandidates: Candidate[] = [];
        const wikidataCandidates: Candidate[] = [];

        for (const c of candidatesToResolve) {
          if (contentType === "MOVIE") {
            wikidataCandidates.push({ ...c, expectedMediaType: "MOVIE" });
          } else if (contentType === "SERIES") {
            tvmazeCandidates.push(c);
          } else {
            // "ALL"
            if (c.expectedMediaType === "MOVIE") {
              wikidataCandidates.push(c);
            } else {
              tvmazeCandidates.push(c);
            }
          }
        }

        try {
          const [tvmazeResolved, wikidataResolved] = await Promise.all([
            tvmazeCandidates.length > 0
              ? (async () => {
                  const start = Date.now();
                  const items = await tvmazeResolver.resolveCandidates(
                    tvmazeCandidates,
                    (rejection) => candidateRejections.push(rejection),
                    { genre: request.genre, country: request.country }
                  );
                  tvmazeDurationMs = Date.now() - start;
                  return items;
                })()
              : Promise.resolve([]),
            wikidataCandidates.length > 0
              ? (async () => {
                  const start = Date.now();
                  const items = await wikidataResolver.resolveCandidates(
                    wikidataCandidates,
                    (rejection) => candidateRejections.push(rejection),
                    { genre: request.genre, country: request.country }
                  );
                  wikidataDurationMs = Date.now() - start;
                  return items;
                })()
              : Promise.resolve([])
          ]);

          const resolvedItems = [...tvmazeResolved, ...wikidataResolved];

          const relevanceStartTime = Date.now();
          const candidateMap = new Map<string, Candidate>();
          for (const c of candidatesToResolve) {
            candidateMap.set(c.canonicalTitle.toLowerCase(), c);
          }

          const acceptedItems: VerifiedEntertainmentItem[] = [];
          for (const item of resolvedItems) {
            const candidate = candidateMap.get(item.title.toLowerCase()) || 
              candidatesToResolve.find(c => item.title.toLowerCase().includes(c.canonicalTitle.toLowerCase())) || {
                canonicalTitle: item.title,
                expectedMediaType: item.mediaType as any,
                matchReason: item.matchExplanation
              };

            const relevance = evaluateSemanticRelevance(trimmedQuery, candidate, item);
            item.relevanceScore = relevance.score;

            if (relevance.isAccepted) {
              acceptedItems.push(item);
            } else {
              candidateRejections.push({
                candidateTitle: item.title,
                reason: "LOW_SEMANTIC_RELEVANCE",
                highestScore: relevance.score
              });
            }
          }

          // Rank accepted items: prioritize substantially higher relevance scores
          // (difference >= 15 pts), otherwise preserve Gemini candidate ranking
          acceptedItems.sort((a, b) => {
            const scoreDiff = (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
            if (Math.abs(scoreDiff) >= 15) {
              return scoreDiff;
            }
            return 0;
          });
          verifiedItems = acceptedItems;
          relevanceDurationMs = Date.now() - relevanceStartTime;

          if (verifiedItems.length > 0) {
            diagnosticStage = "AI_ENHANCED_SUCCESS";
          } else if (candidateRejections.length > 0 && candidateRejections.every(r => r.reason === "LOOKUP_ERROR")) {
            diagnosticStage = "CATALOG_RESOLUTION_ERROR";
          } else {
            diagnosticStage = "CATALOG_NO_CANDIDATES_RESOLVED";
          }
        } catch (resolverErr) {
          diagnosticStage = "CATALOG_RESOLUTION_ERROR";
        }
      }
    } catch (error: any) {
      geminiFailed = true;
      if (error instanceof GeminiTimeoutError || error?.name === "AbortError") {
        geminiTimedOut = true;
        diagnosticStage = "GEMINI_TIMEOUT";
        failureReason = "Gemini request timed out.";
      } else {
        const httpStatus = geminiDiagInfo?.httpStatus ?? (error instanceof GeminiError ? error.statusCode : undefined);
        const errorStatus = geminiDiagInfo?.errorStatus ?? (error instanceof GeminiError ? error.errorStatus : undefined);
        const errorMsg = geminiDiagInfo?.errorMessage ?? (error instanceof GeminiError ? error.message : undefined);

        const isLocationError =
          (errorStatus === "FAILED_PRECONDITION" || httpStatus === 400) &&
          typeof errorMsg === "string" &&
          /user location is not supported/i.test(errorMsg);

        if (isLocationError) {
          diagnosticStage = "GEMINI_LOCATION_UNSUPPORTED";
          failureReason = "Gemini API unavailable: user location not supported.";
        } else if (httpStatus === 429 || errorStatus === "RESOURCE_EXHAUSTED" || error instanceof GeminiQuotaExceededError) {
          diagnosticStage = "GEMINI_QUOTA_EXCEEDED";
          failureReason = "Gemini quota or rate limit reached.";
        } else if (httpStatus === 400 || errorStatus === "INVALID_ARGUMENT") {
          diagnosticStage = "GEMINI_INVALID_ARGUMENT";
          failureReason = "Gemini upstream invalid argument error.";
        } else if (httpStatus === 403 || errorStatus === "PERMISSION_DENIED") {
          diagnosticStage = "GEMINI_PERMISSION_DENIED";
          failureReason = "Gemini upstream permission denied.";
        } else if (httpStatus === 404 || errorStatus === "NOT_FOUND") {
          diagnosticStage = "GEMINI_MODEL_NOT_FOUND";
          failureReason = "Gemini model or endpoint not found.";
        } else if (httpStatus === 503 || errorStatus === "UNAVAILABLE") {
          diagnosticStage = "GEMINI_UPSTREAM_UNAVAILABLE";
          failureReason = "Gemini service temporarily unavailable.";
        } else {
          diagnosticStage = "GEMINI_UPSTREAM_ERROR";
          failureReason = error?.message || "AI discovery request failed.";
        }
      }
    }
  } else {
    geminiFailed = true;
    failureReason = "AI service not configured.";
  }

  // 4. Return AI-Enhanced Results if candidates were successfully resolved
  if (!geminiFailed && verifiedItems.length > 0) {
    const formatLabel = contentType === "MOVIE" ? "movies" : contentType === "SERIES" ? "TV series" : "titles";
    const genreNotice = isSingleWordGenre 
      ? ` Note: Single-word genre queries return representative ${formatLabel} from catalog resolution, not an exhaustive genre index.`
      : "";

    const diag = buildDiagnostic("AI_ENHANCED", false, verifiedItems.length);
    logDiscoveryDiagnostic(diag);

    const response: DiscoverResponse = {
      mode: "AI_ENHANCED",
      query: trimmedQuery,
      resolvedCount: verifiedItems.length,
      items: verifiedItems,
      disclaimer: `Verified catalog records matched to your description. AI match notes are generated context.${genreNotice}`,
      fallbackUsed: false,
      diagnostic: diag
    };

    return response;
  }

  // 5. Fallback: Direct Keyword Catalog Search
  // If AI was unavailable, quota exceeded, timed out, or resolved 0 candidates:
  const isDirectQuery = isDirectCatalogQuery(trimmedQuery);

  if (isDirectQuery) {
    try {
      const fallbackItems: VerifiedEntertainmentItem[] = [];

      // A. Movie Fallback via Wikidata (when contentType is MOVIE)
      if (contentType === "MOVIE") {
        try {
          if (wikidataResolver.getCallCount() < 4) {
            const fbStartTime = Date.now();
            const searchResults = await wikidataResolver.searchMovieEntities(trimmedQuery, 5);
            const qids = searchResults.map(s => s.id);
            const entities = await wikidataResolver.getEntities(qids);
            wikidataDurationMs = (wikidataDurationMs ?? 0) + (Date.now() - fbStartTime);

            for (const s of searchResults) {
              const ent = entities[s.id];
              if (!ent || !isFilmInstance(ent)) continue;
              const year = extractWikidataReleaseYear(ent);
              const genres = extractWikidataGenres(ent);
              const countries = extractWikidataCountries(ent);

              if (!matchesMovieGenreFilter(genres, request.genre)) continue;
              if (!matchesMovieCountryFilter(countries, request.country)) continue;

              fallbackItems.push(
                wikidataResolver.mapEntityToVerifiedItem(
                  ent,
                  "Direct title match from Wikidata movie catalog.",
                  year,
                  genres,
                  countries
                )
              );
              if (fallbackItems.length >= config.maxCandidates) break;
            }
          }
        } catch {
          // Ignore isolated movie fallback errors
        }
      } else {
        // B. TV Series Fallback via TVMaze (when contentType is SERIES or ALL)
        if (tvmazeResolver.getCallCount() < config.maxTvMazeCalls) {
          const fbStartTime = Date.now();
          const fallbackResults = await tvmazeResolver.searchShows(trimmedQuery);
          tvmazeDurationMs = (tvmazeDurationMs ?? 0) + (Date.now() - fbStartTime);

          const seenIds = new Set<number>();
          for (const res of fallbackResults) {
            if (res.show && !seenIds.has(res.show.id)) {
              const genrePass = matchesGenreFilter(res.show, request.genre);
              const countryPass = matchesCountryFilter(res.show, request.country);
              if (!genrePass || !countryPass) continue;

              seenIds.add(res.show.id);
              fallbackItems.push(
                tvmazeResolver.mapShowToVerifiedItem(
                  res.show,
                  "Direct title match from TVmaze catalog."
                )
              );
            }
            if (fallbackItems.length >= config.maxCandidates) break;
          }
        }
      }

      if (fallbackItems.length > 0) {
        const genreNotice = isSingleWordGenre 
          ? (contentType === "MOVIE"
              ? " (Wikidata provides keyword search; for complete genre exploration, browse catalog filters.)"
              : " (TVmaze provides keyword search; for complete genre exploration, browse catalog filters.)")
          : "";

        const fallbackDisclaimer = geminiTimedOut
          ? `AI request reached time limit. Showing direct title matches.${genreNotice}`
          : diagnosticStage === "GEMINI_LOCATION_UNSUPPORTED"
            ? `AI discovery is temporarily unavailable in this region. Showing direct title matches.${genreNotice}`
            : `AI semantic matching is resting. Showing direct title matches.${genreNotice}`;

        const diag = buildDiagnostic("CATALOG_SEARCH", true, fallbackItems.length);
        logDiscoveryDiagnostic(diag);

        const response: DiscoverResponse = {
          mode: "CATALOG_SEARCH",
          query: trimmedQuery,
          resolvedCount: fallbackItems.length,
          items: fallbackItems,
          disclaimer: fallbackDisclaimer,
          fallbackUsed: true,
          diagnostic: diag
        };

        return response;
      }
    } catch (err: any) {
      const diag = buildDiagnostic("ERROR", true, 0);
      logDiscoveryDiagnostic(diag);

      const response: DiscoverResponse = {
        mode: "ERROR",
        query: trimmedQuery,
        resolvedCount: 0,
        items: [],
        disclaimer: "Catalog lookup temporarily unavailable. Please check your connection and retry.",
        fallbackUsed: true,
        error: "Unable to retrieve catalog results.",
        diagnostic: diag
      };

      return response;
    }
  }

  // 6. Empty State:
  const formatNoun = contentType === "MOVIE" ? "movies" : "television series";
  let emptyDisclaimer: string;
  if (!isDirectQuery) {
    if (!geminiFailed && diagnosticStage === "CATALOG_NO_CANDIDATES_RESOLVED") {
      emptyDisclaimer = `No ${formatNoun} matched your description with sufficient confidence. Try describing different story elements, mood keywords, or searching directly by title.`;
    } else if (diagnosticStage === "GEMINI_LOCATION_UNSUPPORTED") {
      emptyDisclaimer = `AI discovery is temporarily unavailable in this region. Story and mood searches require AI assistance; try a direct ${contentType === "MOVIE" ? "movie" : "show"} title or genre keyword.`;
    } else if (geminiTimedOut) {
      emptyDisclaimer = `AI discovery reached the time limit. Story and mood searches require AI assistance; try a direct ${contentType === "MOVIE" ? "movie" : "show"} title or genre keyword.`;
    } else if (diagnosticStage === "GEMINI_QUOTA_EXCEEDED") {
      emptyDisclaimer = `AI discovery is currently at capacity. Story and mood searches require AI assistance; try a direct ${contentType === "MOVIE" ? "movie" : "show"} title or genre keyword.`;
    } else {
      emptyDisclaimer = `AI discovery is temporarily unavailable. Story and mood searches require AI assistance; try searching with a direct ${contentType === "MOVIE" ? "movie" : "show"} title or genre keyword.`;
    }
  } else {
    emptyDisclaimer = geminiTimedOut
      ? (contentType === "MOVIE" ? "AI request reached time limit and no matching movies were found in the catalog." : "AI request reached time limit and no matching shows were found in TVmaze catalog.")
      : diagnosticStage === "GEMINI_LOCATION_UNSUPPORTED"
        ? "AI discovery is temporarily unavailable, and no direct catalog matches were found. Try a shorter title or genre keyword."
        : (contentType === "MOVIE" ? "No matching movies found in the catalog." : "No matching shows found in TVmaze catalog.");
  }

  const hasCatalogActivity = tvmazeResolver.getCallCount() > 0 || wikidataResolver.getCallCount() > 0;
  const diag = buildDiagnostic("EMPTY", geminiFailed || hasCatalogActivity || !isDirectQuery, 0);
  logDiscoveryDiagnostic(diag);

  const response: DiscoverResponse = {
    mode: "EMPTY",
    query: trimmedQuery,
    resolvedCount: 0,
    items: [],
    disclaimer: emptyDisclaimer,
    fallbackUsed: geminiFailed || hasCatalogActivity || !isDirectQuery,
    diagnostic: diag
  };

  return response;
}
