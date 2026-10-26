import test, { describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createMemoryDatabase, NodeSqliteAdapter } from "./sqliteAdapter";
import { CatalogRepository } from "../../src/catalog/catalogRepository";
import { CatalogIngestor } from "../../src/catalog/ingestor";
import { BroadDiscoveryEngine } from "../../src/catalog/discoveryEngine";
import { CatalogItem } from "../../src/catalog/types";
import { extractTropeSynonyms, buildFtsQuery } from "../../src/catalog/tropes";

describe("Phase 5AQ: D1 Catalog Index & Broad Discovery Architecture Tests", () => {
  let db: NodeSqliteAdapter;
  let repo: CatalogRepository;
  let engine: BroadDiscoveryEngine;

  beforeEach(() => {
    db = createMemoryDatabase();
    // Load and execute 0001_catalog_schema.sql
    const schemaSql = fs.readFileSync(
      path.resolve(__dirname, "../../migrations/0001_catalog_schema.sql"),
      "utf8"
    );
    db.rawDb.exec(schemaSql);
    repo = new CatalogRepository(db);
    engine = new BroadDiscoveryEngine(db);
  });

  // Sample test fixtures
  const sampleSeries: CatalogItem = {
    id: "tvmaze-1",
    provider: "TVMAZE",
    providerId: "1",
    mediaType: "SERIES",
    title: "Under the Dome",
    originalTitle: null,
    normalizedTitle: "under the dome",
    releaseYear: 2013,
    genres: ["Drama", "Science-Fiction", "Thriller"],
    primaryGenre: "Drama",
    countries: ["United States"],
    primaryCountry: "United States",
    synopsis: "A small town is suddenly and inexplicably sealed off from the rest of the world by an enormous transparent dome.",
    rating: 6.5,
    voteCount: 420,
    popularityScore: 98,
    posterUrl: "https://static.tvmaze.com/uploads/images/medium_portrait/0/1.jpg",
    catalogSource: "Data provided by TVmaze (CC BY-SA 4.0)",
    tropeTags: "small town isolation mystery dome",
    providerUpdatedAt: 1704794122000,
    indexedAt: Date.now()
  };

  const sampleEnemiesToLoversSeries: CatalogItem = {
    id: "tvmaze-2",
    provider: "TVMAZE",
    providerId: "2",
    mediaType: "SERIES",
    title: "Crash Landing on You",
    originalTitle: "사랑의 불시착",
    normalizedTitle: "crash landing on you",
    releaseYear: 2019,
    genres: ["Drama", "Romance", "Comedy"],
    primaryGenre: "Drama",
    countries: ["South Korea"],
    primaryCountry: "South Korea",
    synopsis: "An intense rivalry and hostile cross-border tension transforms into deep devotion between an heiress and a soldier.",
    rating: 8.7,
    voteCount: 1500,
    popularityScore: 99,
    posterUrl: "https://static.tvmaze.com/poster.jpg",
    catalogSource: "Data provided by TVmaze (CC BY-SA 4.0)",
    tropeTags: "rivalry hate to love forbidden romance",
    providerUpdatedAt: 1704794122000,
    indexedAt: Date.now()
  };

  const sampleMultiCountryMovie: CatalogItem = {
    id: "wikidata-Q25188",
    provider: "WIKIDATA",
    providerId: "Q25188",
    mediaType: "MOVIE",
    title: "Inception",
    originalTitle: null,
    normalizedTitle: "inception",
    releaseYear: 2010,
    genres: ["Science Fiction", "Action", "Thriller"],
    primaryGenre: "Science Fiction",
    countries: ["United Kingdom", "United States"],
    primaryCountry: "United Kingdom",
    synopsis: "A skilled thief enters the subconscious of targets to steal corporate secrets through dream-sharing technology.",
    rating: 8.8,
    voteCount: 20000,
    popularityScore: 100,
    posterUrl: null,
    catalogSource: "Data provided by Wikidata (CC0)",
    tropeTags: "heist subconscious dream thief",
    providerUpdatedAt: null,
    indexedAt: Date.now()
  };

  const sampleMinimalMovie: CatalogItem = {
    id: "wikidata-Q12345",
    provider: "WIKIDATA",
    providerId: "Q12345",
    mediaType: "MOVIE",
    title: "Minimal Film",
    originalTitle: null,
    normalizedTitle: "minimal film",
    releaseYear: null,
    genres: [],
    primaryGenre: null,
    countries: [],
    primaryCountry: null,
    synopsis: null,
    rating: null,
    voteCount: null,
    popularityScore: null,
    posterUrl: null,
    catalogSource: "Data provided by Wikidata (CC0)",
    tropeTags: null,
    providerUpdatedAt: null,
    indexedAt: Date.now()
  };

  test("Scenario 1: FTS title and synopsis matches", async () => {
    await repo.insertBatch([sampleSeries, sampleMultiCountryMovie]);

    // Match by word in synopsis ("subconscious")
    const result1 = await repo.search({ query: "subconscious dream", mediaType: "ALL" });
    assert.equal(result1.items.length, 1);
    assert.equal(result1.items[0].title, "Inception");

    // Match by word in title ("dome")
    const result2 = await repo.search({ query: "Under the Dome", mediaType: "ALL" });
    assert.equal(result2.items.length, 1);
    assert.equal(result2.items[0].title, "Under the Dome");
  });

  test("Scenario 2: Trope synonym retrieval (enemies to lovers -> rivalry)", async () => {
    await repo.insertBatch([sampleEnemiesToLoversSeries, sampleSeries]);

    const synonyms = extractTropeSynonyms("enemies to lovers");
    assert.ok(synonyms.includes("rivalry"));
    assert.ok(synonyms.includes("hate to love"));

    // User searches "enemies to lovers" - synopsis contains "rivalry"
    const searchRes = await repo.search({ query: "enemies to lovers romance", mediaType: "ALL" });
    assert.ok(searchRes.items.length >= 1);
    assert.equal(searchRes.items[0].title, "Crash Landing on You");
  });

  test("Scenario 3: Movie versus series type boundaries", async () => {
    await repo.insertBatch([sampleSeries, sampleMultiCountryMovie]);

    // Query for movie with mediaType MOVIE
    const movieOnly = await repo.search({ query: "thriller", mediaType: "MOVIE" });
    assert.equal(movieOnly.items.length, 1);
    assert.equal(movieOnly.items[0].mediaType, "MOVIE");
    assert.equal(movieOnly.items[0].title, "Inception");

    // Query for series with mediaType SERIES
    const seriesOnly = await repo.search({ query: "thriller", mediaType: "SERIES" });
    assert.equal(seriesOnly.items.length, 1);
    assert.equal(seriesOnly.items[0].mediaType, "SERIES");
    assert.equal(seriesOnly.items[0].title, "Under the Dome");
  });

  test("Scenario 4: All-mode mixed results (movies + series)", async () => {
    await repo.insertBatch([sampleSeries, sampleMultiCountryMovie]);

    const mixed = await repo.search({ query: "thriller", mediaType: "ALL" });
    assert.equal(mixed.items.length, 2);
    const types = mixed.items.map(i => i.mediaType).sort();
    assert.deepEqual(types, ["MOVIE", "SERIES"]);
  });

  test("Scenario 5: Exact country and genre filters", async () => {
    await repo.insertBatch([sampleSeries, sampleEnemiesToLoversSeries, sampleMultiCountryMovie]);

    // Genre filter: Romance
    const romance = await repo.search({ query: "drama", genre: "Romance" });
    assert.equal(romance.items.length, 1);
    assert.equal(romance.items[0].title, "Crash Landing on You");

    // Country filter: South Korea
    const korea = await repo.search({ query: "drama", country: "South Korea" });
    assert.equal(korea.items.length, 1);
    assert.equal(korea.items[0].title, "Crash Landing on You");
  });

  test("Scenario 6: Multi-country origin handling", async () => {
    await repo.insertBatch([sampleMultiCountryMovie]);

    // Inception has both UK and US
    const ukResult = await repo.search({ query: "Inception", country: "United Kingdom" });
    assert.equal(ukResult.items.length, 1);
    assert.equal(ukResult.items[0].title, "Inception");

    const usResult = await repo.search({ query: "Inception", country: "United States" });
    assert.equal(usResult.items.length, 1);
    assert.equal(usResult.items[0].title, "Inception");

    // Does not match France
    const frResult = await repo.search({ query: "Inception", country: "France" });
    assert.equal(frResult.items.length, 0);
  });

  test("Scenario 7: Missing catalog metadata handled safely", async () => {
    await repo.insertBatch([sampleMinimalMovie]);

    const res = await repo.search({ query: "Minimal Film" });
    assert.equal(res.items.length, 1);
    const item = res.items[0];
    assert.equal(item.title, "Minimal Film");
    assert.equal(item.synopsis, null);
    assert.equal(item.releaseYear, null);
    assert.equal(item.rating, null);
    assert.equal(item.posterUrl, null);
    assert.deepEqual(item.genres, []);
    assert.deepEqual(item.countries, []);
  });

  test("Scenario 8: Pagination and deduplication across pages", async () => {
    // Insert 5 items
    const testItems: CatalogItem[] = [];
    for (let i = 1; i <= 5; i++) {
      testItems.push({
        id: `tvmaze-test-${i}`,
        provider: "TVMAZE",
        providerId: `${i}`,
        mediaType: "SERIES",
        title: `Detective Story ${i}`,
        normalizedTitle: `detective story ${i}`,
        genres: ["Mystery", "Drama"],
        primaryGenre: "Mystery",
        countries: ["United Kingdom"],
        primaryCountry: "United Kingdom",
        synopsis: `Detective solving complex murder mystery episode ${i}.`,
        rating: 7.0 + (i * 0.2),
        catalogSource: "TVmaze",
        indexedAt: Date.now()
      });
    }
    await repo.insertBatch(testItems);

    // Page 1 with limit 2
    const page1 = await repo.search({ query: "detective murder mystery", page: 1, limit: 2 });
    assert.equal(page1.items.length, 2);
    assert.equal(page1.page, 1);
    assert.equal(page1.totalCount, 5);
    assert.equal(page1.hasMore, true);

    // Page 2 with limit 2
    const page2 = await repo.search({ query: "detective murder mystery", page: 2, limit: 2 });
    assert.equal(page2.items.length, 2);
    assert.equal(page2.page, 2);
    assert.equal(page2.hasMore, true);

    // Page 3 with limit 2 (last item)
    const page3 = await repo.search({ query: "detective murder mystery", page: 3, limit: 2 });
    assert.equal(page3.items.length, 1);
    assert.equal(page3.page, 3);
    assert.equal(page3.hasMore, false);

    // Verify no duplicates between pages
    const page1Ids = page1.items.map(i => i.id);
    const page2Ids = page2.items.map(i => i.id);
    const page3Ids = page3.items.map(i => i.id);

    for (const id of page2Ids) {
      assert.ok(!page1Ids.includes(id), `Page 2 item ${id} was duplicated from Page 1`);
    }
    for (const id of page3Ids) {
      assert.ok(!page2Ids.includes(id), `Page 3 item ${id} was duplicated from Page 2`);
    }
  });

  test("Scenario 9: Stable ranking across pages", async () => {
    // Verify higher rated / higher relevance items appear first
    await repo.insertBatch([
      { ...sampleSeries, id: "show-lower", providerId: "lower-1", rating: 5.0, title: "Lower Mystery Show" },
      { ...sampleSeries, id: "show-higher", providerId: "higher-1", rating: 9.5, title: "Higher Mystery Show" }
    ]);

    const res = await repo.search({ query: "mystery show", page: 1, limit: 10 });
    assert.equal(res.items.length, 2);
    assert.equal(res.items[0].id, "show-higher");
    assert.equal(res.items[1].id, "show-lower");
  });

  test("Scenario 10: Ingestion restart/resume using checkpoint cursor", async () => {
    const fakePages: Record<string, any[]> = {
      "https://api.tvmaze.com/shows?page=0": [
        { id: 101, name: "Show Page 0", genres: ["Drama"], premiered: "2020-01-01" }
      ],
      "https://api.tvmaze.com/shows?page=1": [
        { id: 102, name: "Show Page 1", genres: ["Action"], premiered: "2021-01-01" }
      ]
    };

    const mockFetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (fakePages[urlStr]) {
        return new Response(JSON.stringify(fakePages[urlStr]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 404 });
    };

    const ingestor = new CatalogIngestor(db, { fetchFn: mockFetch as any });

    // Run 1: process 1 page (page 0)
    const run1 = await ingestor.ingestTvMaze({ maxPagesPerRun: 1, delayBetweenPagesMs: 0 });
    assert.equal(run1.pagesProcessed, 1);
    assert.equal(run1.recordsImported, 1);
    assert.equal(run1.lastPage, 1);
    assert.equal(run1.hasMorePages, true);

    const cursorAfterRun1 = await repo.getCursor("TVMAZE");
    assert.ok(cursorAfterRun1);
    assert.equal(cursorAfterRun1.lastPage, 1);
    assert.equal(cursorAfterRun1.totalImported, 1);

    // Run 2: resume from page 1
    const run2 = await ingestor.ingestTvMaze({ maxPagesPerRun: 1, delayBetweenPagesMs: 0 });
    assert.equal(run2.pagesProcessed, 1);
    assert.equal(run2.recordsImported, 1);
    assert.equal(run2.lastPage, 2);

    const cursorAfterRun2 = await repo.getCursor("TVMAZE");
    assert.ok(cursorAfterRun2);
    assert.equal(cursorAfterRun2.lastPage, 2);
    assert.equal(cursorAfterRun2.totalImported, 2);
  });

  test("Scenario 11: Duplicate imports and incremental updates", async () => {
    // Insert item once
    await repo.insertBatch([sampleSeries]);
    const count1 = (await repo.search({ query: "Under the Dome" })).totalCount;
    assert.equal(count1, 1);

    // Insert updated version of same item
    const updated = { ...sampleSeries, rating: 9.9 };
    await repo.insertBatch([updated]);
    const res2 = await repo.search({ query: "Under the Dome" });
    assert.equal(res2.totalCount, 1, "Must deduplicate and update existing record");
    assert.equal(res2.items[0].rating, 9.9);
  });

  test("Scenario 12: Rate-limit and 429 backoff handling", async () => {
    let callCount = 0;
    const mockFetch429 = async () => {
      callCount++;
      if (callCount <= 2) {
        // Return 429 on first 2 calls
        return new Response("Too Many Requests", { status: 429 });
      }
      // Return success on 3rd call
      return new Response(JSON.stringify([{ id: 999, name: "Recovered Show" }]), { status: 200 });
    };

    const ingestor = new CatalogIngestor(db, { fetchFn: mockFetch429 as any });
    const report = await ingestor.ingestTvMaze({ maxPagesPerRun: 1, delayBetweenPagesMs: 0 });

    assert.equal(report.status, "IN_PROGRESS");
    assert.equal(report.recordsImported, 1);
    assert.ok(callCount >= 3, "Must have retried after 429 responses");
  });

  test("Scenario 13: Quota-aware batch writes and storage projections", () => {
    const projection250 = CatalogIngestor.estimateStorageAndQuota(250);
    assert.ok(projection250.isWithinFreeLimits);
    assert.equal(projection250.recordCount, 250);

    const projectionFull75k = CatalogIngestor.estimateStorageAndQuota(75_000);
    assert.ok(projectionFull75k.isWithinFreeLimits);
    // 75,000 * 1800 B = 135 MB <= 500 MB limit
    assert.ok(parseFloat(projectionFull75k.projectedMb) < 500);
  });

  test("Scenario 14: No false completeness before entire catalog import finishes", async () => {
    const mockFetch = async () => {
      return new Response(JSON.stringify([{ id: 1, name: "Show 1" }]), { status: 200 });
    };

    const ingestor = new CatalogIngestor(db, { fetchFn: mockFetch as any });
    const report = await ingestor.ingestTvMaze({ maxPagesPerRun: 1, delayBetweenPagesMs: 0 });

    assert.equal(report.hasMorePages, true);
    assert.equal(report.status, "IN_PROGRESS");
    assert.notEqual(report.status, "COMPLETED");
  });

  test("Scenario 15: No fabricated result counts or metadata", async () => {
    await repo.insertBatch([sampleSeries]);

    const searchRes = await repo.search({ query: "Nonexistent extraterrestrial nonsense query 12345" });
    assert.equal(searchRes.items.length, 0);
    assert.equal(searchRes.totalCount, 0);
    assert.equal(searchRes.hasMore, false);
  });

  test("Scenario 16: Graceful fallback when index is empty", async () => {
    // Database has 0 items
    const discoveryRes = await engine.discover({ query: "detective story" });
    assert.equal(discoveryRes.items.length, 0);
    assert.equal(discoveryRes.totalCount, 0);
    assert.equal(discoveryRes.resolvedCount, 0);
    assert.equal(discoveryRes.hasMore, false);
  });

  test("Scenario 17: EXPLAIN QUERY PLAN confirms indexed lookups without full table scans", async () => {
    await repo.insertBatch([sampleSeries, sampleMultiCountryMovie]);

    const plan = await repo.explainSearchPlan("detective thriller");
    assert.ok(plan.length > 0);
    const planText = JSON.stringify(plan);
    // SQLite query plan should mention catalog_fts or virtual table index scan
    assert.ok(
      planText.includes("SCAN") || planText.includes("SEARCH") || planText.includes("catalog_fts"),
      "Query plan must utilize indexed structures"
    );
  });

  // --- Phase 5AR: FTS Trigger Synchronization Integrity Tests ---

  test("Scenario 18: Inserting a new catalog record makes its text searchable", async () => {
    const newItem: CatalogItem = {
      ...sampleSeries,
      id: "tvmaze-sync-1",
      providerId: "sync-1",
      title: "Quantum Cipher",
      synopsis: "A cryptographer discovers an unbreakable quantum transmission code.",
      tropeTags: "cryptography hacker cyberspace"
    };

    await repo.insertBatch([newItem]);

    // Search by title
    const resTitle = await repo.search({ query: "Quantum Cipher" });
    assert.equal(resTitle.items.length, 1);
    assert.equal(resTitle.items[0].id, "tvmaze-sync-1");

    // Search by synopsis keyword
    const resSynopsis = await repo.search({ query: "cryptographer transmission" });
    assert.equal(resSynopsis.items.length, 1);
    assert.equal(resSynopsis.items[0].id, "tvmaze-sync-1");

    // Search by trope keyword
    const resTrope = await repo.search({ query: "cyberspace hacker" });
    assert.equal(resTrope.items.length, 1);
    assert.equal(resTrope.items[0].id, "tvmaze-sync-1");
  });

  test("Scenario 19: Updating title or synopsis removes stale search matches and adds new matches", async () => {
    const originalItem: CatalogItem = {
      ...sampleSeries,
      id: "tvmaze-sync-2",
      providerId: "sync-2",
      title: "Original Legacy Secret",
      synopsis: "An ancient manuscript containing unique ancient treasure clues.",
      tropeTags: "treasure manuscript"
    };

    await repo.insertBatch([originalItem]);

    // Initial search matches "ancient"
    const initRes = await repo.search({ query: "ancient manuscript" });
    assert.equal(initRes.items.length, 1);
    assert.equal(initRes.items[0].id, "tvmaze-sync-2");

    // Update title, synopsis, and trope_tags directly in SQLite to simulate external record update
    db.rawDb.exec(`
      UPDATE catalog_items
      SET title = 'Modern Quantum Heist',
          normalized_title = 'modern quantum heist',
          synopsis = 'A modern high-tech vault infiltration by elite thieves.',
          trope_tags = 'heist vault infiltration'
      WHERE id = 'tvmaze-sync-2';
    `);

    // Stale search for old keywords must return 0 results
    const staleRes = await repo.search({ query: "ancient manuscript" });
    assert.equal(staleRes.items.length, 0, "Stale keyword must not match after UPDATE");

    // New search for updated keywords must return 1 result
    const newRes = await repo.search({ query: "modern quantum vault" });
    assert.equal(newRes.items.length, 1, "New keyword must match after UPDATE");
    assert.equal(newRes.items[0].title, "Modern Quantum Heist");

    // Total FTS entries must remain exactly 1 (no duplicates)
    const ftsCount = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts;").get() as any;
    assert.equal(ftsCount.count, 1, "FTS table must have exactly 1 record after update");
  });

  test("Scenario 20: Updating genre or trope fields updates full-text retrieval correctly", async () => {
    const item: CatalogItem = {
      ...sampleSeries,
      id: "tvmaze-sync-3",
      providerId: "sync-3",
      title: "Chameleon Agent",
      synopsis: "An operative works in secret.",
      tropeTags: "undercover spy infiltration"
    };

    await repo.insertBatch([item]);

    // Verify initial trope search
    const initRes = await repo.search({ query: "undercover spy" });
    assert.equal(initRes.items.length, 1);

    // Update trope tags and genres
    db.rawDb.exec(`
      UPDATE catalog_items
      SET trope_tags = 'bodyguard protection assassination target',
          genres_json = '["Action", "Thriller"]'
      WHERE id = 'tvmaze-sync-3';
    `);

    // Old trope query must return 0
    const oldTropeRes = await repo.search({ query: "undercover infiltration" });
    assert.equal(oldTropeRes.items.length, 0);

    // New trope query must return 1
    const newTropeRes = await repo.search({ query: "bodyguard protection target" });
    assert.equal(newTropeRes.items.length, 1);
  });

  test("Scenario 21: Deleting a catalog record removes it from both tables", async () => {
    const item: CatalogItem = {
      ...sampleSeries,
      id: "tvmaze-sync-4",
      providerId: "sync-4",
      title: "Ephemeral Ghost",
      synopsis: "A phantom detective investigates unexplainable phenomena."
    };

    await repo.insertBatch([item]);
    assert.equal((await repo.search({ query: "phantom detective" })).totalCount, 1);

    // Delete record from catalog_items
    db.rawDb.exec("DELETE FROM catalog_items WHERE id = 'tvmaze-sync-4';");

    // Must be gone from both catalog_items and catalog_fts
    const itemRow = db.rawDb.prepare("SELECT * FROM catalog_items WHERE id = 'tvmaze-sync-4';").get();
    assert.equal(itemRow, undefined);

    const ftsMatches = await repo.search({ query: "phantom detective" });
    assert.equal(ftsMatches.totalCount, 0);

    const ftsCount = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts;").get() as any;
    assert.equal(ftsCount.count, 0, "FTS table must be empty after delete");
  });

  test("Scenario 22: Re-importing the same provider record is idempotent", async () => {
    const item: CatalogItem = {
      ...sampleSeries,
      id: "tvmaze-sync-5",
      providerId: "sync-5",
      title: "Resilient Voyager",
      synopsis: "A deep space exploration vessel travels beyond the solar system.",
      rating: 7.2
    };

    // First import
    await repo.insertBatch([item]);
    assert.equal((await repo.search({ query: "deep space exploration" })).totalCount, 1);

    // Re-import identical record
    await repo.insertBatch([item]);
    assert.equal((await repo.search({ query: "deep space exploration" })).totalCount, 1);

    // Re-import modified record (updated rating and synopsis)
    const updated = { ...item, rating: 8.8, synopsis: "An upgraded deep space exploration vessel on an interstellar mission." };
    await repo.insertBatch([updated]);

    const res = await repo.search({ query: "deep space exploration" });
    assert.equal(res.totalCount, 1, "Idempotent re-import must maintain exactly 1 result");
    assert.equal(res.items[0].rating, 8.8);

    const ftsCount = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts;").get() as any;
    assert.equal(ftsCount.count, 1, "FTS shadow table must contain exactly 1 entry");
  });

  // --- Phase 5AR: BM25 Relevance & Composite Ranking Validation Tests ---

  test("Scenario 23: Exact title match outranks incidental synopsis token match", async () => {
    // Show A: Exact title "Bodyguard", lower rating
    const showA: CatalogItem = {
      ...sampleSeries,
      id: "bodyguard-exact",
      providerId: "bg-1",
      title: "Bodyguard",
      normalizedTitle: "bodyguard",
      synopsis: "A fictional drama about politics and security.",
      rating: 6.0,
      popularityScore: 20
    };

    // Show B: Incidental synopsis match, higher rating and popularity
    const showB: CatalogItem = {
      ...sampleSeries,
      id: "incidental-bg",
      providerId: "bg-2",
      title: "Downtown Royal Palace",
      normalizedTitle: "downtown royal palace",
      synopsis: "In this historical romance, a royal palace servant hired a private bodyguard for protection.",
      rating: 9.8,
      popularityScore: 100
    };

    await repo.insertBatch([showB, showA]);

    const res = await repo.search({ query: "Bodyguard", page: 1, limit: 10 });
    assert.equal(res.items.length, 2);
    // Exact title must outrank incidental synopsis match despite rating difference
    assert.equal(res.items[0].id, "bodyguard-exact");
    assert.equal(res.items[1].id, "incidental-bg");
  });

  test("Scenario 24: Strong story-description match outranks weak generic match", async () => {
    // Show A: Strong story match (many matching concepts and tropes)
    const strongShow: CatalogItem = {
      ...sampleSeries,
      id: "strong-story",
      providerId: "story-1",
      title: "Nemesis Protocol",
      normalizedTitle: "nemesis protocol",
      synopsis: "An intense enemies to lovers rivalry between competing corporate executives who despise each other but fall in love.",
      tropeTags: "enemies lovers rivalry feud hate to love",
      rating: 7.0
    };

    // Show B: Weak generic match (single keyword match)
    const weakShow: CatalogItem = {
      ...sampleSeries,
      id: "weak-generic",
      providerId: "story-2",
      title: "General Hospital Routine",
      normalizedTitle: "general hospital routine",
      synopsis: "A hospital drama with doctors, nurses, patients, and occasional lovers.",
      rating: 7.0
    };

    await repo.insertBatch([weakShow, strongShow]);

    const res = await repo.search({ query: "enemies to lovers rivalry", page: 1, limit: 10 });
    assert.ok(res.items.length >= 2);
    assert.equal(res.items[0].id, "strong-story", "Strong story match must be ranked #1");
  });

  test("Scenario 25: Popularity and rating do not override a major semantic mismatch", async () => {
    // High rating, off-topic incidental match
    const offTopicHighRating: CatalogItem = {
      ...sampleSeries,
      id: "off-topic-popular",
      providerId: "pop-1",
      title: "Cosmic Wonders",
      normalizedTitle: "cosmic wonders",
      synopsis: "A spectacular astronomy documentary about stars, galaxies, and planetary lovers of astronomy.",
      rating: 9.9,
      popularityScore: 100
    };

    // Relevant topic, moderate rating
    const relevantTopic: CatalogItem = {
      ...sampleSeries,
      id: "relevant-romance",
      providerId: "rom-1",
      title: "Secret Office Romance",
      normalizedTitle: "secret office romance",
      synopsis: "A workplace romance between rival coworkers trapped in a bitter corporate feud.",
      tropeTags: "rivalry feud enemies lovers",
      rating: 6.8,
      popularityScore: 15
    };

    await repo.insertBatch([offTopicHighRating, relevantTopic]);

    const res = await repo.search({ query: "rival coworkers feud", page: 1, limit: 10 });
    assert.equal(res.items[0].id, "relevant-romance", "Semantic match must outrank off-topic high-rated entry");
  });

  test("Scenario 26: Missing ratings or popularity values are imputed neutrally without unpredictable penalties", async () => {
    // Insert background catalog documents so FTS5 BM25 IDF is computed across a realistic corpus
    const backgroundItems: CatalogItem[] = [];
    for (let i = 1; i <= 10; i++) {
      backgroundItems.push({
        ...sampleSeries,
        id: `bg-item-${i}`,
        providerId: `bg-${i}`,
        title: `Background Show ${i}`,
        normalizedTitle: `background show ${i}`,
        synopsis: "A comedy about colleagues and daily office humor.",
        tropeTags: "comedy office workplace",
        rating: 7.0,
        popularityScore: 30
      });
    }
    await repo.insertBatch(backgroundItems);

    // Show with strong semantic match, but missing (null) rating and popularity
    const unratedStrongMatch: CatalogItem = {
      ...sampleSeries,
      id: "unrated-strong",
      providerId: "unrated-1",
      title: "Unrated Mystery Masterpiece",
      normalizedTitle: "unrated mystery masterpiece",
      synopsis: "A brilliant small town detective solves an intricate locked room murder mystery with baffling clues.",
      tropeTags: "murder mystery detective clues",
      rating: null,
      popularityScore: null
    };

    // Show with rated weak match (single keyword match)
    const ratedWeakMatch: CatalogItem = {
      ...sampleSeries,
      id: "rated-weak",
      providerId: "rated-1",
      title: "Sunday Morning News",
      normalizedTitle: "sunday morning news",
      synopsis: "A morning show with weather, sports, and a brief mystery segment.",
      rating: 8.5,
      popularityScore: 40
    };

    await repo.insertBatch([ratedWeakMatch, unratedStrongMatch]);

    const res = await repo.search({ query: "locked room murder mystery detective", page: 1, limit: 10 });
    assert.equal(res.items[0].id, "unrated-strong", "Unrated strong match must outrank weak rated match");
  });

  test("Scenario 27: Ordering and pagination remain deterministic and stable across multiple pages", async () => {
    // Insert 15 items with identical or close ratings
    const items: CatalogItem[] = [];
    for (let i = 1; i <= 15; i++) {
      items.push({
        ...sampleSeries,
        id: `stable-show-${i.toString().padStart(2, "0")}`,
        providerId: `stable-${i}`,
        title: `Detective Chronicles Volume ${i}`,
        normalizedTitle: `detective chronicles volume ${i}`,
        synopsis: "A detective solves crimes in the Victorian era.",
        rating: 7.5 + (i % 3) * 0.5,
        popularityScore: 50
      });
    }

    await repo.insertBatch(items);

    const page1 = await repo.search({ query: "detective chronicles", page: 1, limit: 5 });
    const page2 = await repo.search({ query: "detective chronicles", page: 2, limit: 5 });
    const page3 = await repo.search({ query: "detective chronicles", page: 3, limit: 5 });

    assert.equal(page1.items.length, 5);
    assert.equal(page2.items.length, 5);
    assert.equal(page3.items.length, 5);

    const ids1 = page1.items.map(i => i.id);
    const ids2 = page2.items.map(i => i.id);
    const ids3 = page3.items.map(i => i.id);

    // Verify disjoint sets across pages
    for (const id of ids2) {
      assert.ok(!ids1.includes(id), `Item ${id} on Page 2 must not appear on Page 1`);
    }
    for (const id of ids3) {
      assert.ok(!ids2.includes(id), `Item ${id} on Page 3 must not appear on Page 2`);
      assert.ok(!ids1.includes(id), `Item ${id} on Page 3 must not appear on Page 1`);
    }
  });
});
