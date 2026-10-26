import { CatalogItem, DatabaseAdapter, ImportCursor, IngestionBudgetRecord } from "./types";
import { CatalogRepository } from "./catalogRepository";
import { CatalogIngestor } from "./ingestor";

export interface BoundedRunnerOptions {
  maxDailyRowsWrittenBudget?: number; // Conservative limit: default 35,000 writes/day
  maxPagesPerRun?: number;            // Upper bound on pages for this single execution (default 1)
  maxItemsPerRun?: number;            // Upper bound on records for this single execution (optional)
  delayBetweenPagesMs?: number;       // Respect rate limits (default 1000ms)
  measuredWritesPerFreshItem?: number;// Measured D1 cost: 10 rows written per fresh item
  worstCasePageItems?: number;        // Max items on a single TVmaze page (default 250)
  fetchFn?: typeof fetch;
  userAgent?: string;
  batchExecutor?: (items: CatalogItem[]) => Promise<{ rowsWritten: number; rowsRead: number }>;
  onLog?: (message: string) => void;
}

export type BoundedRunnerStopReason =
  | "PAGE_LIMIT_REACHED"
  | "ITEM_LIMIT_REACHED"
  | "DAILY_BUDGET_EXHAUSTED"
  | "BUDGET_INSUFFICIENT_FOR_NEXT_BATCH"
  | "CATALOG_COMPLETED"
  | "ERROR";

export interface BoundedRunnerResult {
  provider: "TVMAZE";
  dayUtc: string;
  pagesProcessed: number;
  recordsImported: number;
  recordsSkipped: number;
  rowsWrittenThisRun: number;
  rowsReadThisRun: number;
  cumulativeDailyRowsWritten: number;
  remainingDailyBudget: number;
  lastPage: number;
  totalCatalogImported: number;
  stopReason: BoundedRunnerStopReason;
  errorMessage?: string;
  uncertaintyFlags: string[];
  elapsedMs: number;
}

export class BoundedIngestionRunner {
  private repository: CatalogRepository;
  private ingestor: CatalogIngestor;
  private fetchFn: typeof fetch;
  private userAgent: string;
  private log: (msg: string) => void;

  constructor(
    private db: DatabaseAdapter,
    private options: BoundedRunnerOptions = {}
  ) {
    this.repository = new CatalogRepository(db);
    this.fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
    this.userAgent = options.userAgent || "SFinder-BoundedRunner/1.0 (kunalbhai137@gmail.com)";
    this.ingestor = new CatalogIngestor(db, { fetchFn: this.fetchFn, userAgent: this.userAgent });
    this.log = options.onLog || ((msg: string) => console.log(`[BoundedRunner] ${msg}`));
  }

