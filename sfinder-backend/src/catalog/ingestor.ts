import { CatalogItem, DatabaseAdapter, ImportCursor } from "./types";
import { CatalogRepository } from "./catalogRepository";

export interface IngestionOptions {
  batchSize?: number;            // records per batch write (default 50)
  maxPagesPerRun?: number;       // bound single run (e.g. 2 pages = 500 records)
  delayBetweenPagesMs?: number;  // throttle to respect provider rate limits (default 500ms)
  userAgent?: string;
  fetchFn?: typeof fetch;
}

export interface IngestionReport {
  provider: "TVMAZE" | "WIKIDATA";
  pagesProcessed: number;
  recordsImported: number;
  recordsSkipped: number;
  lastPage: number;
  hasMorePages: boolean;
  status: "IN_PROGRESS" | "COMPLETED" | "ERROR" | "IDLE";
  errorMessage?: string;
  estimatedBytesWritten: number;
  elapsedMs: number;
}

export class CatalogIngestor {
  private repository: CatalogRepository;
  private fetchFn: typeof fetch;
  private userAgent: string;

  constructor(
    private db: DatabaseAdapter,
    options?: { fetchFn?: typeof fetch; userAgent?: string }
  ) {
    this.repository = new CatalogRepository(db);
    this.fetchFn = options?.fetchFn || globalThis.fetch.bind(globalThis);
    this.userAgent = options?.userAgent || "SFinder-Catalog-Indexer/1.0 (kunalbhai137@gmail.com)";
  }

  /**
   * Safe, resumable ingestion of TVMaze series catalog using paginated show-index API.
   * Respects rate limits, writes in small transactions, and persists checkpoint to import_cursor.
   */
  async ingestTvMaze(options: IngestionOptions = {}): Promise<IngestionReport> {
    const startTime = Date.now();
    const maxPages = options.maxPagesPerRun ?? 2; // bounded by default for safety
    const delayMs = options.delayBetweenPagesMs ?? 500;

    // Load checkpoint
    const cursor = (await this.repository.getCursor("TVMAZE")) || {
      provider: "TVMAZE",
      lastPage: 0,
      totalImported: 0,
      status: "IDLE",
      updatedAt: Date.now()
    };

    let currentPage = cursor.lastPage;
    let totalImportedThisRun = 0;
    let totalSkippedThisRun = 0;
    let pagesProcessed = 0;
    let hasMorePages = true;
    let runStatus: "IN_PROGRESS" | "COMPLETED" | "ERROR" = "IN_PROGRESS";
    let errorMessage: string | undefined;

    try {
      while (pagesProcessed < maxPages && hasMorePages) {
        const url = `https://api.tvmaze.com/shows?page=${currentPage}`;
        const response = await this.fetchWithBackoff(url);

        if (response.status === 404) {
          // TVmaze returns 404 when beyond the last available page (catalog completed)
          hasMorePages = false;
          runStatus = "COMPLETED";
          break;
        }

        if (!response.ok) {
          throw new Error(`TVmaze API responded with HTTP ${response.status} on page ${currentPage}`);
        }

        const rawShows: any[] = await response.json();
        if (!Array.isArray(rawShows) || rawShows.length === 0) {
          hasMorePages = false;
          runStatus = "COMPLETED";
          break;
        }

        // Normalize shows into CatalogItems
        const normalizedItems: CatalogItem[] = [];
        for (const show of rawShows) {
          const item = this.normalizeTvMazeShow(show);
          if (item) {
            normalizedItems.push(item);
          } else {
            totalSkippedThisRun++;
          }
        }

        // Batched write to D1
        if (normalizedItems.length > 0) {
          await this.repository.insertBatch(normalizedItems);
          totalImportedThisRun += normalizedItems.length;
        }

        pagesProcessed++;
        currentPage++;

        // Update checkpoint cursor after each successful page
        cursor.lastPage = currentPage;
        cursor.totalImported += normalizedItems.length;
        cursor.lastImportedId = normalizedItems[normalizedItems.length - 1]?.id;
        cursor.status = hasMorePages ? "IN_PROGRESS" : "COMPLETED";
        cursor.updatedAt = Date.now();
        await this.repository.updateCursor(cursor);

        if (pagesProcessed < maxPages && hasMorePages && delayMs > 0) {
          await this.sleep(delayMs);
        }
      }
    } catch (err: any) {
      runStatus = "ERROR";
      errorMessage = err.message || "Unknown error during TVmaze ingestion";
      cursor.status = "ERROR";
      cursor.errorMessage = errorMessage;
      cursor.updatedAt = Date.now();
      await this.repository.updateCursor(cursor);
    }

    const elapsedMs = Date.now() - startTime;
    // Estimated average: 1.8KB per record in SQLite + FTS5
    const estimatedBytesWritten = totalImportedThisRun * 1800;

    return {
      provider: "TVMAZE",
      pagesProcessed,
      recordsImported: totalImportedThisRun,
      recordsSkipped: totalSkippedThisRun,
      lastPage: currentPage,
      hasMorePages,
      status: runStatus,
      errorMessage,
      estimatedBytesWritten,
      elapsedMs
    };
  }

