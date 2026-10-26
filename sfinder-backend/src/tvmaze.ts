import { Candidate, CandidateRejection, TVMazeSearchResult, TVMazeShow, VerifiedEntertainmentItem } from "./types";

export class TvMazeBudgetExceededError extends Error {
  constructor(message = "Exceeded maximum allowed TVmaze API requests budget") {
    super(message);
    this.name = "TvMazeBudgetExceededError";
  }
}

export class TvMazeError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "TvMazeError";
  }
}

export interface CandidateFilters {
  genre?: string;
  country?: string;
}

export function matchesGenreFilter(show: TVMazeShow, requestedGenre?: string): boolean {
  if (!requestedGenre || requestedGenre === "ANY" || requestedGenre.trim() === "") {
    return true;
  }
  const target = requestedGenre.trim().toLowerCase();
  const showGenres = (show.genres || []).map(g => g.toLowerCase());

  // Handle Anime / Animation
  if (target.includes("anime") || target.includes("animation")) {
    if (showGenres.includes("anime") || showGenres.includes("animation")) return true;
    if (show.language?.toLowerCase() === "japanese" && show.type?.toLowerCase() === "animation") return true;
  }

  // Handle Sci-Fi & Fantasy
  if (target.includes("sci-fi") || target.includes("science fiction") || target.includes("fantasy")) {
    if (showGenres.some(g => g.includes("sci-fi") || g.includes("science-fiction") || g.includes("fantasy"))) return true;
  }

  // Handle Mystery & Crime
  if (target.includes("crime") || target.includes("mystery")) {
    if (showGenres.some(g => g.includes("crime") || g.includes("mystery"))) return true;
  }

  // Direct genre containment / equality
  for (const g of showGenres) {
    if (g === target || g.includes(target) || target.includes(g)) {
      return true;
    }
  }

  // Check show type (e.g. Documentary)
  if (show.type?.toLowerCase().includes(target)) {
    return true;
  }

  return false;
}

/**
 * Normalizes country strings for deterministic exact matching.
 * Converts to lowercase, strips diacritics and non-alphanumeric characters, and collapses whitespace.
 */
export function normalizeCountryString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Explicit, reviewed canonical ISO 3166-1 alpha-2 code mapping for official country names,
 * approved naming variations, and international catalog aliases.
 */
