import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { NodeSqliteAdapter } from "./sqliteAdapter";
import { CatalogRepository } from "../../src/catalog/catalogRepository";
import { CatalogItem } from "../../src/catalog/types";
import { isEnemiesToLoversQuery, buildFtsQuery } from "../../src/catalog/tropes";

describe("Phase 5BG: Romance & Enemies-to-Lovers Trope Precision Tests", () => {
  let db: DatabaseSync;
  let adapter: NodeSqliteAdapter;
  let repo: CatalogRepository;

  before(async () => {
    db = new DatabaseSync(":memory:");
    adapter = new NodeSqliteAdapter(db);
    repo = new CatalogRepository(adapter);

    db.exec(`
      CREATE TABLE catalog_items (
        item_id INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        original_title TEXT,
        normalized_title TEXT NOT NULL,
        release_year INTEGER,
        genres_json TEXT,
        primary_genre TEXT,
        countries_json TEXT,
        primary_country TEXT,
        synopsis TEXT,
        rating REAL,
        vote_count INTEGER,
        popularity_score REAL,
        poster_url TEXT,
        catalog_source TEXT NOT NULL,
        trope_tags TEXT,
        provider_updated_at INTEGER,
        indexed_at INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE catalog_fts USING fts5(
        id UNINDEXED,
        title,
        aliases,
        synopsis,
        genres,
        trope_tags,
        tokenize = 'porter unicode61'
      );

      CREATE TRIGGER catalog_items_ai AFTER INSERT ON catalog_items BEGIN
        INSERT INTO catalog_fts (rowid, id, title, aliases, synopsis, genres, trope_tags)
        VALUES (
          new.item_id,
          new.id,
          new.title,
          coalesce(new.original_title, ''),
          coalesce(new.synopsis, ''),
          coalesce(new.genres_json, ''),
          coalesce(new.trope_tags, '')
        );
      END;
    `);

    // Real catalog metadata test items
    const testItems: CatalogItem[] = [
      {
        id: "tvmaze-181",
        provider: "TVMAZE",
        providerId: "181",
        mediaType: "SERIES",
        title: "Star-Crossed",
        normalizedTitle: "star crossed",
        releaseYear: 2014,
        genres: ["Drama", "Romance", "Science-Fiction"],
        primaryGenre: "Drama",
        countries: ["United States"],
        primaryCountry: "United States",
        synopsis: "Fierce battle erupted as humans fought for control over their new rivals, the Atrians. Emery and Roman forge a bond rages with anger and hostility between human and alien species, an epic Romeo and Juliet romance unfolds.",
        rating: 7.3,
        popularityScore: 78,
        catalogSource: "TVMAZE",
        indexedAt: Date.now()
      },
      {
        id: "tvmaze-3527",
        provider: "TVMAZE",
        providerId: "3527",
        mediaType: "SERIES",
        title: "Apgujeong Midnight Sun",
        normalizedTitle: "apgujeong midnight sun",
        releaseYear: 2014,
        genres: ["Drama", "Family", "Romance"],
        primaryGenre: "Drama",
        countries: ["South Korea"],
        primaryCountry: "South Korea",
        synopsis: "Whether a man and a woman become lovers or enemies depends on a fateful encounter. Revolving around work life at a TV network.",
        rating: 6.8,
        popularityScore: 65,
        catalogSource: "TVMAZE",
        indexedAt: Date.now()
      },
      {
        id: "tvmaze-3593",
        provider: "TVMAZE",
        providerId: "3593",
        mediaType: "SERIES",
        title: "Wonderland",
        normalizedTitle: "wonderland",
        releaseYear: 2013,
        genres: ["Drama", "Comedy"],
        primaryGenre: "Drama",
        countries: ["Australia"],
        primaryCountry: "Australia",
        synopsis: "Wonderland is a warm and engaging relationship drama revolving around four couples at very different stages of life – the star-crossed singles looking for love.",
        rating: 7.8,
        popularityScore: 70,
        catalogSource: "TVMAZE",
        indexedAt: Date.now()
      },
      {
        id: "tvmaze-2194",
        provider: "TVMAZE",
        providerId: "2194",
        mediaType: "SERIES",
        title: "Scream: The TV Series",
        normalizedTitle: "scream the tv series",
        releaseYear: 2015,
        genres: ["Horror", "Mystery"],
        primaryGenre: "Horror",
        countries: ["United States"],
        primaryCountry: "United States",
        synopsis: "After a cyber-bullying incident results in a brutal murder, the viral video serves as a catalyst for a teenage rivalry and murder spree.",
        rating: 7.1,
        popularityScore: 82,
        catalogSource: "TVMAZE",
        indexedAt: Date.now()
      },
      {
        id: "tvmaze-1571",
        provider: "TVMAZE",
        providerId: "1571",
        mediaType: "SERIES",
        title: "The Spoils of Babylon",
        normalizedTitle: "the spoils of babylon",
        releaseYear: 2014,
        genres: ["Comedy"],
        primaryGenre: "Comedy",
        countries: ["United States"],
        primaryCountry: "United States",
        synopsis: "Dysfunctional oil tycoons whose children must fight their forbidden love for each other.",
        rating: 6.2,
        popularityScore: 50,
        catalogSource: "TVMAZE",
        indexedAt: Date.now()
      },
      {
        id: "tvmaze-3236",
        provider: "TVMAZE",
        providerId: "3236",
        mediaType: "SERIES",
        title: "The Last Enemy",
        normalizedTitle: "the last enemy",
        releaseYear: 2008,
        genres: ["Drama", "Romance", "Thriller"],
        primaryGenre: "Drama",
        countries: ["United Kingdom"],
        primaryCountry: "United Kingdom",
        synopsis: "A man whose search for the truth about his brother's death catapults him into an international conspiracy - and a passionate love affair with his enemy's widow.",
        rating: 7.2,
        popularityScore: 68,
        catalogSource: "TVMAZE",
        indexedAt: Date.now()
      }
    ];

    await repo.insertBatch(testItems);
  });

  it("detects romance trope intent accurately while rejecting non-romantic rivalry queries", () => {
    assert.strictEqual(isEnemiesToLoversQuery("Enemies to lovers rivalry"), true);
    assert.strictEqual(isEnemiesToLoversQuery("enemies to lovers"), true);
    assert.strictEqual(isEnemiesToLoversQuery("hate to love romance"), true);

    // Non-romantic rivalry should NOT trigger the romance trope query
    assert.strictEqual(isEnemiesToLoversQuery("corporate rivalry between business tycoons"), false);
    assert.strictEqual(isEnemiesToLoversQuery("sibling rivalry crime documentary"), false);
  });

  it("builds conjunctive FTS expression requiring both opposition and romance concepts", () => {
    const fts = buildFtsQuery("Enemies to lovers rivalry");
    assert.ok(fts.includes('("enemies" + "to" + "lovers")'));
    assert.ok(fts.includes('("hate" + "to" + "love")'));
    assert.ok(fts.includes('("romeo" + "juliet")'));
    assert.ok(fts.includes('("star" + "crossed") AND'));
    assert.ok(fts.includes('AND ("romance" OR "lovers" OR "love" OR "romantic")'));
    // Must NOT contain standalone "rivalry" as an isolated OR token
    assert.ok(!fts.match(/\bOR "rivalry"\b/));
    // Must NOT contain bare ("star" + "crossed") without opposition terms
    assert.ok(!fts.includes('OR ("star" + "crossed") OR'));
  });

  it("ranks Star-Crossed #1 and strictly excludes non-romantic rivalry (Scream) and singles drama (Wonderland)", async () => {
    const res = await repo.search({ query: "Enemies to lovers rivalry", limit: 3 });

    assert.ok(res.items.length >= 1);
    assert.strictEqual(res.items[0].title, "Star-Crossed", "Star-Crossed must rank #1 for enemies to lovers");

    // Scream (horror slasher) must NOT be in the top results
    const screamMatch = res.items.find(i => i.title.includes("Scream"));
    assert.strictEqual(screamMatch, undefined, "Scream: The TV Series must be excluded from strict romance results");

    // Wonderland (singles relationship drama without opposition/rivalry) must NOT outrank Star-Crossed
    const wonderlandMatch = res.items.find(i => i.title === "Wonderland");
    assert.strictEqual(wonderlandMatch, undefined, "Wonderland must not be in top strict results");

    // Top results must feature opposition + romance
    for (const item of res.items) {
      const lower = (item.synopsis || "").toLowerCase();
      const hasOpposition = /rival|hostil|enem|conflict|feud/.test(lower);
      const hasRomance = /romance|love|lovers/.test(lower);
      assert.ok(hasOpposition && hasRomance, `${item.title} must satisfy dual opposition + romance concepts`);
    }
  });

  it("strictly excludes titles with generic rivalry but zero romance", async () => {
    // Test that an item with generic rivalry (e.g. Scream with cyberbullying rivalry) is rejected from top results
    const res = await repo.search({ query: "Enemies to lovers rivalry", limit: 3 });
    const scream = res.items.find(i => i.title.includes("Scream"));
    assert.strictEqual(scream, undefined, "Generic rivalry without romance must not appear in top results");

    // Also verify non-romantic rivalry query does not trigger romance trope query
    assert.strictEqual(isEnemiesToLoversQuery("corporate rivalry between business tycoons"), false);
  });

  it("strictly excludes titles with generic romance/lovers but zero opposition", async () => {
    // Wonderland only has "star-crossed singles looking for love", zero conflict/enemies
    const res = await repo.search({ query: "Enemies to lovers rivalry", limit: 2 });
    assert.ok(!res.items.some(i => i.title === "Wonderland"));
  });

  it("demonstrates controlled fallback ordering, duplicate elimination, and pagination", async () => {
    // Page 1 with limit 10 requests more than strict matches available (strict = 3 items in test fixture)
    const page1 = await repo.search({ query: "Enemies to lovers rivalry", page: 1, limit: 10 });
    assert.ok(page1.items.length >= 3);

    // Strict matches must come first
    assert.strictEqual(page1.items[0].title, "Star-Crossed");

    // Check duplicate elimination: each ID appears exactly once
    const ids = page1.items.map(i => i.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size, "Results must contain zero duplicates");

    // Pagination: Page 2 should not repeat Page 1 items
    const page2 = await repo.search({ query: "Enemies to lovers rivalry", page: 2, limit: 2 });
    for (const p2Item of page2.items) {
      const p1Match = page1.items.slice(0, 2).find(i => i.id === p2Item.id);
      assert.strictEqual(p1Match, undefined, "Page 2 must not repeat Page 1 items");
    }
  });

  it("verifies established benchmark queries Q16, Q19, Q20, Q29 remain unaffected", () => {
    // Q16: 90s family comedy
    const q16Fts = buildFtsQuery("90s family comedy");
    assert.ok(!isEnemiesToLoversQuery("90s family comedy"));
    assert.ok(q16Fts.includes('family'));

    // Q19: Cynical high school comedy
    const q19Fts = buildFtsQuery("Cynical high school comedy");
    assert.ok(!isEnemiesToLoversQuery("Cynical high school comedy"));
    assert.ok(q19Fts.includes('high') && q19Fts.includes('school'));

    // Q20: Historical samurai anime
    const q20Fts = buildFtsQuery("Historical samurai anime");
    assert.ok(!isEnemiesToLoversQuery("Historical samurai anime"));
    assert.ok(q20Fts.includes('samurai'));

    // Q29: Time loop reliving the past
    const q29Fts = buildFtsQuery("Time loop reliving the past");
    assert.ok(!isEnemiesToLoversQuery("Time loop reliving the past"));
    assert.ok(q29Fts.includes('time'));
  });
});
