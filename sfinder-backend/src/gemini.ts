import { Candidate, Category, ContentType } from "./types";

export function redactKey(text: string, key?: string): string {
  let sanitized = text.replace(/key=[a-zA-Z0-9_\-]+/gi, "key=[REDACTED]");
  if (key && key.trim().length > 0) {
    sanitized = sanitized.split(key).join("[REDACTED]");
  }
  return sanitized;
}

export class GeminiQuotaExceededError extends Error {
  constructor(message = "Gemini API rate limit or daily quota reached (HTTP 429)") {
    super(message);
    this.name = "GeminiQuotaExceededError";
  }
}

export class GeminiTimeoutError extends Error {
  constructor(message = "Gemini API request timed out") {
    super(message);
    this.name = "GeminiTimeoutError";
  }
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorStatus?: string,
    public errorCode?: number
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

const CANDIDATE_RESPONSE_SCHEMA = {
  type: "ARRAY",
  description: "List of real, existing movies or television series matching the user story query",
  items: {
    type: "OBJECT",
    properties: {
      canonicalTitle: {
        type: "STRING",
        description: "Primary international or standard English title of the show"
      },
      originalTitle: {
        type: "STRING",
        description: "Native title in original alphabet/script if distinct"
      },
      approximateYear: {
        type: "INTEGER",
        description: "Release year of the first season"
      },
      expectedMediaType: {
        type: "STRING",
        enum: ["TV_SERIES", "KDRAMA", "TURKISH_DRAMA", "ANIME", "WEB_SERIES", "MOVIE"],
        description: "Broad category of the show or movie"
      },
      confidenceScore: {
        type: "NUMBER",
        description: "Estimated relevance confidence between 0.0 and 1.0 that this show matches the requested premise"
      },
      matchReason: {
        type: "STRING",
        description: "Brief match explanation (max 80 chars) of how this show matches the described story or tropes"
      }
    },
    required: ["canonicalTitle", "expectedMediaType", "matchReason"]
  }
};

export interface GeminiDiagnosticInfo {
  durationMs: number;
  configuredModel: string;
  httpStatus?: number;
  errorCode?: number;
  errorStatus?: string;
  errorMessage?: string;
  finishReason?: string;
  hasThoughtParts: boolean;
  rawCandidatesCount: number;
  acceptedCandidatesCount: number;
  parseError?: string;
  retryAttempted?: boolean;
  retrySucceeded?: boolean;
}

export async function requestGeminiCandidates(options: {
  apiKey: string;
  query: string;
  category?: Category;
  contentType?: ContentType;
  genre?: string;
  country?: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxCandidates: number;
  fetchFn?: typeof fetch;
  retryDelayMs?: number;
  onDiagnostic?: (info: GeminiDiagnosticInfo) => void;
}): Promise<Candidate[]> {
  const overallStartTime = Date.now();
  const {
    apiKey,
    query,
    category = "ALL",
    contentType,
    genre,
    country,
    model,
    baseUrl,
    timeoutMs,
    maxCandidates,
    fetchFn: customFetch,
    retryDelayMs,
    onDiagnostic
  } = options;

  const safeFetch = customFetch 
    ? (input: RequestInfo | URL, init?: RequestInit) => customFetch(input, init) 
    : (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init);

  if (!apiKey || apiKey.trim() === "") {
    throw new GeminiError("Gemini API key is not configured on the server");
  }

  const endpoint = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const effectiveContentType = contentType || (category === "MOVIES" ? "MOVIE" : "ALL");

  let contentTypeConstraint = "";
  if (effectiveContentType === "SERIES") {
    contentTypeConstraint = "STRICT CONTENT-TYPE CONSTRAINT: The user has selected the 'Series' filter (episodic television). You MUST ONLY return television series, episodic dramas, web series, or anime series. Even if the user's search text mentions 'movie' or 'film', you MUST NOT return movies or standalone feature films. Feature films are strictly forbidden. Set expectedMediaType to one of TV_SERIES, KDRAMA, TURKISH_DRAMA, ANIME, or WEB_SERIES.";
  } else if (effectiveContentType === "MOVIE" || effectiveContentType === "MOVIES") {
    contentTypeConstraint = "STRICT CONTENT-TYPE CONSTRAINT: The user has selected the 'Movies' filter (standalone feature films). You MUST ONLY return real, existing feature films / movies. Even if the user's search text mentions 'series' or 'show', you MUST NOT return episodic television series. Television series are strictly forbidden. Set expectedMediaType to MOVIE.";
  } else {
    contentTypeConstraint = "The user has selected 'All' content types. You may return both feature films (expectedMediaType: MOVIE) and television series (expectedMediaType: TV_SERIES, KDRAMA, TURKISH_DRAMA, ANIME, WEB_SERIES) that best match the query.";
  }

  let genreConstraint = "";
  if (genre && genre !== "ANY" && genre.trim().length > 0) {
    genreConstraint = `STRICT GENRE CONSTRAINT: The user has specified the genre '${genre.trim()}'. You MUST ONLY return titles that genuinely belong to this genre.`;
  }

  let countryConstraint = "";
  if (country && country !== "ANY" && country.trim().length > 0) {
    countryConstraint = `STRICT COUNTRY CONSTRAINT: The user has specified the country/region '${country.trim()}'. You MUST ONLY return titles that genuinely originate from this country/region.`;
  }

  const categoryConstraint = category && category !== "ALL" && !contentType
    ? `User specifically requested the category '${category}'. Prioritize real shows matching this category if suitable.`
    : (effectiveContentType === "ALL" ? `User has not restricted the category. You may recommend TV Series, K-Dramas, Turkish Dramas, Web Series, or Anime.` : "");

  const promptConstraints = [contentTypeConstraint, categoryConstraint, genreConstraint, countryConstraint]
    .filter(Boolean)
    .join("\n");

  const targetMediumDesc = effectiveContentType === "MOVIE" || effectiveContentType === "MOVIES"
    ? "feature films / movies"
    : effectiveContentType === "SERIES"
    ? "television series, Korean dramas, Turkish dramas, or anime series"
    : "feature films or television series (including K-dramas, anime, web series)";

  const prompt = `You are S Finder's entertainment discovery engine.
Analyze the following user search query:
"${query.trim()}"

${promptConstraints ? `${promptConstraints}\n\n` : ""}Identify up to ${maxCandidates} real, officially released ${targetMediumDesc} that genuinely match the described plot tropes, character dynamics, relationship conflicts, or remembered scenes.
Prioritize narrative diversity across distinct titles, eras, and styles; do not return duplicate adaptations, near-identical remakes, or different seasons of the same title.
Never invent fictional shows, movies, or nonexistent titles.
Keep matchReason concise (under 80 characters).
Output strict JSON conforming to the schema.`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1200,
      responseMimeType: "application/json",
      responseSchema: CANDIDATE_RESPONSE_SCHEMA,
      thinkingConfig: {
        thinkingLevel: "MINIMAL"
      }
    }
  };

  async function performAttempt(remainingMs: number): Promise<{
    response?: Response;
    aborted?: boolean;
    networkError?: any;
  }> {
    if (remainingMs <= 0) {
      return { aborted: true };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);

    try {
      const response = await safeFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timer);
      return { response };
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === "AbortError" || controller.signal.aborted) {
        return { aborted: true };
      }
      return { networkError: err };
    }
  }

  async function parseErrorPayload(response: Response): Promise<{
    errorStatus?: string;
    errorCode?: number;
    errorMessage?: string;
  }> {
    let errorStatus: string | undefined;
    let errorCode: number | undefined;
    let errorMessage: string | undefined;

    try {
      const errorJson = await response.json() as any;
      if (errorJson && typeof errorJson === "object" && errorJson.error) {
        const err = errorJson.error;
        if (typeof err.status === "string" && err.status.trim() !== "") {
          errorStatus = err.status.trim();
        }
        if (typeof err.code === "number") {
          errorCode = err.code;
        }
        if (typeof err.message === "string" && err.message.trim() !== "") {
          let safeMsg = redactKey(err.message, apiKey);
          if (query && query.trim().length > 0) {
            safeMsg = safeMsg.split(query.trim()).join("[QUERY]");
          }
          safeMsg = safeMsg.replace(/https?:\/\/[^\s]+/gi, "[URL]");
          errorMessage = safeMsg.substring(0, 120).trim();
        }
      }
    } catch {
      errorStatus = undefined;
      errorCode = undefined;
      errorMessage = undefined;
    }

    return { errorStatus, errorCode, errorMessage };
  }

  function parseCandidatesFromData(data: any): {
    validated: Candidate[];
    finishReason?: string;
    hasThoughtParts: boolean;
    rawCount: number;
    parseError?: string;
  } {
    const parts = data?.candidates?.[0]?.content?.parts;
    const finishReason = data?.candidates?.[0]?.finishReason;
    const hasThoughtParts = Array.isArray(parts) && parts.some((p: any) => p?.thought === true);

    let candidatesRawText: string | undefined;

    if (Array.isArray(parts)) {
      const nonThoughtPart = parts.find((p: any) => !p.thought && typeof p.text === "string");
      if (nonThoughtPart) {
        candidatesRawText = nonThoughtPart.text;
      } else {
        const textPart = parts.find((p: any) => typeof p.text === "string");
        if (textPart) {
          candidatesRawText = textPart.text;
        }
      }
    }

    let cleanedText = candidatesRawText ? candidatesRawText.trim() : "";
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }

    let parsed: any;
    let parseError: string | undefined;
    if (cleanedText) {
      try {
        parsed = JSON.parse(cleanedText);
      } catch (err: any) {
        parseError = err?.message || "Failed to parse candidate JSON";
      }
    } else {
      parseError = "No text candidate part returned in response";
    }

    if (!Array.isArray(parsed)) {
      return {
        validated: [],
        finishReason,
        hasThoughtParts,
        rawCount: 0,
        parseError
      };
    }

    const validated: Candidate[] = [];
    for (const item of parsed) {
      if (typeof item.canonicalTitle === "string" && item.canonicalTitle.trim() !== "") {
        validated.push({
          canonicalTitle: item.canonicalTitle.trim(),
          originalTitle: typeof item.originalTitle === "string" ? item.originalTitle.trim() : undefined,
          approximateYear: typeof item.approximateYear === "number" ? item.approximateYear : undefined,
          expectedMediaType: item.expectedMediaType || "TV_SERIES",
          confidenceScore: typeof item.confidenceScore === "number" ? item.confidenceScore : 0.5,
          matchReason: typeof item.matchReason === "string" ? item.matchReason.trim() : "Matches query context",
          searchKeywords: Array.isArray(item.searchKeywords) 
            ? item.searchKeywords.filter((k: any) => typeof k === "string") 
            : undefined
        });
      }
      if (validated.length >= maxCandidates) break;
    }

    return {
      validated,
      finishReason,
      hasThoughtParts,
      rawCount: parsed.length
    };
  }

  // --- ATTEMPT 1 ---
  const attempt1 = await performAttempt(timeoutMs);

  if (attempt1.aborted) {
    throw new GeminiTimeoutError("Gemini API request timed out");
  }

  if (attempt1.networkError) {
    const safeMsg = redactKey(attempt1.networkError?.message || "Failed to communicate with Gemini API", apiKey);
    throw new GeminiError(safeMsg);
  }

  const resp1 = attempt1.response!;
  if (resp1.ok) {
    const data = await resp1.json() as any;
    const parsedResult = parseCandidatesFromData(data);
    if (onDiagnostic) {
      onDiagnostic({
        durationMs: Date.now() - overallStartTime,
        configuredModel: model,
        httpStatus: resp1.status,
        finishReason: parsedResult.finishReason,
        hasThoughtParts: parsedResult.hasThoughtParts,
        rawCandidatesCount: parsedResult.rawCount,
        acceptedCandidatesCount: parsedResult.validated.length,
        parseError: parsedResult.parseError,
        retryAttempted: false,
        retrySucceeded: false
      });
    }
    return parsedResult.validated;
  }

  // Attempt 1 returned an error status
  const err1 = await parseErrorPayload(resp1);
  const is503 = resp1.status === 503 || err1.errorStatus === "UNAVAILABLE";

  // If not 503: do not retry (e.g. 400 location error, 403, 404, 429 quota)
  if (!is503) {
    if (onDiagnostic) {
      onDiagnostic({
        durationMs: Date.now() - overallStartTime,
        configuredModel: model,
        httpStatus: resp1.status,
        errorCode: err1.errorCode ?? resp1.status,
        errorStatus: err1.errorStatus,
        errorMessage: err1.errorMessage,
        hasThoughtParts: false,
        rawCandidatesCount: 0,
        acceptedCandidatesCount: 0,
        retryAttempted: false,
        retrySucceeded: false
      });
    }

    if (resp1.status === 429 || err1.errorStatus === "RESOURCE_EXHAUSTED") {
      throw new GeminiQuotaExceededError(err1.errorMessage || "Gemini API rate limit or daily quota reached (HTTP 429)");
    }

    throw new GeminiError(
      err1.errorMessage || `Gemini upstream returned HTTP ${resp1.status}`,
      resp1.status,
      err1.errorStatus,
      err1.errorCode
    );
  }

  // --- ATTEMPT 1 was HTTP 503 UNAVAILABLE ---
  // Evaluate retry feasibility within overall budget
  const delayMs = retryDelayMs !== undefined 
    ? retryDelayMs 
    : (1000 + Math.floor(Math.random() * 200));

  const elapsedBeforeRetry = Date.now() - overallStartTime;
  const remainingTotalMs = timeoutMs - elapsedBeforeRetry;
  const minRequiredForRetry = delayMs + 1000; // delay plus minimum 1000 ms execution window

  if (remainingTotalMs < minRequiredForRetry) {
    // Insufficient deadline remaining within the overall budget: do not retry
    if (onDiagnostic) {
      onDiagnostic({
        durationMs: Date.now() - overallStartTime,
        configuredModel: model,
        httpStatus: resp1.status,
        errorCode: err1.errorCode ?? resp1.status,
        errorStatus: err1.errorStatus,
        errorMessage: err1.errorMessage,
        hasThoughtParts: false,
        rawCandidatesCount: 0,
        acceptedCandidatesCount: 0,
        retryAttempted: false,
        retrySucceeded: false
      });
    }

    throw new GeminiError(
      err1.errorMessage || "Gemini service temporarily unavailable (HTTP 503)",
      resp1.status,
      err1.errorStatus,
      err1.errorCode
    );
  }

  // Wait backoff delay with jitter
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  // Re-check remaining time for Attempt 2
  const remainingForAttempt2 = timeoutMs - (Date.now() - overallStartTime);
  if (remainingForAttempt2 <= 500) {
    if (onDiagnostic) {
      onDiagnostic({
        durationMs: Date.now() - overallStartTime,
        configuredModel: model,
        httpStatus: resp1.status,
        errorCode: err1.errorCode ?? resp1.status,
        errorStatus: err1.errorStatus,
        errorMessage: err1.errorMessage,
        hasThoughtParts: false,
        rawCandidatesCount: 0,
        acceptedCandidatesCount: 0,
        retryAttempted: false,
        retrySucceeded: false
      });
    }

    throw new GeminiError(
      err1.errorMessage || "Gemini service temporarily unavailable (HTTP 503)",
      resp1.status,
      err1.errorStatus,
      err1.errorCode
    );
  }

  // --- ATTEMPT 2 (Single Bounded Retry) ---
  const attempt2 = await performAttempt(remainingForAttempt2);

  if (attempt2.aborted) {
    if (onDiagnostic) {
      onDiagnostic({
        durationMs: Date.now() - overallStartTime,
        configuredModel: model,
        httpStatus: 503,
        errorStatus: "UNAVAILABLE",
        errorCode: 503,
        errorMessage: "Overall deadline expired during retry",
        hasThoughtParts: false,
        rawCandidatesCount: 0,
        acceptedCandidatesCount: 0,
        retryAttempted: true,
        retrySucceeded: false
      });
    }
    throw new GeminiTimeoutError("Gemini API request timed out during retry");
  }

  if (attempt2.networkError) {
    const safeMsg = redactKey(attempt2.networkError?.message || "Failed during retry", apiKey);
    if (onDiagnostic) {
      onDiagnostic({
        durationMs: Date.now() - overallStartTime,
        configuredModel: model,
        hasThoughtParts: false,
        rawCandidatesCount: 0,
        acceptedCandidatesCount: 0,
        retryAttempted: true,
        retrySucceeded: false
      });
    }
    throw new GeminiError(safeMsg);
  }

  const resp2 = attempt2.response!;
  if (resp2.ok) {
    // Attempt 2 SUCCEEDED!
    const data2 = await resp2.json() as any;
    const parsedResult2 = parseCandidatesFromData(data2);
    if (onDiagnostic) {
      onDiagnostic({
        durationMs: Date.now() - overallStartTime,
        configuredModel: model,
        httpStatus: resp2.status,
        finishReason: parsedResult2.finishReason,
        hasThoughtParts: parsedResult2.hasThoughtParts,
        rawCandidatesCount: parsedResult2.rawCount,
        acceptedCandidatesCount: parsedResult2.validated.length,
        parseError: parsedResult2.parseError,
        retryAttempted: true,
        retrySucceeded: true
      });
    }
    return parsedResult2.validated;
  }

  // Attempt 2 ALSO failed
  const err2 = await parseErrorPayload(resp2);
  if (onDiagnostic) {
    onDiagnostic({
      durationMs: Date.now() - overallStartTime,
      configuredModel: model,
      httpStatus: resp2.status,
      errorCode: err2.errorCode ?? resp2.status,
      errorStatus: err2.errorStatus,
      errorMessage: err2.errorMessage,
      hasThoughtParts: false,
      rawCandidatesCount: 0,
      acceptedCandidatesCount: 0,
      retryAttempted: true,
      retrySucceeded: false
    });
  }

  if (resp2.status === 429 || err2.errorStatus === "RESOURCE_EXHAUSTED") {
    throw new GeminiQuotaExceededError(err2.errorMessage || "Gemini API rate limit or daily quota reached (HTTP 429)");
  }

  throw new GeminiError(
    err2.errorMessage || `Gemini upstream returned HTTP ${resp2.status} on retry`,
    resp2.status,
    err2.errorStatus,
    err2.errorCode
  );
}