export const COUNTRY_ALIAS_MAP = new Map<string, string>([
  // South Korea
  ["kr", "KR"],
  ["south korea", "KR"],
  ["korea", "KR"],
  ["korea republic of", "KR"],
  ["republic of korea", "KR"],
  ["korea south", "KR"],

  // North Korea
  ["kp", "KP"],
  ["north korea", "KP"],
  ["korea democratic peoples republic of", "KP"],
  ["korea democratic people s republic of", "KP"],
  ["democratic peoples republic of korea", "KP"],
  ["democratic people s republic of korea", "KP"],
  ["dprk", "KP"],

  // United States
  ["us", "US"],
  ["usa", "US"],
  ["united states", "US"],
  ["united states of america", "US"],

  // United Kingdom
  ["gb", "GB"],
  ["uk", "GB"],
  ["united kingdom", "GB"],
  ["great britain", "GB"],
  ["britain", "GB"],
  ["united kingdom of great britain and northern ireland", "GB"],

  // Turkey
  ["tr", "TR"],
  ["turkey", "TR"],
  ["turkiye", "TR"],
  ["republic of turkiye", "TR"],

  // Guinea
  ["gn", "GN"],
  ["guinea", "GN"],
  ["republic of guinea", "GN"],

  // Equatorial Guinea
  ["gq", "GQ"],
  ["equatorial guinea", "GQ"],
  ["republic of equatorial guinea", "GQ"],

  // Guinea-Bissau
  ["gw", "GW"],
  ["guinea bissau", "GW"],
  ["republic of guinea bissau", "GW"],

  // Papua New Guinea
  ["pg", "PG"],
  ["papua new guinea", "PG"],

  // Congo (Republic of the Congo)
  ["cg", "CG"],
  ["congo", "CG"],
  ["republic of the congo", "CG"],
  ["congo republic", "CG"],
  ["congo brazzaville", "CG"],

  // Democratic Republic of the Congo
  ["cd", "CD"],
  ["democratic republic of the congo", "CD"],
  ["dr congo", "CD"],
  ["drc", "CD"],
  ["congo democratic republic of the", "CD"],
  ["congo kinshasa", "CD"],

  // Niger vs Nigeria
  ["ne", "NE"],
  ["niger", "NE"],
  ["republic of niger", "NE"],
  ["ng", "NG"],
  ["nigeria", "NG"],
  ["federal republic of nigeria", "NG"],

  // Czech Republic
  ["cz", "CZ"],
  ["czech republic", "CZ"],
  ["czechia", "CZ"],

  // Taiwan
  ["tw", "TW"],
  ["taiwan", "TW"],
  ["taiwan province of china", "TW"],

  // Hong Kong
  ["hk", "HK"],
  ["hong kong", "HK"],
  ["hong kong sar", "HK"],

  // China
  ["cn", "CN"],
  ["china", "CN"],
  ["peoples republic of china", "CN"],
  ["people s republic of china", "CN"],

  // Germany
  ["de", "DE"],
  ["germany", "DE"],
  ["deutschland", "DE"],
  ["federal republic of germany", "DE"],

  // France
  ["fr", "FR"],
  ["france", "FR"],
  ["french republic", "FR"],

  // Spain
  ["es", "ES"],
  ["spain", "ES"],
  ["espana", "ES"],
  ["kingdom of spain", "ES"],

  // Canada
  ["ca", "CA"],
  ["canada", "CA"],

  // Australia
  ["au", "AU"],
  ["australia", "AU"],

  // Brazil
  ["br", "BR"],
  ["brazil", "BR"],
  ["brasil", "BR"],

  // Mexico
  ["mx", "MX"],
  ["mexico", "MX"],
  ["united mexican states", "MX"],

  // India
  ["in", "IN"],
  ["india", "IN"],
  ["republic of india", "IN"],

  // Japan
  ["jp", "JP"],
  ["japan", "JP"],
  ["nippon", "JP"],
  ["nihon", "JP"],

  // Italy
  ["it", "IT"],
  ["italy", "IT"],
  ["italia", "IT"],
  ["italian republic", "IT"],

  // Netherlands
  ["nl", "NL"],
  ["netherlands", "NL"],
  ["the netherlands", "NL"],
  ["holland", "NL"],

  // Ireland
  ["ie", "IE"],
  ["ireland", "IE"],
  ["republic of ireland", "IE"],

  // Norway
  ["no", "NO"],
  ["norway", "NO"],
  ["norge", "NO"],

  // Sweden
  ["se", "SE"],
  ["sweden", "SE"],
  ["sverige", "SE"],

  // Denmark
  ["dk", "DK"],
  ["denmark", "DK"],
  ["danmark", "DK"],

  // Finland
  ["fi", "FI"],
  ["finland", "FI"],
  ["suomi", "FI"],

  // Poland
  ["pl", "PL"],
  ["poland", "PL"],
  ["polska", "PL"],

  // Russia
  ["ru", "RU"],
  ["russia", "RU"],
  ["russian federation", "RU"],

  // South Africa
  ["za", "ZA"],
  ["south africa", "ZA"],

  // New Zealand
  ["nz", "NZ"],
  ["new zealand", "NZ"],
  ["aotearoa", "NZ"]
]);