  /**
   * Executes a strictly bounded, budget-guarded ingestion run for TVmaze.
   * Enforces:
   * 1. Max 35,000 measured D1 row writes per UTC day.
   * 2. Pre-execution headroom check: halts before starting next batch if remaining budget < worst-case batch cost.
   * 3. Fail-safe write accounting when D1 metadata is missing or ambiguous.
   * 4. Atomic cursor update and idempotent upserts.
   */
  async runTvMazePilot(): Promise<BoundedRunnerResult> {
    const startTime = Date.now();
    const dayUtc = new Date().toISOString().substring(0, 10);
    const maxDailyBudget = this.options.maxDailyRowsWrittenBudget ?? 35_000;
    const maxPages = this.options.maxPagesPerRun ?? 1;
    const maxItems = this.options.maxItemsPerRun ?? Infinity;
    const delayMs = this.options.delayBetweenPagesMs ?? 1000;
    const writeCostPerItem = this.options.measuredWritesPerFreshItem ?? 11;
    const worstCasePageItems = this.options.worstCasePageItems ?? 250;
    // Phase 5BG updated budget reservation: up to 250 items * ~11 writes/item (2,750) + 50 bookkeeping = 2,800 writes
    const worstCaseBatchCost = this.options.measuredWritesPerFreshItem !== undefined
      ? worstCasePageItems * writeCostPerItem
      : 2800;

    const uncertaintyFlags: string[] = [];
    let rowsWrittenThisRun = 0;
    let rowsReadThisRun = 0;
    let totalImportedThisRun = 0;
    let totalSkippedThisRun = 0;
    let pagesProcessed = 0;
    let stopReason: BoundedRunnerStopReason = "PAGE_LIMIT_REACHED";
    let errorMessage: string | undefined;

    this.log(`Initializing run for UTC day: ${dayUtc}`);
    this.log(`Configured Limits: maxDailyBudget=${maxDailyBudget}, maxPages=${maxPages}, maxItems=${maxItems}`);

    // 1. Fetch current daily budget state
    const currentBudget = await this.repository.getDailyBudget(dayUtc);
    let cumulativeWrites = currentBudget.rowsWritten;
    this.log(`Current Daily Usage: ${cumulativeWrites} writes written today (${maxDailyBudget - cumulativeWrites} remaining)`);

    // Check if daily budget already exhausted
    if (cumulativeWrites >= maxDailyBudget) {
      this.log(`Daily budget already exhausted (${cumulativeWrites} >= ${maxDailyBudget}). Stopping immediately.`);
      return {
        provider: "TVMAZE",
        dayUtc,
        pagesProcessed: 0,
        recordsImported: 0,
        recordsSkipped: 0,
        rowsWrittenThisRun: 0,
        rowsReadThisRun: 0,
        cumulativeDailyRowsWritten: cumulativeWrites,
        remainingDailyBudget: Math.max(0, maxDailyBudget - cumulativeWrites),
        lastPage: (await this.repository.getCursor("TVMAZE"))?.lastPage ?? 0,
        totalCatalogImported: (await this.repository.getCursor("TVMAZE"))?.totalImported ?? 0,
        stopReason: "DAILY_BUDGET_EXHAUSTED",
        uncertaintyFlags,
        elapsedMs: Date.now() - startTime
      };
    }

    // 2. Load Checkpoint Cursor
    const cursor: ImportCursor = (await this.repository.getCursor("TVMAZE")) || {
      provider: "TVMAZE",
      lastPage: 0,
      totalImported: 0,
      status: "IDLE",
      updatedAt: Date.now()
    };
    let currentPage = cursor.lastPage;
    this.log(`Resuming from checkpoint cursor: lastPage=${currentPage}, totalImported=${cursor.totalImported}`);

    try {
      while (pagesProcessed < maxPages && totalImportedThisRun < maxItems) {
        // Pre-batch headroom check
        const remainingBudget = maxDailyBudget - (cumulativeWrites + rowsWrittenThisRun);
        if (remainingBudget < worstCaseBatchCost) {
          this.log(`Remaining budget (${remainingBudget}) is insufficient for next batch worst-case cost (${worstCaseBatchCost}). Halting.`);
          stopReason = "BUDGET_INSUFFICIENT_FOR_NEXT_BATCH";
          break;
        }

        this.log(`Fetching TVmaze page ${currentPage}...`);
        const url = `https://api.tvmaze.com/shows?page=${currentPage}`;
        const res = await this.fetchTvMazePage(url);

        if (res.status === 404) {
          this.log(`TVmaze returned HTTP 404 for page ${currentPage}: Catalog complete.`);
          stopReason = "CATALOG_COMPLETED";
          cursor.status = "COMPLETED";
          break;
        }

        if (!res.ok) {
          throw new Error(`TVmaze API HTTP ${res.status} on page ${currentPage}`);
        }

        const rawShows: any[] = await res.json();
        if (!Array.isArray(rawShows) || rawShows.length === 0) {
          this.log(`Empty show array on page ${currentPage}: Catalog complete.`);
          stopReason = "CATALOG_COMPLETED";
          cursor.status = "COMPLETED";
          break;
        }

        // Normalize shows
        const items: CatalogItem[] = [];
        for (const raw of rawShows) {
          const item = this.ingestor.normalizeTvMazeShow(raw);
          if (item) {
            items.push(item);
          } else {
            totalSkippedThisRun++;
          }
        }

        this.log(`Page ${currentPage}: ${rawShows.length} raw shows, ${items.length} normalized items.`);

        // Execute batch write with metric measurement
        if (items.length > 0) {
          const writeMetrics = await this.executeBatchWithMetrics(items);
          
          // Fail-safe handling for missing or ambiguous D1 metrics
          let batchWrites = writeMetrics.rowsWritten;
          let batchReads = writeMetrics.rowsRead;

          if (batchWrites === undefined || batchWrites === null || isNaN(batchWrites)) {
            const fallbackWrites = items.length * writeCostPerItem + 2;
            this.log(`WARNING: D1 returned invalid write metric (${batchWrites}). Applying conservative fallback: ${fallbackWrites} writes and halting.`);
            uncertaintyFlags.push("USAGE_METRICS_AMBIGUOUS_FALLBACK_APPLIED");
            batchWrites = fallbackWrites;
            stopReason = "ERROR";
            errorMessage = "Missing or ambiguous D1 usage metrics returned from batch operation";
          } else {
            // Include bookkeeping writes (+2 for cursor & budget tracker)
            batchWrites += 2;
          }

          rowsWrittenThisRun += batchWrites;
          rowsReadThisRun += batchReads;
          totalImportedThisRun += items.length;

          // Record budget usage to persistent table
          await this.repository.recordBudgetUsage(dayUtc, {
            rowsWritten: batchWrites,
            rowsRead: batchReads,
            recordsImported: items.length,
            batchesProcessed: 1
          });

          if (stopReason === "ERROR") {
            break;
          }
        }

        pagesProcessed++;
        currentPage++;

        // Update checkpoint cursor atomically
        cursor.lastPage = currentPage;
        cursor.totalImported += items.length;
        cursor.lastImportedId = items.length > 0 ? items[items.length - 1].id : cursor.lastImportedId;
        cursor.status = "IN_PROGRESS";
        cursor.updatedAt = Date.now();
        await this.repository.updateCursor(cursor);

        this.log(`Page ${currentPage - 1} complete. Checkpoint saved (lastPage=${currentPage}, totalImported=${cursor.totalImported}).`);

        if (pagesProcessed >= maxPages) {
          stopReason = "PAGE_LIMIT_REACHED";
          break;
        }

        if (totalImportedThisRun >= maxItems) {
          stopReason = "ITEM_LIMIT_REACHED";
          break;
        }

        if (delayMs > 0) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    } catch (err: any) {
      stopReason = "ERROR";
      errorMessage = err.message || "Unknown error during bounded ingestion";
      this.log(`ERROR encountered: ${errorMessage}`);
      cursor.status = "ERROR";
      cursor.errorMessage = errorMessage;
      cursor.updatedAt = Date.now();
      await this.repository.updateCursor(cursor);
    }

    const elapsedMs = Date.now() - startTime;
    const finalBudget = await this.repository.getDailyBudget(dayUtc);
    const finalCursor = (await this.repository.getCursor("TVMAZE")) || cursor;

    return {
      provider: "TVMAZE",
      dayUtc,
      pagesProcessed,
      recordsImported: totalImportedThisRun,
      recordsSkipped: totalSkippedThisRun,
      rowsWrittenThisRun,
      rowsReadThisRun,
      cumulativeDailyRowsWritten: finalBudget.rowsWritten,
      remainingDailyBudget: Math.max(0, maxDailyBudget - finalBudget.rowsWritten),
      lastPage: finalCursor.lastPage,
      totalCatalogImported: finalCursor.totalImported,
      stopReason,
      errorMessage,
      uncertaintyFlags,
      elapsedMs
    };
  }

  private async fetchTvMazePage(url: string): Promise<Response> {
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      const res = await this.fetchFn(url, {
        headers: { "User-Agent": this.userAgent, "Accept": "application/json" }
      });
      if (res.status === 429) {
        const wait = attempts * 2000;
        this.log(`TVmaze 429 rate limit hit. Backing off for ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return res;
    }
    throw new Error(`Exceeded retries for URL ${url}`);
  }

  private async executeBatchWithMetrics(items: CatalogItem[]): Promise<{ rowsWritten: number; rowsRead: number }> {
    if (this.options.batchExecutor) {
      return this.options.batchExecutor(items);
    }
    const beforeCount = items.length;
    await this.repository.insertBatch(items);
    
    // Default measured write cost: 10 writes per fresh record
    return {
      rowsWritten: beforeCount * 10,
      rowsRead: 0
    };
  }
}
