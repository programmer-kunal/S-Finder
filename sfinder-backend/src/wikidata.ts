import { Candidate, CandidateRejection, VerifiedEntertainmentItem } from "./types";
import { COUNTRY_ALIAS_MAP, normalizeCountryString } from "./tvmaze";

export class WikidataBudgetExceededError extends Error {
  constructor(message = "Exceeded maximum allowed Wikidata API requests budget") {
    super(message);
    this.name = "WikidataBudgetExceededError";
  }
}

export class WikidataError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "WikidataError";
  }
}

export interface WikidataMovieFilters {
  genre?: string;
  country?: string;
}

export interface WikidataEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, any[]>;
}

export interface WikidataSearchResultItem {
  id: string;
  label?: string;
  description?: string;
}

// Approved film instance QIDs on Wikidata
export const FILM_INSTANCE_QIDS = new Set<string>([
  "Q11424",    // film
  "Q24869",    // feature film
  "Q202866",   // animated film
  "Q20650540", // animated feature film
  "Q506240",   // television film
  "Q229390",   // 3D film
  "Q206555",   // short film
  "Q93204",    // documentary film
  "Q21191270", // anime film
  "Q701632",   // silent film
  "Q1059703",  // independent film
  "Q240682",   // direct-to-video film
  "Q2584109",  // cult film
  "Q29168811", // animated short film
  "Q2484376",  // thriller film
  "Q471839",   // science fiction film
  "Q130232",   // drama film
  "Q188473",   // action film
  "Q157443",   // comedy film
  "Q200092",   // horror film
  "Q842256",   // romance film
  "Q319221",   // adventure film
  "Q1755700",  // anime film
  "Q18011155"  // television film
]);

// Non-film entities that MUST be strictly excluded
export const EXCLUDED_INSTANCE_QIDS = new Set<string>([
  "Q5398426",  // television series
  "Q584666",   // television episode
  "Q125191",   // television season
  "Q11202857", // television miniseries
  "Q482994",   // audio album
  "Q7725634",  // literary work / book
  "Q7889",     // video game
  "Q5",        // human / person
  "Q4830453",  // business / enterprise
  "Q532",      // village
  "Q515"       // city
]);

// Mapping of Wikidata genre QIDs to standard English genre strings
export const WIKIDATA_GENRE_MAP: Record<string, string> = {
  "Q130232": "Drama",
  "Q188473": "Action",
  "Q157443": "Comedy",
  "Q2484376": "Thriller",
  "Q471839": "Science Fiction",
  "Q200092": "Horror",
  "Q842256": "Musical",
  "Q1054574": "Romance",
  "Q1200678": "Mystery",
  "Q319221": "Adventure",
  "Q93204": "Documentary",
  "Q202866": "Animation",
  "Q845607": "Family",
  "Q496523": "Crime",
  "Q20656232": "Action",
  "Q1572979": "Science Fiction",
  "Q182015": "Thriller",
  "Q658149": "History",
  "Q645928": "History",
  "Q21401869": "History",
  "Q220728": "War",
  "Q369747": "War",
  "Q17013749": "Biography",
  "Q20442589": "Biography",
  "Q170539": "Fantasy",
  "Q834111": "Fantasy",
  "Q859369": "Comedy-Drama",
  "Q2195524": "Crime Drama",
  "Q115590": "Film Noir",
  "Q1507663": "Neo-Noir",
  "Q2085381": "Post-Apocalyptic",
  "Q134148": "Western",
  "Q3738808": "Musical",
  "Q1347065": "Dark Comedy"
};

