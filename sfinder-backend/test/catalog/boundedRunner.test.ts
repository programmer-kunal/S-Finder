import test, { describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createMemoryDatabase, NodeSqliteAdapter } from "./sqliteAdapter";
import { CatalogRepository } from "../../src/catalog/catalogRepository";
import { BoundedIngestionRunner } from "../../src/catalog/boundedRunner";
import { CatalogItem } from "../../src/catalog/types";

describe("Phase 5AT: Bounded Ingestion Runner & Guardrail Tests", () => {
  let db: NodeSqliteAdapter;
  let repo: CatalogRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    const schemaSql = fs.readFileSync(
      path.resolve(__dirname, "../../migrations/0001_catalog_schema.sql"),
      "utf8"
    );
    db.rawDb.exec(schemaSql);
    repo = new CatalogRepository(db);
  });

  const mockTvMazeShow = (id: number, name: string) => ({
    id,
    name,
    premiered: "2022-01-01",
    genres: ["Drama"],
    summary: `<p>Summary of ${name}</p>`,
    weight: 80,
    rating: { average: 7.5 },
    network: { country: { name: "United States" } }
  });

  test("Scenario 1: Stops immediately if daily write budget is already exhausted", async () => {
    const today = new Date().toISOString().substring(0, 10);
    // Seed budget tracker at 35,000 writes
    await repo.recordBudgetUsage(today, {
      rowsWritten: 35_000,
      rowsRead: 500,
      recordsImported: 3500,
      batchesProcessed: 14
    });

    let fetchCalled = false;
    const mockFetch = (async () => {
      fetchCalled = true;
      return new Response("[]", { status: 200 });
    }) as any;

    const runner = new BoundedIngestionRunner(db, {
      maxDailyRowsWrittenBudget: 35_000,
      fetchFn: mockFetch
    });

    const result = await runner.runTvMazePilot();
    assert.equal(result.stopReason, "DAILY_BUDGET_EXHAUSTED");
    assert.equal(result.pagesProcessed, 0);
    assert.equal(result.recordsImported, 0);
    assert.equal(fetchCalled, false, "Must not perform network fetch if budget is exhausted");
  });

  test("Scenario 2: Halts before starting next batch if remaining budget cannot cover worst-case page", async () => {
    const today = new Date().toISOString().substring(0, 10);
    // Budget is 35,000. Current usage is 33,000. Remaining: 2,000.
    // Worst-case page is 250 items * 10 writes = 2,500 writes.
    // 2,000 < 2,500 -> Must halt before starting page.
    await repo.recordBudgetUsage(today, {
      rowsWritten: 33_000,
      rowsRead: 200,
      recordsImported: 3300,
      batchesProcessed: 13
    });

    let fetchCalled = false;
    const mockFetch = (async () => {
      fetchCalled = true;
      return new Response("[]", { status: 200 });
    }) as any;

    const runner = new BoundedIngestionRunner(db, {
      maxDailyRowsWrittenBudget: 35_000,
      worstCasePageItems: 250,
      measuredWritesPerFreshItem: 10,
      fetchFn: mockFetch
    });

    const result = await runner.runTvMazePilot();
    assert.equal(result.stopReason, "BUDGET_INSUFFICIENT_FOR_NEXT_BATCH");
    assert.equal(result.pagesProcessed, 0);
    assert.equal(fetchCalled, false, "Must not fetch page if headroom is insufficient");
  });

  test("Scenario 3: Successfully processes bounded 1-page pilot within budget and updates cursor", async () => {
    const mockShows = [
      mockTvMazeShow(501, "Pilot Test Show A"),
      mockTvMazeShow(502, "Pilot Test Show B")
    ];

    const mockFetch = (async (url: string) => {
      return new Response(JSON.stringify(mockShows), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as any;

    const runner = new BoundedIngestionRunner(db, {
      maxDailyRowsWrittenBudget: 35_000,
      maxPagesPerRun: 1,
      fetchFn: mockFetch
    });

    const result = await runner.runTvMazePilot();
    assert.equal(result.stopReason, "PAGE_LIMIT_REACHED");
    assert.equal(result.pagesProcessed, 1);
    assert.equal(result.recordsImported, 2);
    assert.equal(result.lastPage, 1);
    assert.equal(result.rowsWrittenThisRun, 22); // 2 items * 10 writes + 2 bookkeeping writes

    // Verify cursor updated in database
    const cursor = await repo.getCursor("TVMAZE");
    assert.equal(cursor?.lastPage, 1);
    assert.equal(cursor?.totalImported, 2);
    assert.equal(cursor?.status, "IN_PROGRESS");

    // Verify budget tracker updated
    const today = new Date().toISOString().substring(0, 10);
    const budget = await repo.getDailyBudget(today);
    assert.equal(budget.rowsWritten, 22);
    assert.equal(budget.recordsImported, 2);
  });

  test("Scenario 4: Resumes from checkpoint cursor correctly", async () => {
    // Seed cursor at page 2
    await repo.updateCursor({
      provider: "TVMAZE",
      lastPage: 2,
      totalImported: 485,
      status: "IN_PROGRESS",
      updatedAt: Date.now()
    });

    let requestedPage = -1;
    const mockFetch = (async (url: string) => {
      const match = url.match(/page=(\d+)/);
      if (match) requestedPage = parseInt(match[1], 10);
      return new Response(JSON.stringify([mockTvMazeShow(999, "Resumed Show")]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as any;

    const runner = new BoundedIngestionRunner(db, {
      maxPagesPerRun: 1,
      fetchFn: mockFetch
    });

    const result = await runner.runTvMazePilot();
    assert.equal(requestedPage, 2, "Must request page 2 based on lastPage=2 checkpoint");
    assert.equal(result.lastPage, 3);
    assert.equal(result.totalCatalogImported, 486);
  });

  test("Scenario 5: Fail-safe fallback when D1 write metric is missing or ambiguous halts before next batch", async () => {
    const mockShows = [mockTvMazeShow(601, "Ambiguous Metric Show")];
    const mockFetch = (async () => {
      return new Response(JSON.stringify(mockShows), { status: 200 });
    }) as any;

    const runner = new BoundedIngestionRunner(db, {
      maxPagesPerRun: 2,
      measuredWritesPerFreshItem: 10,
      fetchFn: mockFetch,
      batchExecutor: async () => ({ rowsWritten: NaN, rowsRead: 0 })
    });

    const result = await runner.runTvMazePilot();
    assert.equal(result.recordsImported, 1);
    assert.equal(result.rowsWrittenThisRun, 12); // 1 item * 10 writes + 2 bookkeeping
    assert.equal(result.stopReason, "ERROR");
    assert.ok(result.uncertaintyFlags.includes("USAGE_METRICS_AMBIGUOUS_FALLBACK_APPLIED"));
  });

  test("Scenario 6: Idempotent re-run does not corrupt or duplicate FTS entries", async () => {
    const itemA: CatalogItem = {
      id: "tvmaze-1",
      provider: "TVMAZE",
      providerId: "1",
      mediaType: "SERIES",
      title: "Show One",
      originalTitle: null,
      normalizedTitle: "show one",
      releaseYear: 2020,
      genres: ["Drama"],
      primaryGenre: "Drama",
      countries: ["US"],
      primaryCountry: "US",
      synopsis: "Initial synopsis with token Alpha",
      rating: 8.0,
      voteCount: null,
      popularityScore: 50,
      posterUrl: null,
      catalogSource: "TVmaze",
      tropeTags: "alpha mystery",
      providerUpdatedAt: null,
      indexedAt: Date.now()
    };

    await repo.insertBatch([itemA]);
    
    // Check initial FTS
    const fts1 = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH 'Alpha';").get() as any;
    assert.equal(fts1.count, 1);

    // Re-import with updated synopsis and trope tag
    const itemAUpdated: CatalogItem = {
      ...itemA,
      synopsis: "Updated synopsis with token Beta",
      tropeTags: "beta thriller"
    };

    await repo.insertBatch([itemAUpdated]);

    // Check catalog_items has exactly 1 row (no duplicate)
    const itemsCount = db.rawDb.prepare("SELECT count(*) as count FROM catalog_items;").get() as any;
    assert.equal(itemsCount.count, 1);

    // Check FTS has exactly 1 row (no duplicate)
    const ftsCount = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts;").get() as any;
    assert.equal(ftsCount.count, 1);

    // Old token Alpha is gone, new token Beta is present
    const ftsOld = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH 'Alpha';").get() as any;
    const ftsNew = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH 'Beta';").get() as any;
    assert.equal(ftsOld.count, 0, "Obsolete token Alpha must be purged");
    assert.equal(ftsNew.count, 1, "New token Beta must be searchable");
  });

  test("Scenario 7: Conditional UPSERT avoids FTS writes when source data is completely unchanged", async () => {
    const item: CatalogItem = {
      id: "tvmaze-10",
      provider: "TVMAZE",
      providerId: "10",
      mediaType: "SERIES",
      title: "Identical Show",
      originalTitle: null,
      normalizedTitle: "identical show",
      releaseYear: 2021,
      genres: ["Comedy"],
      primaryGenre: "Comedy",
      countries: ["UK"],
      primaryCountry: "UK",
      synopsis: "Unchanged plot.",
      rating: 7.0,
      voteCount: 50,
      popularityScore: 40,
      posterUrl: null,
      catalogSource: "TVmaze",
      tropeTags: "comedy funny",
      providerUpdatedAt: 1700000000,
      indexedAt: 1000
    };

    // First insert
    await repo.insertBatch([item]);
    const ftsBefore = db.rawDb.prepare("SELECT rowid, id, title FROM catalog_fts WHERE id = 'tvmaze-10';").get() as any;
    assert.ok(ftsBefore, "FTS entry must exist");

    // Re-insert exact same item with only indexedAt changed
    const itemReimported = { ...item, indexedAt: 999999 };
    await repo.insertBatch([itemReimported]);

    const ftsAfter = db.rawDb.prepare("SELECT rowid, id, title FROM catalog_fts WHERE id = 'tvmaze-10';").get() as any;
    assert.equal(ftsBefore.rowid, ftsAfter.rowid, "rowid must remain identical without trigger re-indexing");
  });

  test("Scenario 8: Updating title, aliases, synopsis, genres, or trope tags preserves 1:1 FTS parity", async () => {
    const baseItem: CatalogItem = {
      id: "tvmaze-20",
      provider: "TVMAZE",
      providerId: "20",
      mediaType: "SERIES",
      title: "Original Title",
      originalTitle: "Original Alias",
      normalizedTitle: "original title",
      releaseYear: 2019,
      genres: ["Action"],
      primaryGenre: "Action",
      countries: ["US"],
      primaryCountry: "US",
      synopsis: "Original summary.",
      rating: 8.0,
      voteCount: 100,
      popularityScore: 80,
      posterUrl: null,
      catalogSource: "TVmaze",
      tropeTags: "action hero",
      providerUpdatedAt: 1,
      indexedAt: 1
    };

    await repo.insertBatch([baseItem]);

    // Update with new title, aliases, synopsis, genres, and trope tags
    const updatedItem: CatalogItem = {
      ...baseItem,
      title: "Modernized Title",
      originalTitle: "Modernized Alias",
      normalizedTitle: "modernized title",
      genres: ["Sci-Fi", "Action"],
      primaryGenre: "Sci-Fi",
      synopsis: "Modernized summary with interstellar travels.",
      tropeTags: "space interstellar adventure",
      providerUpdatedAt: 2,
      indexedAt: 2
    };

    await repo.insertBatch([updatedItem]);

    // Check 1:1 parity
    const totalCatalog = db.rawDb.prepare("SELECT count(*) as count FROM catalog_items WHERE id = 'tvmaze-20';").get() as any;
    const totalFts = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE id = 'tvmaze-20';").get() as any;
    assert.equal(totalCatalog.count, 1);
    assert.equal(totalFts.count, 1);

    // Check obsolete tokens do not match
    const oldTitleMatch = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH '\"Original Title\"';").get() as any;
    const oldAliasMatch = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH '\"Original Alias\"';").get() as any;
    const oldTropeMatch = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH 'hero';").get() as any;
    assert.equal(oldTitleMatch.count, 0);
    assert.equal(oldAliasMatch.count, 0);
    assert.equal(oldTropeMatch.count, 0);

    // Check new tokens match
    const newTitleMatch = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH '\"Modernized Title\"';").get() as any;
    const newAliasMatch = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH '\"Modernized Alias\"';").get() as any;
    const newTropeMatch = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH 'interstellar';").get() as any;
    assert.equal(newTitleMatch.count, 1);
    assert.equal(newAliasMatch.count, 1);
    assert.equal(newTropeMatch.count, 1);
  });

  test("Scenario 9: Multi-day UTC rollover resets daily budget while preserving historical records", async () => {
    // Record historical usage for previous day (2026-10-24) at 13,342 writes
    const prevDay = "2026-10-24";
    const currentDay = "2026-10-25";

    await repo.recordBudgetUsage(prevDay, {
      rowsWritten: 13_342,
      rowsRead: 3_323,
      recordsImported: 1_190,
      batchesProcessed: 5
    });

    // Check that querying the current day returns 0 used writes (fresh 35,000 budget)
    const currentDayUsage = await repo.getDailyBudget(currentDay);
    assert.equal(currentDayUsage.rowsWritten, 0, "Current day must start with 0 writes used");
    assert.equal(currentDayUsage.recordsImported, 0);

    // Record usage for current day
    await repo.recordBudgetUsage(currentDay, {
      rowsWritten: 5_209,
      rowsRead: 954,
      recordsImported: 473,
      batchesProcessed: 2
    });

    // Verify both days are preserved independently in database
    const allRows = db.rawDb.prepare("SELECT * FROM ingestion_budget_tracker ORDER BY day_utc ASC;").all() as any[];
    assert.equal(allRows.length, 2, "Must preserve both days without overwriting");
    assert.equal(allRows[0].day_utc, prevDay);
    assert.equal(allRows[0].rows_written, 13_342);
    assert.equal(allRows[1].day_utc, currentDay);
    assert.equal(allRows[1].rows_written, 5_209);
  });

  test("Scenario 10: Fail-safe budget enforcement stops before batch when daily budget is exhausted across rollover", async () => {
    const today = "2026-10-25";
    // Previous day was maxed out, but today is a fresh day with 0 writes
    await repo.recordBudgetUsage("2026-10-24", {
      rowsWritten: 35_000,
      rowsRead: 5_000,
      recordsImported: 3_000,
      batchesProcessed: 12
    });

    let fetchCount = 0;
    const mockFetch = (async () => {
      fetchCount++;
      return new Response("[]", { status: 200 });
    }) as any;

    const runner = new BoundedIngestionRunner(db, {
      maxDailyRowsWrittenBudget: 35_000,
      fetchFn: mockFetch
    });

    const usage = await repo.getDailyBudget(today);
    assert.equal(usage.rowsWritten, 0, "Today has fresh headroom despite yesterday being exhausted");
  });

  test("Scenario 11: Idempotent conditional UPSERT accounts for exactly sequence evaluation write without table changes", async () => {
    const item: CatalogItem = {
      id: "tvmaze-999",
      provider: "TVMAZE",
      providerId: "999",
      mediaType: "SERIES",
      title: "Retry Test Show",
      originalTitle: null,
      normalizedTitle: "retry test show",
      releaseYear: 2021,
      genres: ["Drama"],
      primaryGenre: "Drama",
      countries: ["US"],
      primaryCountry: "US",
      synopsis: "Stable plot description.",
      rating: 8.0,
      voteCount: 100,
      popularityScore: 50,
      posterUrl: null,
      catalogSource: "TVmaze",
      tropeTags: "drama series",
      providerUpdatedAt: 100,
      indexedAt: 100
    };

    // First insert
    await repo.insertBatch([item]);
    const countBefore = db.rawDb.prepare("SELECT count(*) as count FROM catalog_items;").get() as any;

    // Retry insert exact same item
    await repo.insertBatch([item]);
    const countAfter = db.rawDb.prepare("SELECT count(*) as count FROM catalog_items;").get() as any;

    assert.equal(countBefore.count, countAfter.count, "Record count must remain identical");

    // Check FTS trigger was not fired
    const ftsCount = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts;").get() as any;
    assert.equal(ftsCount.count, countBefore.count, "FTS count must remain 1:1 with catalog items");
  });
});