export function matchesCountryFilter(show: TVMazeShow, requestedCountry?: string): boolean {
  if (!requestedCountry || requestedCountry === "ANY" || requestedCountry.trim() === "") {
    return true;
  }

  // Explicit country filter requires genuine verified catalog country/origin evidence.
  // Missing country metadata cannot falsely satisfy an explicit country filter.
  // Language, title, synopsis, AI explanation, or user text is strictly NOT used as country evidence.
  const network = show.network?.country;
  const webChannel = show.webChannel?.country;

  if (!network && !webChannel) {
    return false;
  }

  const targetNorm = normalizeCountryString(requestedCountry);
  if (!targetNorm) return true;

  // Resolve target canonical ISO code if available
  const targetCode = COUNTRY_ALIAS_MAP.get(targetNorm) || (targetNorm.length === 2 ? targetNorm.toUpperCase() : undefined);

  // Check each verified catalog origin source
  const origins = [network, webChannel].filter(Boolean);

  for (const origin of origins) {
    if (!origin) continue;

    const catNameNorm = origin.name ? normalizeCountryString(origin.name) : "";
    const catCode = origin.code ? origin.code.trim().toUpperCase() : "";
    const catMappedCode = catCode || (catNameNorm ? COUNTRY_ALIAS_MAP.get(catNameNorm) : undefined);

    // 1. Exact ISO code equality (never substring matching)
    if (targetCode && catMappedCode && targetCode === catMappedCode) {
      return true;
    }

    // 2. Exact normalized canonical country name equality
    if (catNameNorm && targetNorm === catNameNorm) {
      return true;
    }

    // 3. Exact alias match via alias map
    if (catNameNorm) {
      const aliasFromCat = COUNTRY_ALIAS_MAP.get(catNameNorm);
      if (aliasFromCat && targetCode && aliasFromCat === targetCode) {
        return true;
      }
    }
  }

  return false;
}