// Mapping of Wikidata country QIDs to canonical names and ISO alpha-2 codes
export const WIKIDATA_COUNTRY_MAP: Record<string, { name: string; code: string }> = {
  "Q30": { name: "United States", code: "US" },
  "Q145": { name: "United Kingdom", code: "GB" },
  "Q183": { name: "Germany", code: "DE" },
  "Q142": { name: "France", code: "FR" },
  "Q17": { name: "Japan", code: "JP" },
  "Q884": { name: "South Korea", code: "KR" },
  "Q668": { name: "India", code: "IN" },
  "Q408": { name: "Australia", code: "AU" },
  "Q155": { name: "Brazil", code: "BR" },
  "Q16": { name: "Canada", code: "CA" },
  "Q148": { name: "China", code: "CN" },
  "Q38": { name: "Italy", code: "IT" },
  "Q29": { name: "Spain", code: "ES" },
  "Q43": { name: "Turkey", code: "TR" },
  "Q96": { name: "Mexico", code: "MX" },
  "Q34": { name: "Sweden", code: "SE" },
  "Q20": { name: "Norway", code: "NO" },
  "Q35": { name: "Denmark", code: "DK" },
  "Q33": { name: "Finland", code: "FI" },
  "Q55": { name: "Netherlands", code: "NL" },
  "Q31": { name: "Belgium", code: "BE" },
  "Q39": { name: "Switzerland", code: "CH" },
  "Q40": { name: "Austria", code: "AT" },
  "Q27": { name: "Ireland", code: "IE" },
  "Q664": { name: "New Zealand", code: "NZ" },
  "Q36": { name: "Poland", code: "PL" },
  "Q159": { name: "Russia", code: "RU" },
  "Q1033": { name: "Nigeria", code: "NG" },
  "Q258": { name: "South Africa", code: "ZA" },
  "Q865": { name: "Taiwan", code: "TW" },
  "Q869": { name: "Thailand", code: "TH" },
  "Q252": { name: "Indonesia", code: "ID" },
  "Q801": { name: "Israel", code: "IL" },
  "Q79": { name: "Egypt", code: "EG" },
  "Q414": { name: "Argentina", code: "AR" },
  "Q298": { name: "Chile", code: "CL" },
  "Q739": { name: "Colombia", code: "CO" },
  "Q218": { name: "Romania", code: "RO" },
  "Q219": { name: "Bulgaria", code: "BG" },
  "Q213": { name: "Czech Republic", code: "CZ" },
  "Q214": { name: "Slovakia", code: "SK" },
  "Q28": { name: "Hungary", code: "HU" },
  "Q45": { name: "Portugal", code: "PT" },
  "Q41": { name: "Greece", code: "GR" },
  "Q211": { name: "Latvia", code: "LV" },
  "Q191": { name: "Estonia", code: "EE" },
  "Q37": { name: "Lithuania", code: "LT" },
  "Q184": { name: "Belarus", code: "BY" },
  "Q212": { name: "Ukraine", code: "UA" },
  "Q843": { name: "Pakistan", code: "PK" },
  "Q902": { name: "Bangladesh", code: "BD" },
  "Q854": { name: "Sri Lanka", code: "LK" },
  "Q881": { name: "Vietnam", code: "VN" },
  "Q833": { name: "Malaysia", code: "MY" },
  "Q334": { name: "Singapore", code: "SG" },
  "Q928": { name: "Philippines", code: "PH" },
  "Q1028": { name: "Morocco", code: "MA" },
  "Q794": { name: "Iran", code: "IR" },
  "Q851": { name: "Saudi Arabia", code: "SA" },
  "Q878": { name: "United Arab Emirates", code: "AE" }
};

export function isFilmInstance(entity: WikidataEntity): boolean {
  const p31Claims = entity.claims?.P31;
  if (!p31Claims || p31Claims.length === 0) {
    const desc = entity.descriptions?.en?.value?.toLowerCase() || "";
    return desc.includes("film") || desc.includes("movie");
  }

  const instanceQids = p31Claims
    .map(c => c.mainsnak?.datavalue?.value?.id)
    .filter((id): id is string => typeof id === "string");

  // Strictly reject television series, episodes, seasons, books, albums, games
  for (const qid of instanceQids) {
    if (EXCLUDED_INSTANCE_QIDS.has(qid)) {
      return false;
    }
  }

  // Check if at least one instanceOf claim is an approved film QID
  for (const qid of instanceQids) {
    if (FILM_INSTANCE_QIDS.has(qid)) {
      return true;
    }
  }

  // Fallback check on English description
  const desc = entity.descriptions?.en?.value?.toLowerCase() || "";
  return desc.includes("film") || desc.includes("movie");
}

