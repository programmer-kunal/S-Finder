import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { NodeSqliteAdapter } from "./sqliteAdapter";
import { CatalogRepository } from "../../src/catalog/catalogRepository";
import { CatalogItem } from "../../src/catalog/types";
import { analyzeQuery } from "../../src/catalog/language";

describe("Phase 5BR: Media-Type Intent Enforcement & Story False-Positive Fixes", () => {
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
      // 1. Time loop & narrative shows
      {
        id: "tvmaze-862",
        provider: "TVMAZE",
        providerId: "862",
        mediaType: "SERIES",
        title: "Being Erica",
        normalizedTitle: "being erica",
        releaseYear: 2009,
        genres: ["Drama", "Comedy", "Fantasy"],
        synopsis: "Being Erica is a one-hour series that explores the life of Erica Strange. Every episode, Erica goes back to relive a regret from her past, in order to come back and make a positive change in her present.",
        rating: 7.9,
        tropeTags: "Drama Comedy Fantasy time loop relive past",
        catalogSource: "TVmaze"
      },
      {
        id: "tvmaze-1007",
        provider: "TVMAZE",
        providerId: "1007",
        mediaType: "SERIES",
        title: "Tru Calling",
        normalizedTitle: "tru calling",
        releaseYear: 2003,
        genres: ["Drama", "Fantasy"],
        synopsis: "What would you do if you could relive a day? If you're Tru Davies, you'd save lives.",
        rating: 7.9,
        tropeTags: "Drama Fantasy relive day",
        catalogSource: "TVmaze"
      },
      {
        id: "tvmaze-485",
        provider: "TVMAZE",
        providerId: "485",
        mediaType: "SERIES",
        title: "Day Break",
        normalizedTitle: "day break",
        releaseYear: 2006,
        genres: ["Drama", "Science-Fiction", "Thriller"],
        synopsis: "Detective Brett Hopper is having a hellacious day; the kind of day where nothing goes his way... because hes living the same day over and over again.",
        rating: 7.8,
        tropeTags: "Drama Science-Fiction Thriller same day time loop",
        catalogSource: "TVmaze"
      },
      // 2. Sitcom with incidental title match
      {
        id: "tvmaze-2107",
        provider: "TVMAZE",
        providerId: "2107",
        mediaType: "SERIES",
        title: "The Loop",
        normalizedTitle: "the loop",
        releaseYear: 2006,
        genres: ["Comedy"],
        synopsis: "The Loop is an American television sitcom about a young professional trying to balance his social life at corporate headquarters in Chicago downtown loop area.",
        rating: null,
        tropeTags: "Comedy",
        catalogSource: "TVmaze"
      },
      // 2b. Historical drama with metaphorical 'relives' in synopsis
      {
        id: "tvmaze-1238",
        provider: "TVMAZE",
        providerId: "1238",
        mediaType: "SERIES",
        title: "The Kennedys",
        normalizedTitle: "the kennedys",
        releaseYear: 2011,
        genres: ["Drama", "History"],
        synopsis: "The dramatic event The Kennedys relives the public and private joys and tragedies of the most influential family in the world.",
        rating: 7.7,
        tropeTags: "Drama History",
        catalogSource: "TVmaze"
      },
      // 3. Enemies to lovers series
      {
        id: "tvmaze-189",
        provider: "TVMAZE",
        providerId: "189",
        mediaType: "SERIES",
        title: "Star-Crossed",
        normalizedTitle: "star crossed",
        releaseYear: 2014,
        genres: ["Drama", "Romance", "Science-Fiction"],
        synopsis: "An alien boy and human girl fall in love amidst intense rivalry and hostility between their opposing factions. As an epic Romeo and Juliet romance unfolds, their love must survive.",
        rating: 7.4,
        tropeTags: "Drama Romance Science-Fiction enemies to lovers star-crossed",
        catalogSource: "TVmaze"
      },
      // 4. Genuine Movies
      {
        id: "wiki-m-1",
        provider: "WIKIDATA",
        providerId: "Q44578",
        mediaType: "MOVIE",
        title: "Titanic",
        normalizedTitle: "titanic",
        releaseYear: 1997,
        genres: ["Drama", "Romance"],
        synopsis: "1997 romance drama film directed by James Cameron about two lovers aboard the ill-fated ship facing intense opposition and rivalry.",
        rating: 7.9,
        tropeTags: "Drama Romance love lovers",
        catalogSource: "Wikidata"
      },
      {
        id: "wiki-m-2",
        provider: "WIKIDATA",
        providerId: "Q134773",
        mediaType: "MOVIE",
        title: "Casablanca",
        normalizedTitle: "casablanca",
        releaseYear: 1942,
        genres: ["Romance", "Drama"],
        synopsis: "1942 romantic drama film set in WWII Casablanca with lovers reunited across hostile lines.",
        rating: 8.5,
        tropeTags: "Romance Drama love lovers",
        catalogSource: "Wikidata"
      },
      {
        id: "wiki-m-3",
        provider: "WIKIDATA",
        providerId: "Q133332",
        mediaType: "MOVIE",
        title: "The Matrix",
        normalizedTitle: "the matrix",
        releaseYear: 1999,
        genres: ["Thriller", "Science Fiction", "Action"],
        synopsis: "1999 American explosive sci-fi action thriller film.",
        rating: 8.7,
        tropeTags: "Thriller Science Fiction Action explosive",
        catalogSource: "Wikidata"
      },
      // 4b. Non-romance movie with incidental 'unexpected' in title
      {
        id: "wiki-m-4",
        provider: "WIKIDATA",
        providerId: "Q80379",
        mediaType: "MOVIE",
        title: "The Hobbit: An Unexpected Journey",
        normalizedTitle: "the hobbit an unexpected journey",
        releaseYear: 2012,
        genres: ["Adventure", "Action"],
        synopsis: "2012 fantasy action adventure film directed by Peter Jackson.",
        rating: 7.8,
        tropeTags: "Adventure Action",
        catalogSource: "Wikidata"
      },
      // 4c. Spy action movie with 'love' in title but zero romance genre
      {
        id: "wiki-m-5",
        provider: "WIKIDATA",
        providerId: "Q106571",
        mediaType: "MOVIE",
        title: "From Russia with Love",
        normalizedTitle: "from russia with love",
        releaseYear: 1963,
        genres: ["Action"],
        synopsis: "1963 British spy action thriller film featuring James Bond.",
        rating: 7.5,
        tropeTags: "Action Spy",
        catalogSource: "Wikidata"
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
          '${it.tropeTags}', '${it.catalogSource}', ${Date.now()}
        );
      `);
    }
  });

  describe("1. Explicit Media-Type Intent Enforcement", () => {
    it("infers MOVIE intent from natural English query and restricts results strictly to movies", async () => {
      const query = "I want a movie where enemies fall in love";
      const analysis = analyzeQuery(query);
      assert.strictEqual(analysis.inferredContentType, "MOVIE");

      const res = await repo.search({ query, mediaType: "ALL", limit: 5 });
      assert.ok(res.items.length > 0, "Expected movie results");
      // Star-Crossed is a TV series and MUST NOT be returned when user requested a movie
      for (const item of res.items) {
        assert.strictEqual(item.mediaType, "MOVIE", `Expected only movies, found ${item.mediaType}: ${item.title}`);
      }
      assert.strictEqual(res.items[0].mediaType, "MOVIE");

      // Semantic Romance check: Pure action movies (From Russia with Love) without romance must not rank #1
      assert.notStrictEqual(res.items[0].id, "wiki-m-5", "From Russia with Love (action spy) must not rank #1");
      // Top result must be a genuine romance film
      assert.ok(res.items[0].title === "Titanic" || res.items[0].title === "Casablanca");
    });

    it("infers MOVIE intent from Hinglish conversational queries and enforces romance genre over incidental title twist matches", async () => {
      const query = "mujhe ek romantic movie chahiye jisme unexpected twist ho";
      const analysis = analyzeQuery(query);
      assert.strictEqual(analysis.inferredContentType, "MOVIE");

      const res = await repo.search({ query, mediaType: "ALL", limit: 5 });
      assert.ok(res.items.length > 0);
      for (const item of res.items) {
        assert.strictEqual(item.mediaType, "MOVIE");
      }

      // The Hobbit has 'Unexpected' in title but is Action/Adventure with zero romance: must not rank #1!
      assert.notStrictEqual(res.items[0].id, "wiki-m-4", "The Hobbit must not rank #1 for a romantic movie query");
      assert.ok(res.items[0].title === "Titanic" || res.items[0].title === "Casablanca");
    });

    it("infers MOVIE intent from action queries", async () => {
      const actionQueries = [
        "mujhe ek dhamakedar action movie chahiye",
        "mujhe ek dhamakedar acton movi chahiye", // with typos
        "मुझे एक धमाकेदार एक्शन मूवी चाहिए"
      ];

      for (const query of actionQueries) {
        const analysis = analyzeQuery(query);
        assert.strictEqual(analysis.inferredContentType, "MOVIE");

        const res = await repo.search({ query, mediaType: "ALL", limit: 5 });
        assert.ok(res.items.length > 0, `Expected matches for query: ${query}`);
        for (const item of res.items) {
          assert.strictEqual(item.mediaType, "MOVIE");
        }
        assert.strictEqual(res.items[0].title, "The Matrix");
      }
    });

    it("infers MOVIE intent from Devanagari Hindi queries", async () => {
      const hindiQueries = [
        "मुझे एक रोमांटिक फिल्म चाहिए जिसमें अचानक ट्विस्ट आए",
        "मुझे एक धमाकेदार एक्शन मूवी चाहिए"
      ];

      for (const query of hindiQueries) {
        const analysis = analyzeQuery(query);
        assert.strictEqual(analysis.inferredContentType, "MOVIE");

        const res = await repo.search({ query, mediaType: "ALL", limit: 5 });
        assert.ok(res.items.length > 0);
        for (const item of res.items) {
          assert.strictEqual(item.mediaType, "MOVIE");
        }
      }
    });

    it("preserves explicit user UI filter as authoritative over conflicting query text", async () => {
      // User explicitly filtered for SERIES in UI, but natural query text says "movie"
      const res = await repo.search({
        query: "best movie about alien love",
        mediaType: "SERIES",
        limit: 5
      });

      for (const item of res.items) {
        assert.strictEqual(item.mediaType, "SERIES", "Authoritative UI filter SERIES must override query text");
      }
    });
  });

  describe("2. Story-Level False Positive Elimination", () => {
    it("disables single-token typo boost for 'time loopp reliving past' and prevents 'The Loop' from ranking #1", async () => {
      const query = "time loopp reliving past";
      const res = await repo.search({ query, mediaType: "ALL", limit: 5 });

      assert.ok(res.items.length > 0);
      // The Loop must NOT be #1
      assert.notStrictEqual(res.items[0].id, "tvmaze-2107", "The Loop must not rank #1 on narrative time loop query");

      // Being Erica, Tru Calling, and Day Break must rank above The Loop and The Kennedys
      const beingEricaRank = res.items.findIndex(i => i.id === "tvmaze-862");
      const truCallingRank = res.items.findIndex(i => i.id === "tvmaze-1007");
      const theLoopRank = res.items.findIndex(i => i.id === "tvmaze-2107");
      const kennedysRank = res.items.findIndex(i => i.id === "tvmaze-1238");

      assert.ok(beingEricaRank === 0 || beingEricaRank === 1, "Being Erica must rank in the top positions");
      assert.ok(truCallingRank !== -1, "Tru Calling must be present in top results");
      if (theLoopRank !== -1) {
        assert.ok(beingEricaRank < theLoopRank, "Being Erica must rank above The Loop");
        assert.ok(truCallingRank < theLoopRank, "Tru Calling must rank above The Loop");
      }
      if (kennedysRank !== -1) {
        assert.ok(beingEricaRank < kennedysRank, "Being Erica must rank above The Kennedys");
        assert.ok(truCallingRank < kennedysRank, "Tru Calling must rank above The Kennedys");
      }
    });

    it("ranks Day Break #1 for 'A person relives the same day again and again'", async () => {
      const query = "A person relives the same day again and again";
      const res = await repo.search({ query, mediaType: "ALL", limit: 5 });

      assert.ok(res.items.length > 0);
      assert.strictEqual(res.items[0].id, "tvmaze-485", "Day Break must rank #1 for reliving the same day");
      assert.strictEqual(res.items[0].title, "Day Break");
    });

    it("ranks Star-Crossed #1 for 'A hero falls in love with his enemy's daughter'", async () => {
      const query = "A hero falls in love with his enemy's daughter";
      const res = await repo.search({ query, mediaType: "ALL", limit: 5 });

      assert.ok(res.items.length > 0);
      assert.strictEqual(res.items[0].id, "tvmaze-189", "Star-Crossed (Romeo & Juliet alien hero + enemy daughter) must rank #1");
      assert.notStrictEqual(res.items[0]?.id, "tvmaze-2107", "The Loop must not match");
    });
  });
});