export class TvMazeResolver {
  private callCount = 0;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly maxAllowedCalls: number = 4,
    private readonly attributionLabel: string = "Data provided by TVmaze (CC BY-SA 4.0)",
    fetchFn?: typeof fetch
  ) {
    // Wrap in an arrow function to prevent Cloudflare V8 'Illegal invocation' this-binding errors
    this.fetchFn = fetchFn 
      ? (input, init) => fetchFn(input, init) 
      : (input, init) => globalThis.fetch(input, init);
  }

  public getCallCount(): number {
    return this.callCount;
  }

  /**
   * Executes a direct search query against TVmaze.
   * Enforces the strict call limit budget.
   */
  public async searchShows(query: string): Promise<TVMazeSearchResult[]> {
    if (this.callCount >= this.maxAllowedCalls) {
      throw new TvMazeBudgetExceededError(
        `TVmaze API budget of ${this.maxAllowedCalls} calls reached; skipping call for "${query}"`
      );
    }

    const trimmed = query.trim();
    if (!trimmed) return [];

    this.callCount++;

    const endpoint = `${this.baseUrl}/search/shows?q=${encodeURIComponent(trimmed)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(endpoint, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "SFinder-Backend/1.0"
        },
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new TvMazeError(`TVmaze returned HTTP ${response.status}`, response.status);
      }

      const results = (await response.json()) as TVMazeSearchResult[];
      return Array.isArray(results) ? results : [];
    } catch (error: any) {
      clearTimeout(timer);
      if (error instanceof TvMazeBudgetExceededError || error instanceof TvMazeError) {
        throw error;
      }
      if (error?.name === "AbortError") {
        throw new TvMazeError("TVmaze request timed out");
      }
      throw new TvMazeError(error?.message || "Failed to query TVmaze API");
    }
  }

  /**
   * Resolves a list of Gemini candidates against TVmaze.
   * Performs bounded concurrent requests (concurrency capped at at most 3),
   * strictly respecting the maxAllowedCalls budget and preserving candidate priority.
   */
  public async resolveCandidates(
    candidates: Candidate[],
    onEvaluation?: (rejection: CandidateRejection) => void,
    filters?: CandidateFilters
  ): Promise<VerifiedEntertainmentItem[]> {
    const verifiedItems: VerifiedEntertainmentItem[] = [];
    const seenShowIds = new Set<number>();

    // Process up to maxAllowedCalls candidates
    const eligibleCandidates = candidates.slice(0, this.maxAllowedCalls);
    const excessCandidates = candidates.slice(this.maxAllowedCalls);

    for (const excess of excessCandidates) {
      if (onEvaluation) {
        onEvaluation({
          candidateTitle: excess.canonicalTitle,
          reason: "BUDGET_EXCEEDED"
        });
      }
    }

    // Process eligible candidates in bounded concurrent batches of at most 3
    const BATCH_SIZE = 3;
    for (let i = 0; i < eligibleCandidates.length; i += BATCH_SIZE) {
      const batch = eligibleCandidates.slice(i, i + BATCH_SIZE);
      const remainingBudget = this.maxAllowedCalls - this.callCount;
      if (remainingBudget <= 0) {
        for (const candidate of eligibleCandidates.slice(i)) {
          if (onEvaluation) {
            onEvaluation({
              candidateTitle: candidate.canonicalTitle,
              reason: "BUDGET_EXCEEDED"
            });
          }
        }
        break;
      }

      const activeBatch = batch.slice(0, remainingBudget);
      const budgetExceededInBatch = batch.slice(remainingBudget);
      for (const candidate of budgetExceededInBatch) {
        if (onEvaluation) {
          onEvaluation({
            candidateTitle: candidate.canonicalTitle,
            reason: "BUDGET_EXCEEDED"
          });
        }
      }

      // Dispatch activeBatch concurrently using Promise.allSettled
      const promises = activeBatch.map(async (candidate) => {
        try {
          const results = await this.searchShows(candidate.canonicalTitle);
          return { candidate, results, error: null };
        } catch (err) {
          return { candidate, results: null, error: err };
        }
      });

      const settled = await Promise.allSettled(promises);

      // Process batch results in deterministic candidate priority order
      for (const outcome of settled) {
        if (outcome.status === "rejected") continue;
        const { candidate, results, error } = outcome.value;

        if (error) {
          if (onEvaluation) {
            onEvaluation({
              candidateTitle: candidate.canonicalTitle,
              reason: error instanceof TvMazeBudgetExceededError ? "BUDGET_EXCEEDED" : "LOOKUP_ERROR"
            });
          }
          continue;
        }

        if (!results || results.length === 0) {
          if (onEvaluation) {
            onEvaluation({
              candidateTitle: candidate.canonicalTitle,
              reason: "NO_TVMAZE_RESULTS",
              highestScore: 0
            });
          }
          continue;
        }

        const matchEval = this.evaluateCandidateMatch(candidate, results, filters);
        if (matchEval.bestShow && matchEval.highestScore >= 75 && !seenShowIds.has(matchEval.bestShow.id)) {
          seenShowIds.add(matchEval.bestShow.id);
          verifiedItems.push(this.mapShowToVerifiedItem(matchEval.bestShow, candidate.matchReason));
        } else {
          if (onEvaluation) {
            onEvaluation({
              candidateTitle: candidate.canonicalTitle,
              reason: matchEval.filterMismatch ? "FILTER_MISMATCH" : "SCORE_BELOW_THRESHOLD",
              highestScore: matchEval.highestScore
            });
          }
        }
      }
    }

    return verifiedItems;
  }

  /**
   * Evaluates and scores search results against candidate metadata.
   */
  public evaluateCandidateMatch(
    candidate: Candidate,
    results: TVMazeSearchResult[],
    filters?: CandidateFilters
  ): {
    bestShow: TVMazeShow | null;
    highestScore: number;
    filterMismatch?: boolean;
  } {
    if (!results || results.length === 0) return { bestShow: null, highestScore: 0 };

    let highestScore = 0;
    let bestShow: TVMazeShow | null = null;
    let filterMismatch = false;

    const candTitleNorm = normalizeTitle(candidate.canonicalTitle);
    const candOrigTitleNorm = candidate.originalTitle ? normalizeTitle(candidate.originalTitle) : "";

    for (const item of results) {
      const show = item.show;
      if (!show || !show.name) continue;

      let score = 0;
      const showNameNorm = normalizeTitle(show.name);

      // Title matching: exact normalized match is heavily weighted (55 pts)
      const candTitleCompact = candTitleNorm.replace(/\s+/g, "");
      const showNameCompact = showNameNorm.replace(/\s+/g, "");
      const candOrigCompact = candOrigTitleNorm.replace(/\s+/g, "");

      if (
        showNameNorm === candTitleNorm ||
        (candOrigTitleNorm && showNameNorm === candOrigTitleNorm) ||
        (candTitleCompact.length > 2 && showNameCompact === candTitleCompact) ||
        (candOrigCompact.length > 2 && showNameCompact === candOrigCompact)
      ) {
        score += 55;
      } else if (
        showNameNorm.includes(candTitleNorm) ||
        candTitleNorm.includes(showNameNorm) ||
        (candTitleCompact.length > 3 && showNameCompact.includes(candTitleCompact))
      ) {
        score += 25;
      }

      // Year matching (within +/- 1 year)
      if (candidate.approximateYear && show.premiered) {
        const showYear = parseInt(show.premiered.substring(0, 4), 10);
        if (!isNaN(showYear)) {
          if (showYear === candidate.approximateYear) {
            score += 30;
          } else if (Math.abs(showYear - candidate.approximateYear) <= 1) {
            score += 20;
          }
        }
      }

      // Country / Language / Category correlation (20 pts)
      const isKorean = show.language?.toLowerCase() === "korean" || 
        show.network?.country?.code?.toUpperCase() === "KR";
      const isTurkish = show.language?.toLowerCase() === "turkish" || 
        show.network?.country?.code?.toUpperCase() === "TR";
      const isAnime = show.genres?.some(g => g.toLowerCase() === "anime") || 
        (show.language?.toLowerCase() === "japanese" && show.type?.toLowerCase() === "animation");
      const isWeb = show.webChannel != null;
      const isTvSeries = show.type?.toLowerCase() === "scripted" || show.type?.toLowerCase() === "reality" || !isAnime;

      if (candidate.expectedMediaType === "KDRAMA" && isKorean) score += 20;
      else if (candidate.expectedMediaType === "TURKISH_DRAMA" && isTurkish) score += 20;
      else if (candidate.expectedMediaType === "ANIME" && isAnime) score += 20;
      else if (candidate.expectedMediaType === "WEB_SERIES" && isWeb) score += 20;
      else if (candidate.expectedMediaType === "TV_SERIES" && isTvSeries) score += 20;

      // Filter verification (Genre & Country)
      const genrePass = matchesGenreFilter(show, filters?.genre);
      const countryPass = matchesCountryFilter(show, filters?.country);

      if (score > highestScore) {
        highestScore = score;
      }

      if (score >= 75) {
        if (genrePass && countryPass) {
          bestShow = show;
        } else {
          filterMismatch = true;
        }
      }
    }

    return { bestShow, highestScore, filterMismatch: !bestShow && filterMismatch };
  }

  /**
   * Scores search results against candidate metadata to resolve ambiguous titles.
   */
  public findBestMatch(candidate: Candidate, results: TVMazeSearchResult[], filters?: CandidateFilters): TVMazeShow | null {
    return this.evaluateCandidateMatch(candidate, results, filters).bestShow;
  }

  /**
   * Maps a confirmed TVmaze show to a VerifiedEntertainmentItem.
   * Separates verified catalog metadata from AI-generated match explanation.
   */
  public mapShowToVerifiedItem(show: TVMazeShow, matchExplanation: string): VerifiedEntertainmentItem {
    const isKorean = show.language?.toLowerCase() === "korean" || 
      show.network?.country?.code?.toUpperCase() === "KR";
    const isTurkish = show.language?.toLowerCase() === "turkish" || 
      show.network?.country?.code?.toUpperCase() === "TR";
    const isAnime = show.genres?.some(g => g.toLowerCase() === "anime") || 
      (show.language?.toLowerCase() === "japanese" && show.type?.toLowerCase() === "animation");
    const isWeb = show.webChannel != null;

    let mediaType = "TV_SERIES";
    if (isKorean) mediaType = "KDRAMA";
    else if (isTurkish) mediaType = "TURKISH_DRAMA";
    else if (isAnime) mediaType = "ANIME";
    else if (isWeb) mediaType = "WEB_SERIES";

    const releaseYear = show.premiered ? parseInt(show.premiered.substring(0, 4), 10) : null;
    const country = show.network?.country?.name || show.network?.country?.code || null;
    const origin = [country, show.language].filter(Boolean).join(" • ") || null;

    const posterUrl = show.image?.medium || show.image?.original || null;
    const cleanSynopsis = show.summary ? stripHtml(show.summary) : "";

    return {
      id: `tvmaze-${show.id}`,
      title: show.name,
      originalTitle: null,
      releaseYear: isNaN(releaseYear as any) ? null : releaseYear,
      mediaType,
      genres: show.genres || [],
      originalLanguage: show.language,
      countryOfOrigin: origin,
      rating: show.rating?.average && show.rating.average > 0 ? show.rating.average : null,
      synopsis: cleanSynopsis,
      posterUrl,
      matchExplanation, // Clearly separated from verified catalog data
      catalogSource: this.attributionLabel
    };
  }
}

export function normalizeTitle(str: string): string {
  return str
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