export function extractWikidataReleaseYear(entity: WikidataEntity): number | null {
  const p577 = entity.claims?.P577;
  if (p577 && p577.length > 0) {
    for (const claim of p577) {
      const timeStr = claim.mainsnak?.datavalue?.value?.time;
      if (typeof timeStr === "string") {
        const match = /^[+-]?(\d{4})/.exec(timeStr);
        if (match) {
          const yr = parseInt(match[1], 10);
          if (!isNaN(yr) && yr > 1880 && yr < 2100) {
            return yr;
          }
        }
      }
    }
  }

  // Fallback to year in description, e.g. "2010 film directed by..."
  const desc = entity.descriptions?.en?.value || "";
  const match = /\b(19\d{2}|20\d{2})\b/.exec(desc);
  return match ? parseInt(match[1], 10) : null;
}

export function extractWikidataGenres(entity: WikidataEntity): string[] {
  const genres: string[] = [];
  const p136 = entity.claims?.P136;
  if (p136 && p136.length > 0) {
    for (const claim of p136) {
      const genreQid = claim.mainsnak?.datavalue?.value?.id;
      if (typeof genreQid === "string" && WIKIDATA_GENRE_MAP[genreQid]) {
        const mapped = WIKIDATA_GENRE_MAP[genreQid];
        if (!genres.includes(mapped)) {
          genres.push(mapped);
        }
      }
    }
  }

  // Infer genre from description if empty
  if (genres.length === 0) {
    const desc = (entity.descriptions?.en?.value || "").toLowerCase();
    if (desc.includes("animated") || desc.includes("anime")) genres.push("Animation");
    if (desc.includes("comedy")) genres.push("Comedy");
    if (desc.includes("drama")) genres.push("Drama");
    if (desc.includes("thriller")) genres.push("Thriller");
    if (desc.includes("horror")) genres.push("Horror");
    if (desc.includes("action")) genres.push("Action");
    if (desc.includes("documentary")) genres.push("Documentary");
    if (desc.includes("science fiction") || desc.includes("sci-fi")) genres.push("Science Fiction");
  }

  return genres;
}

export function extractWikidataCountries(entity: WikidataEntity): Array<{ name: string; code: string }> {
  const countries: Array<{ name: string; code: string }> = [];
  const p495 = entity.claims?.P495;
  if (p495 && p495.length > 0) {
    for (const claim of p495) {
      const countryQid = claim.mainsnak?.datavalue?.value?.id;
      if (typeof countryQid === "string" && WIKIDATA_COUNTRY_MAP[countryQid]) {
        const c = WIKIDATA_COUNTRY_MAP[countryQid];
        if (!countries.some(existing => existing.code === c.code)) {
          countries.push(c);
        }
      }
    }
  }
  return countries;
}

export function extractWikidataCountry(entity: WikidataEntity): { name: string; code: string } | null {
  const countries = extractWikidataCountries(entity);
  return countries.length > 0 ? countries[0] : null;
}