  /**
   * Ingests verified Wikidata movie entities into the catalog index.
   */
  async ingestWikidataMovies(movies: any[]): Promise<IngestionReport> {
    const startTime = Date.now();
    let imported = 0;
    let skipped = 0;

    const normalizedItems: CatalogItem[] = [];
    for (const movie of movies) {
      const item = this.normalizeWikidataMovie(movie);
      if (item) {
        normalizedItems.push(item);
      } else {
        skipped++;
      }
    }

    if (normalizedItems.length > 0) {
      await this.repository.insertBatch(normalizedItems);
      imported = normalizedItems.length;
    }

    const cursor = (await this.repository.getCursor("WIKIDATA")) || {
      provider: "WIKIDATA",
      lastPage: 0,
      totalImported: 0,
      status: "IDLE",
      updatedAt: Date.now()
    };

    cursor.totalImported += imported;
    cursor.lastImportedId = normalizedItems[normalizedItems.length - 1]?.id;
    cursor.status = "IN_PROGRESS";
    cursor.updatedAt = Date.now();
    await this.repository.updateCursor(cursor);

    return {
      provider: "WIKIDATA",
      pagesProcessed: 1,
      recordsImported: imported,
      recordsSkipped: skipped,
      lastPage: 1,
      hasMorePages: false,
      status: "IN_PROGRESS",
      estimatedBytesWritten: imported * 1000,
      elapsedMs: Date.now() - startTime
    };
  }

