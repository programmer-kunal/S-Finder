import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { NodeSqliteAdapter } from "./sqliteAdapter";
import { CatalogRepository } from "../../src/catalog/catalogRepository";
import { CatalogItem } from "../../src/catalog/types";
import { titleMatchesTypoToken, boundedLevenshtein } from "../../src/catalog/levenshtein";
import { WIKIDATA_GENRE_MAP, extractWikidataGenres, WikidataEntity } from "../../src/wikidata";

describe("Phase 5BT: Exact-Title Typo Recovery & Metadata Integrity Regression Suite", () => {
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
          COALESCE(new.original_title, ''),
          COALESCE(new.synopsis, ''),
          COALESCE(new.genres_json, ''),
          COALESCE(new.trope_tags, '')
        );
      END;
    `);

    const fixtureItems: Partial<CatalogItem>[] = [
      // 1. Breaking Bad & competitors
      {
        id: "tvmaze-169",
        provider: "TVMAZE",
        providerId: "169",
        mediaType: "SERIES",
        title: "Breaking Bad",
        normalizedTitle: "breaking bad",
        releaseYear: 2008,
        genres: ["Drama", "Crime", "Thriller"],
        rating: 9.2,
        synopsis: "A high school chemistry teacher diagnosed with terminal lung cancer turns to manufacturing methamphetamine.",
        catalogSource: "TVmaze"
      },
      {
        id: "tvmaze-264",
        provider: "TVMAZE",
        providerId: "264",
        mediaType: "SERIES",
        title: "Bad Education",
        normalizedTitle: "bad education",
        releaseYear: 2012,
        genres: ["Comedy"],
        rating: 6.6,
        synopsis: "Comedy series about a teacher who is a bigger kid than the kids he teaches.",
        catalogSource: "TVmaze"
      },
      {
        id: "tvmaze-1508",
        provider: "TVMAZE",
        providerId: "1508",
        mediaType: "SERIES",
        title: "Bad Girls",
        normalizedTitle: "bad girls",
        releaseYear: 1999,
        genres: ["Drama", "Crime"],
        rating: 8.0,
        synopsis: "Drama series set in the female wing of Larkhall prison.",
        catalogSource: "TVmaze"
      },

      // 2. The Twilight Zone & competitors
      {
        id: "tvmaze-766",
        provider: "TVMAZE",
        providerId: "766",
        mediaType: "SERIES",
        title: "The Twilight Zone",
        normalizedTitle: "the twilight zone",
        releaseYear: 1959,
        genres: ["Science-Fiction", "Mystery", "Supernatural"],
        rating: 8.9,
        synopsis: "Anthology series of extraordinary tales of mystery, suspense, and the paranormal.",
        catalogSource: "TVmaze"
      },
      {
        id: "tvmaze-3578",
        provider: "TVMAZE",
        providerId: "3578",
        mediaType: "SERIES",
        title: "The Twilight Zone",
        normalizedTitle: "the twilight zone",
        releaseYear: 1985,
        genres: ["Fantasy", "Science-Fiction", "Mystery"],
        rating: 7.6,
        synopsis: "The 1980s revival of the acclaimed fantasy and science fiction anthology series.",
        catalogSource: "TVmaze"
      },
      {
        id: "tvmaze-914",
        provider: "TVMAZE",
        providerId: "914",
        mediaType: "SERIES",
        title: "The Dead Zone",
        normalizedTitle: "the dead zone",
        releaseYear: 2002,
        genres: ["Drama", "Fantasy", "Thriller"],
        rating: 8.1,
        synopsis: "Based on Stephen King novel about a man who awakens from a coma with psychic powers.",
        catalogSource: "TVmaze"
      },

      // 3. Movies for romance twist & metadata auditing
      {
        id: "wikidata-Q202548",
        provider: "WIKIDATA",
        providerId: "Q202548",
        mediaType: "MOVIE",
        title: "Vertigo",
        normalizedTitle: "vertigo",
        releaseYear: 1958,
        genres: ["Mystery", "Thriller", "Drama", "Romance"],
        rating: 8.3,
        synopsis: "1958 psychological romantic mystery thriller film by Alfred Hitchcock.",
        catalogSource: "Wikidata"
      },
      {
        id: "wikidata-Q204212",
        provider: "WIKIDATA",
        providerId: "Q204212",
        mediaType: "MOVIE",
        title: "Rebecca",
        normalizedTitle: "rebecca",
        releaseYear: 1940,
        genres: ["Mystery", "Drama", "Romance", "Thriller"],
        rating: 8.1,
        synopsis: "1940 romantic psychological thriller film by Alfred Hitchcock.",
        catalogSource: "Wikidata"
      },
      {
        id: "wikidata-Q44578",
        provider: "WIKIDATA",
        providerId: "Q44578",
        mediaType: "MOVIE",
        title: "Titanic",
        normalizedTitle: "titanic",
        releaseYear: 1997,
        genres: ["Drama", "Romance"],
        rating: 7.9,
        synopsis: "1997 epic romantic disaster film directed by James Cameron.",
        catalogSource: "Wikidata"
      },
      {
        id: "wikidata-Q132689",
        provider: "WIKIDATA",
        providerId: "Q132689",
        mediaType: "MOVIE",
        title: "Casablanca",
        normalizedTitle: "casablanca",
        releaseYear: 1942,
        genres: ["Romance", "Drama"],
        rating: 8.5,
        synopsis: "1942 wartime romantic drama film directed by Michael Curtiz.",
        catalogSource: "Wikidata"
      },
      {
        id: "wikidata-Q190956",
        provider: "WIKIDATA",
        providerId: "Q190956",
        mediaType: "MOVIE",
        title: "Amadeus",
        normalizedTitle: "amadeus",
        releaseYear: 1984,
        genres: ["Drama", "Musical"],
        rating: 8.4,
        synopsis: "1984 biographical musical drama film directed by Miloš Forman.",
        catalogSource: "Wikidata"
      },
      {
        id: "wikidata-Q15648198",
        provider: "WIKIDATA",
        providerId: "Q15648198",
        mediaType: "MOVIE",
        title: "Whiplash",
        normalizedTitle: "whiplash",
        releaseYear: 2014,
        genres: ["Drama", "Musical"],
        rating: 8.5,
        synopsis: "2014 psychological drama film about an aspiring jazz drummer.",
        catalogSource: "Wikidata"
      },
      {
        id: "wikidata-Q869741",
        provider: "WIKIDATA",
        providerId: "Q869741",
        mediaType: "MOVIE",
        title: "Melody Time",
        normalizedTitle: "melody time",
        releaseYear: 1948,
        genres: ["Musical", "Animation"],
        rating: 6.3,
        synopsis: "1948 live-action/animated musical anthology film.",
        catalogSource: "Wikidata"
      },

      // 4. Time loop fixture
      {
        id: "tvmaze-1007",
        provider: "TVMAZE",
        providerId: "1007",
        mediaType: "SERIES",
        title: "Tru Calling",
        normalizedTitle: "tru calling",
        releaseYear: 2003,
        genres: ["Drama", "Fantasy"],
        rating: 7.5,
        synopsis: "What would you do if you could relive a day? If you're Tru Davies, you'd save lives.",
        catalogSource: "TVmaze"
      },
      {
        id: "tvmaze-2107",
        provider: "TVMAZE",
        providerId: "2107",
        mediaType: "SERIES",
        title: "The Loop",
        normalizedTitle: "the loop",
        releaseYear: 2006,
        genres: ["Comedy"],
        rating: 6.5,
        synopsis: "Workplace sitcom about the youngest executive at an airline.",
        catalogSource: "TVmaze"
      }
    ];

    for (const it of fixtureItems) {
      db.exec(`
        INSERT INTO catalog_items (
          id, provider, provider_id, media_type, title, normalized_title,
          release_year, genres_json, synopsis, rating, trope_tags, catalog_source, indexed_at
        ) VALUES (
          '${it.id}', '${it.provider}', '${it.providerId}', '${it.mediaType}', '${it.title}', '${it.normalizedTitle}',
          ${it.releaseYear}, '${JSON.stringify(it.genres)}', '${it.synopsis?.replace(/'/g, "''")}', ${it.rating ?? 'NULL'},
          '${it.tropeTags || ""}', '${it.catalogSource}', ${Date.now()}
        );
      `);
    }
  });

  describe("1. Exact-Title Typo Recovery Regression", () => {
    it("prioritizes Breaking Bad at Rank #1 for 'braking bad' over Bad Education and Bad Girls", async () => {
      const res = await repo.search({ query: "braking bad", mediaType: "ALL", limit: 5 });
      assert.ok(res.items.length > 0, "Expected search results");
      assert.strictEqual(res.items[0].id, "tvmaze-169", "Breaking Bad must rank #1 for 'braking bad'");
      assert.strictEqual(res.items[0].title, "Breaking Bad");
      // Other generic 'bad' shows must rank lower
      const badEducationRank = res.items.findIndex(i => i.id === "tvmaze-264");
      const badGirlsRank = res.items.findIndex(i => i.id === "tvmaze-1508");
      if (badEducationRank !== -1) {
        assert.ok(badEducationRank > 0, "Bad Education must rank below Breaking Bad");
      }
      if (badGirlsRank !== -1) {
        assert.ok(badGirlsRank > 0, "Bad Girls must rank below Breaking Bad");
      }
    });

    it("prioritizes The Twilight Zone at Rank #1 for 'Twilite Zone' over The Dead Zone", async () => {
      const res = await repo.search({ query: "Twilite Zone", mediaType: "ALL", limit: 5 });
      assert.ok(res.items.length > 0);
      assert.strictEqual(res.items[0].title, "The Twilight Zone", "The Twilight Zone must rank #1 for 'Twilite Zone'");
      const deadZoneRank = res.items.findIndex(i => i.id === "tvmaze-914");
      if (deadZoneRank !== -1) {
        assert.ok(deadZoneRank > 0, "The Dead Zone must rank below The Twilight Zone");
      }
    });

    it("preserves exact title searches without regression", async () => {
      const res1 = await repo.search({ query: "Breaking Bad", mediaType: "ALL", limit: 5 });
      assert.strictEqual(res1.items[0].title, "Breaking Bad");

      const res2 = await repo.search({ query: "The Twilight Zone", mediaType: "ALL", limit: 5 });
      assert.strictEqual(res2.items[0].title, "The Twilight Zone");
    });

    it("does NOT apply aggressive title typo boost to multi-word narrative queries", async () => {
      const res = await repo.search({ query: "time loopp reliving past", mediaType: "ALL", limit: 5 });
      assert.ok(res.items.length > 0);
      // The Loop must NOT be #1 because narrative queries disable the title typo boost
      assert.notStrictEqual(res.items[0].id, "tvmaze-2107", "The Loop must not rank #1 on narrative query");
      assert.strictEqual(res.items[0].id, "tvmaze-1007", "Tru Calling (genuine time loop) must rank #1");
    });

    it("negative test: rejects dissimilar words without common prefix or beyond maxDistance", () => {
      assert.strictEqual(titleMatchesTypoToken("The Dead Zone", "twilite"), false);
      assert.strictEqual(titleMatchesTypoToken("Bad Education", "braking"), false);
      assert.strictEqual(titleMatchesTypoToken("Six Feet Under", "twilite"), false);
      assert.strictEqual(titleMatchesTypoToken("Planet Earth", "frosen"), false);
    });
  });

  describe("2. Metadata Classification & Romance Twist Evidence", () => {
    it("verifies Q842256 correctly maps to 'Musical' and not 'Romance'", () => {
      assert.strictEqual(WIKIDATA_GENRE_MAP["Q842256"], "Musical");
      assert.strictEqual(WIKIDATA_GENRE_MAP["Q1054574"], "Romance");
    });

    it("verifies extractWikidataGenres assigns Musical and not Romance to musical films", () => {
      const musicalEntity: WikidataEntity = {
        id: "Q190956",
        descriptions: { en: { value: "1984 film directed by Miloš Forman" } },
        claims: {
          P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
          P136: [
            { mainsnak: { datavalue: { value: { id: "Q130232" } } } }, // Drama
            { mainsnak: { datavalue: { value: { id: "Q842256" } } } }  // Musical film
          ]
        }
      };

      const genres = extractWikidataGenres(musicalEntity);
      assert.deepStrictEqual(genres, ["Drama", "Musical"]);
      assert.ok(!genres.includes("Romance"), "Amadeus must NOT contain Romance genre");
    });

    it("ranks Vertigo and Rebecca at top for romantic movie with unexpected twist", async () => {
      const query = "mujhe ek romantic movie chahiye jisme unexpected twist ho";
      const res = await repo.search({ query, mediaType: "ALL", limit: 5 });

      assert.ok(res.items.length > 0);
      for (const item of res.items) {
        assert.strictEqual(item.mediaType, "MOVIE", "All results must be movies");
      }

      // Amadeus, Whiplash, and Melody Time (which have no romance) must NOT be returned in top results
      const nonRomanceIds = new Set(["wikidata-Q190956", "wikidata-Q15648198", "wikidata-Q869741"]);
      for (let i = 0; i < Math.min(3, res.items.length); i++) {
        assert.ok(!nonRomanceIds.has(res.items[i].id), `${res.items[i].title} must not rank in top 3`);
      }

      // Vertigo (Mystery/Thriller/Drama/Romance) and Rebecca (Mystery/Drama/Romance/Thriller) have
      // verified genre & plot evidence for both Romance and Twist/Suspense!
      assert.ok(res.items[0].title === "Vertigo" || res.items[0].title === "Rebecca",
        `Expected Vertigo or Rebecca at #1, found ${res.items[0].title}`);
    });
  });
});