export function matchesMovieGenreFilter(genres: string[], requestedGenre?: string): boolean {
  if (!requestedGenre || requestedGenre === "ANY" || requestedGenre === "ALL" || requestedGenre.trim() === "") {
    return true;
  }
  const target = requestedGenre.trim().toLowerCase();
  const lowerGenres = genres.map(g => g.toLowerCase());

  if (target.includes("anime") || target.includes("animation")) {
    if (lowerGenres.some(g => g.includes("anime") || g.includes("animation"))) return true;
  }
  if (target.includes("sci-fi") || target.includes("science-fiction") || target.includes("science fiction") || target.includes("fantasy")) {
    if (lowerGenres.some(g => g.includes("sci-fi") || g.includes("science-fiction") || g.includes("science fiction") || g.includes("fantasy"))) return true;
  }
  if (target.includes("crime") || target.includes("mystery")) {
    if (lowerGenres.some(g => g.includes("crime") || g.includes("mystery"))) return true;
  }

  for (const g of lowerGenres) {
    if (g === target || g.includes(target) || target.includes(g)) {
      return true;
    }
  }
  return false;
}

export function matchesMovieCountryFilter(
  countriesInput: { name: string; code: string } | Array<{ name: string; code: string }> | null,
  requestedCountry?: string
): boolean {
  if (!requestedCountry || requestedCountry === "ANY" || requestedCountry === "ALL" || requestedCountry.trim() === "") {
    return true;
  }
  if (!countriesInput) {
    // Missing country metadata is never assumed
    return false;
  }

  const countries = Array.isArray(countriesInput) ? countriesInput : [countriesInput];
  if (countries.length === 0 || countries.every(c => !c.name && !c.code)) {
    return false;
  }

  const rawTarget = requestedCountry.trim();
  const normTarget = normalizeCountryString(rawTarget);
  const targetIso = COUNTRY_ALIAS_MAP.get(normTarget) || (rawTarget.length === 2 ? rawTarget.toUpperCase() : undefined);

  for (const country of countries) {
    const countryCode = country.code ? country.code.trim().toUpperCase() : undefined;
    const countryName = country.name ? normalizeCountryString(country.name) : undefined;
    const countryNameIso = countryName ? COUNTRY_ALIAS_MAP.get(countryName) : undefined;

    // 1. Exact ISO code match
    if (targetIso && countryCode && targetIso === countryCode) {
      return true;
    }
    if (targetIso && countryNameIso && targetIso === countryNameIso) {
      return true;
    }

    // 2. Exact normalized name match
    if (countryName && normTarget && countryName === normTarget) {
      return true;
    }
  }

  return false;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export class WikidataResolver {
  private callCount = 0;
  private readonly userAgent = "SFinder-Backend/1.0 (Cloudflare Worker; contact: kunalbhai137@gmail.com)";
  private readonly fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  constructor(
    private readonly baseUrl = "https://www.wikidata.org/w/api.php",
    private readonly timeoutMs = 5000,
    private readonly maxCalls = 4,
    private readonly attribution = "Data provided by Wikidata (CC0)",
    fetchFn?: typeof fetch
  ) {
    this.fetchFn = fetchFn 
      ? (input, init) => fetchFn(input, init) 
      : (input, init) => globalThis.fetch(input, init);
  }

  public getCallCount(): number {
    return this.callCount;
  }

  public resetCallCount(): void {
    this.callCount = 0;
  }

  private incrementCallCount(): void {
    if (this.callCount >= this.maxCalls) {
      throw new WikidataBudgetExceededError(
        `Exceeded maximum allowed Wikidata API calls budget of ${this.maxCalls}`
      );
    }
    this.callCount++;
  }

  /**
   * Search Wikidata for entities matching a title.
   */
  public async searchMovieEntities(title: string, limit = 7): Promise<WikidataSearchResultItem[]> {
    this.incrementCallCount();
    const endpoint = `${this.baseUrl}?action=wbsearchentities&search=${encodeURIComponent(
      title.trim()
    )}&language=en&format=json&type=item&limit=${limit}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(endpoint, {
        headers: {
          "Accept": "application/json",
          "User-Agent": this.userAgent
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new WikidataError(`Wikidata search returned HTTP ${response.status}`, response.status);
      }

      const data = await response.json() as any;
      const searchItems = (data?.search || []) as any[];

      return searchItems.map(item => ({
        id: item.id,
        label: item.label,
        description: item.description
      }));
    } catch (err: any) {
      if (err instanceof WikidataBudgetExceededError || err instanceof WikidataError) {
        throw err;
      }
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        throw new WikidataError(`Wikidata request timed out after ${this.timeoutMs}ms`);
      }
      throw new WikidataError(err.message || "Failed to search Wikidata movie catalog");
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch entity details and claims in batch for a list of QIDs.
   */
  public async getEntities(qids: string[]): Promise<Record<string, WikidataEntity>> {
    if (qids.length === 0) return {};
    this.incrementCallCount();

    const idsParam = qids.join("|");
    const endpoint = `${this.baseUrl}?action=wbgetentities&ids=${encodeURIComponent(
      idsParam
    )}&props=claims|labels|descriptions&languages=en&format=json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(endpoint, {
        headers: {
          "Accept": "application/json",
          "User-Agent": this.userAgent
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new WikidataError(`Wikidata wbgetentities returned HTTP ${response.status}`, response.status);
      }

      const data = await response.json() as any;
      return (data?.entities || {}) as Record<string, WikidataEntity>;
    } catch (err: any) {
      if (err instanceof WikidataBudgetExceededError || err instanceof WikidataError) {
        throw err;
      }
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        throw new WikidataError(`Wikidata request timed out after ${this.timeoutMs}ms`);
      }
      throw new WikidataError(err.message || "Failed to retrieve Wikidata entities");
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Resolve a candidate against Wikidata.
   */
  public async resolveCandidate(
    candidate: Candidate,
    filters?: WikidataMovieFilters
  ): Promise<{ item: VerifiedEntertainmentItem | null; rejection?: CandidateRejection }> {
    const candidateTitle = candidate.canonicalTitle;
    const searchResults = await this.searchMovieEntities(candidateTitle, 7);

    if (searchResults.length === 0) {
      return {
        item: null,
        rejection: { candidateTitle, reason: "NO_TVMAZE_RESULTS" as any } // maps to zero catalog results
      };
    }

    // Filter candidate search results: prioritize items whose descriptions indicate films
    const prioritizedQids = searchResults
      .filter(s => {
        const desc = (s.description || "").toLowerCase();
        return desc.includes("film") || desc.includes("movie") || desc.includes("directed by") || desc.includes("starring");
      })
      .map(s => s.id);

    // If none specifically mention film in description, take all returned IDs (up to 5)
    const qidsToFetch = (prioritizedQids.length > 0 ? prioritizedQids : searchResults.map(s => s.id)).slice(0, 5);

    const entities = await this.getEntities(qidsToFetch);

    let bestScore = -1;
    let bestEntity: WikidataEntity | null = null;
    let bestYear: number | null = null;
    let bestGenres: string[] = [];
    let bestCountries: Array<{ name: string; code: string }> = [];

    const normCandidate = normalizeTitle(candidateTitle);

    for (const qid of qidsToFetch) {
      const entity = entities[qid];
      if (!entity) continue;

      // Strict catalog check: verify entity is actually a film and not a series or episode
      if (!isFilmInstance(entity)) {
        continue;
      }

      const label = entity.labels?.en?.value || "";
      const normLabel = normalizeTitle(label);
      const releaseYear = extractWikidataReleaseYear(entity);
      const genres = extractWikidataGenres(entity);
      const countries = extractWikidataCountries(entity);

      let score = 0;
      if (normLabel === normCandidate) {
        score += 55;
      } else if (normLabel.includes(normCandidate) || normCandidate.includes(normLabel)) {
        score += 35;
      }

      // Year match (+20 pts)
      if (candidate.approximateYear && releaseYear) {
        const diff = Math.abs(candidate.approximateYear - releaseYear);
        if (diff === 0) score += 20;
        else if (diff <= 1) score += 15;
        else if (diff <= 2) score += 10;
      } else if (releaseYear) {
        score += 10;
      }

      // Verified film instance (+20 pts)
      score += 20;

      if (score > bestScore) {
        bestScore = score;
        bestEntity = entity;
        bestYear = releaseYear;
        bestGenres = genres;
        bestCountries = countries;
      }
    }

    if (!bestEntity || bestScore < 60) {
      return {
        item: null,
        rejection: {
          candidateTitle,
          reason: "SCORE_BELOW_THRESHOLD",
          highestScore: Math.max(0, bestScore)
        }
      };
    }

    // Apply strict genre and country filters
    if (filters?.genre && !matchesMovieGenreFilter(bestGenres, filters.genre)) {
      return {
        item: null,
        rejection: { candidateTitle, reason: "FILTER_MISMATCH", highestScore: bestScore }
      };
    }

    if (filters?.country && !matchesMovieCountryFilter(bestCountries, filters.country)) {
      return {
        item: null,
        rejection: { candidateTitle, reason: "FILTER_MISMATCH", highestScore: bestScore }
      };
    }

    const verifiedItem = this.mapEntityToVerifiedItem(
      bestEntity,
      candidate.matchReason,
      bestYear,
      bestGenres,
      bestCountries
    );

    return { item: verifiedItem };
  }

  /**
   * Resolves multiple movie candidates in priority order with strict budget management.
   */
  public async resolveCandidates(
    candidates: Candidate[],
    onRejection?: (rejection: CandidateRejection) => void,
    filters?: WikidataMovieFilters
  ): Promise<VerifiedEntertainmentItem[]> {
    if (candidates.length === 0) return [];

    const verifiedItems: VerifiedEntertainmentItem[] = [];

    for (const candidate of candidates) {
      if (this.callCount >= this.maxCalls) {
        if (onRejection) {
          onRejection({
            candidateTitle: candidate.canonicalTitle,
            reason: "BUDGET_EXCEEDED"
          });
        }
        continue;
      }

      try {
        const res = await this.resolveCandidate(candidate, filters);
        if (res.item) {
          verifiedItems.push(res.item);
        } else if (res.rejection && onRejection) {
          onRejection(res.rejection);
        }
      } catch (err: any) {
        if (onRejection) {
          onRejection({
            candidateTitle: candidate.canonicalTitle,
            reason: err instanceof WikidataBudgetExceededError ? "BUDGET_EXCEEDED" : "LOOKUP_ERROR"
          });
        }
      }
    }

    return verifiedItems;
  }

  /**
   * Map Wikidata entity to S Finder's VerifiedEntertainmentItem.
   */
  public mapEntityToVerifiedItem(
    entity: WikidataEntity,
    matchExplanation: string,
    releaseYear: number | null,
    genres: string[],
    countriesOrCountry: Array<{ name: string; code: string }> | { name: string; code: string } | null
  ): VerifiedEntertainmentItem {
    const title = entity.labels?.en?.value || "Untitled";
    const description = entity.descriptions?.en?.value || "";

    const countries = Array.isArray(countriesOrCountry)
      ? countriesOrCountry
      : countriesOrCountry
        ? [countriesOrCountry]
        : [];

    const countryOfOrigin = countries.length > 0 
      ? countries.map(c => c.name).join(", ") 
      : null;

    const countriesOfOrigin = countries.map(c => c.name);

    return {
      id: `wikidata-${entity.id}`,
      title,
      originalTitle: null,
      releaseYear,
      mediaType: "MOVIE",
      genres,
      originalLanguage: null,
      countryOfOrigin,
      countriesOfOrigin: countriesOfOrigin.length > 0 ? countriesOfOrigin : undefined,
      rating: null, // Ratings not fabricated
      synopsis: description,
      posterUrl: null, // CC0 data only; Commons file licenses unverified
      matchExplanation,
      catalogSource: this.attribution
    };
  }
}