  /**
   * Normalizes raw TVMaze show API record into a standardized CatalogItem.
   */
  normalizeTvMazeShow(raw: any): CatalogItem | null {
    if (!raw || !raw.id || !raw.name) return null;

    const id = `tvmaze-${raw.id}`;
    const title = String(raw.name).trim();
    const normalizedTitle = title.toLowerCase().replace(/[^\w\s]/g, "").trim();

    // Parse release year
    let releaseYear: number | null = null;
    if (raw.premiered) {
      const year = parseInt(raw.premiered.substring(0, 4), 10);
      if (!isNaN(year) && year > 1900 && year < 2100) {
        releaseYear = year;
      }
    }

    // Genres
    const genres = Array.isArray(raw.genres) ? raw.genres.map(String) : [];

    // Country of origin
    const countries: string[] = [];
    if (raw.network?.country?.name) {
      countries.push(String(raw.network.country.name).trim());
    }
    if (raw.webChannel?.country?.name) {
      const webCountry = String(raw.webChannel.country.name).trim();
      if (!countries.includes(webCountry)) {
        countries.push(webCountry);
      }
    }

    // Clean HTML from synopsis
    let synopsis: string | null = null;
    if (raw.summary) {
      synopsis = String(raw.summary).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    // Rating & weight
    const rating = typeof raw.rating?.average === "number" ? raw.rating.average : null;
    const popularityScore = typeof raw.weight === "number" ? raw.weight : null;

    // Image
    const posterUrl = raw.image?.medium || raw.image?.original || null;

    return {
      id,
      provider: "TVMAZE",
      providerId: String(raw.id),
      mediaType: "SERIES",
      title,
      originalTitle: null,
      normalizedTitle,
      releaseYear,
      genres,
      primaryGenre: genres[0] ?? null,
      countries,
      primaryCountry: countries[0] ?? null,
      synopsis,
      rating,
      voteCount: null,
      popularityScore,
      posterUrl,
      catalogSource: "Data provided by TVmaze (CC BY-SA 4.0)",
      tropeTags: genres.join(" "),
      providerUpdatedAt: raw.updated ? raw.updated * 1000 : null,
      indexedAt: Date.now()
    };
  }

  /**
   * Normalizes raw Wikidata movie entity into a standardized CatalogItem.
   */
  normalizeWikidataMovie(raw: any): CatalogItem | null {
    if (!raw || !raw.id || !raw.title) return null;

    const id = `wikidata-${raw.id}`;
    const title = String(raw.title).trim();
    const normalizedTitle = title.toLowerCase().replace(/[^\w\s]/g, "").trim();

    const genres = Array.isArray(raw.genres) ? raw.genres.map(String) : [];
    const countries = Array.isArray(raw.countries) ? raw.countries.map(String) : [];

    return {
      id,
      provider: "WIKIDATA",
      providerId: String(raw.id),
      mediaType: "MOVIE",
      title,
      originalTitle: raw.originalTitle || null,
      normalizedTitle,
      releaseYear: typeof raw.releaseYear === "number" ? raw.releaseYear : null,
      genres,
      primaryGenre: genres[0] ?? null,
      countries,
      primaryCountry: countries[0] ?? null,
      // Note: Wikidata descriptions are short entity glosses, not full synopses
      synopsis: raw.description ? String(raw.description).trim() : null,
      rating: null,
      voteCount: null,
      popularityScore: null,
      posterUrl: null, // Wikidata structured data is CC0; image files are not CC0
      catalogSource: "Data provided by Wikidata (CC0)",
      tropeTags: genres.join(" "),
      providerUpdatedAt: null,
      indexedAt: Date.now()
    };
  }

  /**
   * Resilient fetcher handling 429 rate limits with exponential backoff.
   */
  private async fetchWithBackoff(url: string, retries = 3): Promise<Response> {
    let attempt = 0;
    while (attempt <= retries) {
      const response = await this.fetchFn(url, {
        headers: { "User-Agent": this.userAgent, "Accept": "application/json" }
      });

      if (response.status === 429) {
        attempt++;
        if (attempt > retries) {
          throw new Error(`TVmaze rate limit exceeded (429) after ${retries} retries`);
        }
        const backoffMs = attempt * 1500;
        await this.sleep(backoffMs);
        continue;
      }

      return response;
    }

    throw new Error(`Failed to fetch ${url}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Computes rigorous storage and write quota projections against Cloudflare D1 Free Tier.
   * Accounts for FTS5 write amplification (~3.5-4 underlying row writes per inserted record).
   */
  static estimateStorageAndQuota(recordCount: number) {
    const avgRecordBytes = 2027; // Empirically measured byte consumption per record including FTS5 shadow tables
    const writesPerItem = 4; // 1 catalog_items write + 3 FTS5 shadow table writes (catalog_fts_data, docsize, idx)
    const projectedBytes = recordCount * avgRecordBytes;
    const projectedMb = (projectedBytes / (1024 * 1024)).toFixed(2);
    const totalRowWrites = recordCount * writesPerItem;
    const freeTierDbLimitMb = 500;
    const freeTierDailyWrites = 100_000;
    const storagePercent = ((parseFloat(projectedMb) / freeTierDbLimitMb) * 100).toFixed(1);
    const recommendedDailyBatchLimit = 15_000; // ~60k row writes, leaving 40k headroom for retries and app traffic

    return {
      recordCount,
      avgRecordBytes,
      writesPerItem,
      totalRowWrites,
      projectedBytes,
      projectedMb: `${projectedMb} MB`,
      storageQuotaPercent: `${storagePercent}% of 500MB free DB limit`,
      dailyWriteBudgetUsage: `${totalRowWrites} row writes / ${freeTierDailyWrites} daily free allowance (${((totalRowWrites / freeTierDailyWrites) * 100).toFixed(1)}%)`,
      recommendedDailyBatchLimit,
      isWithinStorageLimit: parseFloat(projectedMb) <= freeTierDbLimitMb,
      isWithinDailyWriteLimit: totalRowWrites <= freeTierDailyWrites,
      isWithinFreeLimits: parseFloat(projectedMb) <= freeTierDbLimitMb
    };
  }

  /**
   * Returns the expected TVMaze pagination page for a given TVMaze show ID.
   * TVMaze groups shows in 250-item pages: page = floor(id / 250).
   */
  static getTvMazeExpectedPage(showId: number): number {
    if (showId < 0 || !Number.isInteger(showId)) {
      throw new Error(`Invalid TVMaze show ID: ${showId}`);
    }
    return Math.floor(showId / 250);
  }

  /**
   * Returns the inclusive TVMaze show ID boundary range [minId, maxId] for a given page.
   */
  static getTvMazePageRange(page: number): { minId: number; maxId: number } {
    if (page < 0 || !Number.isInteger(page)) {
      throw new Error(`Invalid TVMaze page: ${page}`);
    }
    return {
      minId: page * 250,
      maxId: page * 250 + 249
    };
  }

  /**
   * Checks whether a TVMaze show ID strictly belongs to the specified page.
   */
  static isTvMazeIdInPage(showId: number, page: number): boolean {
    if (showId < 0 || page < 0) return false;
    return Math.floor(showId / 250) === page;
  }
}
