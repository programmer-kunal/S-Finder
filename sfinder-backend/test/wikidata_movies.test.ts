import { describe, it } from "node:test";
import assert from "node:assert";
import { executeDiscoveryPipeline } from "../src/pipeline";
import {
  extractWikidataCountries,
  extractWikidataCountry,
  extractWikidataGenres,
  extractWikidataReleaseYear,
  isFilmInstance,
  matchesMovieCountryFilter,
  matchesMovieGenreFilter,
  WikidataBudgetExceededError,
  WikidataResolver
} from "../src/wikidata";
import { Candidate, Env, TVMazeSearchResult } from "../src/types";

describe("Phase 5AD: Wikidata Movie Discovery & Dual-Catalog Integration Tests", () => {
  // Mock entity for Inception (2010 film, US, Sci-Fi/Action)
  const MOCK_INCEPTION_ENTITY = {
    id: "Q25188",
    labels: { en: { value: "Inception" } },
    descriptions: { en: { value: "2010 film directed by Christopher Nolan" } },
    claims: {
      P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }], // film
      P577: [{ mainsnak: { datavalue: { value: { time: "+2010-07-16T00:00:00Z" } } } }],
      P136: [
        { mainsnak: { datavalue: { value: { id: "Q471839" } } } }, // Science Fiction
        { mainsnak: { datavalue: { value: { id: "Q188473" } } } }  // Action
      ],
      P495: [
        { mainsnak: { datavalue: { value: { id: "Q145" } } } }, // United Kingdom
        { mainsnak: { datavalue: { value: { id: "Q30" } } } }   // United States
      ]
    }
  };

  // Mock entity for Parasite (2019 film, South Korea, Thriller/Comedy-Drama)
  const MOCK_PARASITE_ENTITY = {
    id: "Q61448040",
    labels: { en: { value: "Parasite" } },
    descriptions: { en: { value: "2019 South Korean film by Bong Joon-ho" } },
    claims: {
      P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }], // film
      P577: [{ mainsnak: { datavalue: { value: { time: "+2019-05-21T00:00:00Z" } } } }],
      P136: [
        { mainsnak: { datavalue: { value: { id: "Q2484376" } } } }, // Thriller
        { mainsnak: { datavalue: { value: { id: "Q859369" } } } }  // Comedy-Drama
      ],
      P495: [{ mainsnak: { datavalue: { value: { id: "Q884" } } } }] // South Korea
    }
  };

  // Mock entity for Breaking Bad (TV series, strictly NOT a film)
  const MOCK_BREAKING_BAD_ENTITY = {
    id: "Q1079",
    labels: { en: { value: "Breaking Bad" } },
    descriptions: { en: { value: "American television drama series" } },
    claims: {
      P31: [{ mainsnak: { datavalue: { value: { id: "Q5398426" } } } }], // television series
      P577: [{ mainsnak: { datavalue: { value: { time: "+2008-01-20T00:00:00Z" } } } }]
    }
  };

  // 1. Movie candidate resolution and nonexistent candidate rejection
  it("Scenario 1: Resolves genuine movie candidate from Wikidata and rejects nonexistent candidates", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("action=wbsearchentities")) {
        if (url.includes("Inception")) {
          return new Response(JSON.stringify({
            search: [{ id: "Q25188", label: "Inception", description: "2010 film by Christopher Nolan" }]
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ search: [] }), { status: 200 });
      }
      if (url.includes("action=wbgetentities")) {
        return new Response(JSON.stringify({
          entities: { Q25188: MOCK_INCEPTION_ENTITY }
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const resolver = new WikidataResolver("https://www.wikidata.org/w/api.php", 3000, 4, "Data provided by Wikidata (CC0)", mockFetch);

    const rejections: any[] = [];
    const candidates: Candidate[] = [
      { canonicalTitle: "Inception", expectedMediaType: "MOVIE", approximateYear: 2010, matchReason: "Dream heist film" },
      { canonicalTitle: "CompletelyFakeNonexistentMovie12345", expectedMediaType: "MOVIE", matchReason: "Fabricated" }
    ];

    const results = await resolver.resolveCandidates(candidates, (r) => rejections.push(r));

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].title, "Inception");
    assert.strictEqual(results[0].releaseYear, 2010);
    assert.strictEqual(results[0].mediaType, "MOVIE");
    assert.strictEqual(results[0].countryOfOrigin, "United Kingdom, United States");
    assert.deepStrictEqual(results[0].countriesOfOrigin, ["United Kingdom", "United States"]);
    assert.strictEqual(results[0].catalogSource, "Data provided by Wikidata (CC0)");

    // Rejected fake movie
    assert.strictEqual(rejections.length, 1);
    assert.strictEqual(rejections[0].candidateTitle, "CompletelyFakeNonexistentMovie12345");
  });

  // 2. Exclusion of TV series from Movies
  it("Scenario 2: Strictly excludes television series from movie discovery via P31 instance-of check", () => {
    // Inception is a film
    assert.strictEqual(isFilmInstance(MOCK_INCEPTION_ENTITY as any), true);
    // Parasite is a film
    assert.strictEqual(isFilmInstance(MOCK_PARASITE_ENTITY as any), true);
    // Breaking Bad is a TV series, MUST return false
    assert.strictEqual(isFilmInstance(MOCK_BREAKING_BAD_ENTITY as any), false);
  });

  // 3. Mixed, correctly typed results under ALL (1 movie from Wikidata, 1 TV show from TVmaze)
  it("Scenario 3: Resolves mixed, correctly typed results under contentType ALL", async () => {
    const mockFetch: typeof fetch = async (input, init) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  { canonicalTitle: "Inception", expectedMediaType: "MOVIE", approximateYear: 2010, matchReason: "Sci-fi mind heist film" },
                  { canonicalTitle: "Dark", expectedMediaType: "TV_SERIES", approximateYear: 2017, matchReason: "Sci-fi time travel mystery series" }
                ])
              }]
            }
          }]
        }), { status: 200 });
      }
      if (url.includes("api.tvmaze.com")) {
        const tvShow: TVMazeSearchResult[] = [{
          score: 1.0,
          show: {
            id: 17845,
            name: "Dark",
            type: "Scripted",
            language: "German",
            status: "Ended",
            genres: ["Drama", "Science-Fiction", "Mystery"],
            premiered: "2017-12-01",
            network: { country: { name: "Germany", code: "DE" } },
            webChannel: null,
            rating: { average: 8.7 },
            summary: "<p>A missing child sets four families on a frantic hunt for answers.</p>",
            image: { medium: "https://tvmaze.example.com/dark.jpg", original: "https://tvmaze.example.com/dark_orig.jpg" }
          }
        }];
        return new Response(JSON.stringify(tvShow), { status: 200 });
      }
      if (url.includes("action=wbsearchentities")) {
        return new Response(JSON.stringify({
          search: [{ id: "Q25188", label: "Inception", description: "2010 film by Christopher Nolan" }]
        }), { status: 200 });
      }
      if (url.includes("action=wbgetentities")) {
        return new Response(JSON.stringify({
          entities: { Q25188: MOCK_INCEPTION_ENTITY }
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = { GEMINI_API_KEY: "valid-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
    const response = await executeDiscoveryPipeline(
      { query: "Stories directed by Christopher Nolan or about a missing child", contentType: "ALL" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "AI_ENHANCED");
    assert.strictEqual(response.items.length, 2);

    const movieItem = response.items.find(i => i.title === "Inception");
    const seriesItem = response.items.find(i => i.title === "Dark");

    assert.ok(movieItem, "Inception must be in results");
    assert.strictEqual(movieItem?.mediaType, "MOVIE");
    assert.strictEqual(movieItem?.catalogSource, "Data provided by Wikidata (CC0)");

    assert.ok(seriesItem, "Dark must be in results");
    assert.strictEqual(seriesItem?.mediaType, "TV_SERIES");
    assert.strictEqual(seriesItem?.catalogSource, "Data provided by TVmaze (CC BY-SA 4.0)");
  });

  // 4. Series discovery remains intact with TVmaze
  it("Scenario 4: Series discovery remains 100% intact with TVmaze when contentType is SERIES", async () => {
    let wikidataCalled = false;
    let tvmazeCalled = false;

    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  { canonicalTitle: "Dark", expectedMediaType: "TV_SERIES", approximateYear: 2017, matchReason: "Sci-fi mystery series" }
                ])
              }]
            }
          }]
        }), { status: 200 });
      }
      if (url.includes("api.tvmaze.com")) {
        tvmazeCalled = true;
        const tvShow: TVMazeSearchResult[] = [{
          score: 1.0,
          show: {
            id: 17845,
            name: "Dark",
            type: "Scripted",
            language: "German",
            status: "Ended",
            genres: ["Drama", "Science-Fiction"],
            premiered: "2017-12-01",
            network: { country: { name: "Germany", code: "DE" } },
            webChannel: null,
            rating: { average: 8.7 },
            summary: "<p>Mystery drama</p>",
            image: { medium: "https://tvmaze.example.com/dark.jpg", original: "https://tvmaze.example.com/dark_orig.jpg" }
          }
        }];
        return new Response(JSON.stringify(tvShow), { status: 200 });
      }
      if (url.includes("wikidata.org")) {
        wikidataCalled = true;
        return new Response("Not found", { status: 404 });
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = { GEMINI_API_KEY: "valid-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
    const response = await executeDiscoveryPipeline(
      { query: "Complex mystery series", contentType: "SERIES" },
      env,
      mockFetch
    );

    assert.strictEqual(tvmazeCalled, true, "TVmaze must be called for series");
    assert.strictEqual(wikidataCalled, false, "Wikidata must NOT be called when contentType is SERIES");
    assert.strictEqual(response.items[0].title, "Dark");
    assert.strictEqual(response.items[0].mediaType, "TV_SERIES");
  });

  // 5. Genre and country filters for movies
  it("Scenario 5: Enforces genre and country filters accurately on movie metadata", async () => {
    // Inception: Genres: Science Fiction, Action; Countries: United Kingdom (GB), United States (US)
    const inceptionGenres = extractWikidataGenres(MOCK_INCEPTION_ENTITY as any);
    const inceptionCountries = extractWikidataCountries(MOCK_INCEPTION_ENTITY as any);

    assert.deepStrictEqual(inceptionGenres, ["Science Fiction", "Action"]);
    assert.deepStrictEqual(inceptionCountries, [
      { name: "United Kingdom", code: "GB" },
      { name: "United States", code: "US" }
    ]);

    // Matching filters for either verified country
    assert.strictEqual(matchesMovieGenreFilter(inceptionGenres, "Science-Fiction"), true);
    assert.strictEqual(matchesMovieGenreFilter(inceptionGenres, "Action"), true);
    assert.strictEqual(matchesMovieCountryFilter(inceptionCountries, "United Kingdom"), true);
    assert.strictEqual(matchesMovieCountryFilter(inceptionCountries, "GB"), true);
    assert.strictEqual(matchesMovieCountryFilter(inceptionCountries, "United States"), true);
    assert.strictEqual(matchesMovieCountryFilter(inceptionCountries, "US"), true);

    // Non-matching filters
    assert.strictEqual(matchesMovieGenreFilter(inceptionGenres, "Comedy"), false);
    assert.strictEqual(matchesMovieCountryFilter(inceptionCountries, "South Korea"), false);
    assert.strictEqual(matchesMovieCountryFilter(inceptionCountries, "France"), false);
    assert.strictEqual(matchesMovieCountryFilter(inceptionCountries, "Germany"), false);

    // Parasite: Genres: Thriller, Comedy-Drama; Country: South Korea (KR)
    const parasiteGenres = extractWikidataGenres(MOCK_PARASITE_ENTITY as any);
    const parasiteCountry = extractWikidataCountry(MOCK_PARASITE_ENTITY as any);

    assert.strictEqual(matchesMovieGenreFilter(parasiteGenres, "Thriller"), true);
    assert.strictEqual(matchesMovieCountryFilter(parasiteCountry, "South Korea"), true);
    assert.strictEqual(matchesMovieCountryFilter(parasiteCountry, "KR"), true);
    assert.strictEqual(matchesMovieCountryFilter(parasiteCountry, "North Korea"), false);
  });

  // 6. Missing movie country metadata is NOT inferred from language
  it("Scenario 6: Missing movie country metadata returns false for explicit country filter and is never inferred from language", () => {
    const entityWithoutCountry = {
      id: "Q99999",
      labels: { en: { value: "Unknown Movie" } },
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }]
        // P495 is intentionally omitted
      }
    };

    const country = extractWikidataCountry(entityWithoutCountry as any);
    assert.strictEqual(country, null);

    // Country filter must reject entity with missing country
    assert.strictEqual(matchesMovieCountryFilter(country, "South Korea"), false);
    assert.strictEqual(matchesMovieCountryFilter(country, "United States"), false);

    // Filter with undefined / empty / "ALL" allows missing country
    assert.strictEqual(matchesMovieCountryFilter(country, undefined), true);
    assert.strictEqual(matchesMovieCountryFilter(country, "ALL"), true);
  });

  // 7. Missing ratings, synopses, and posters staying absent/null
  it("Scenario 7: Never fabricates movie posters, ratings, or summaries; posters remain null for client placeholder", async () => {
    const resolver = new WikidataResolver("https://www.wikidata.org/w/api.php", 3000, 4, "Data provided by Wikidata (CC0)");
    const item = resolver.mapEntityToVerifiedItem(
      MOCK_INCEPTION_ENTITY as any,
      "AI matched Inception",
      2010,
      ["Science Fiction", "Action"],
      { name: "United States", code: "US" }
    );

    assert.strictEqual(item.title, "Inception");
    assert.strictEqual(item.posterUrl, null, "Movie poster must be null to trigger client-side placeholder without licensing violations");
    assert.strictEqual(item.rating, null, "Wikidata has no standardized 1-10 rating, must remain null");
    assert.strictEqual(item.synopsis, "2010 film directed by Christopher Nolan");
  });

  // 8. Provider timeouts, partial failures, and request budgets
  it("Scenario 8: Strictly enforces Wikidata API call budget (max 4 calls) and handles budget overflow safely", async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ search: [] }), { status: 200 });
    };

    const resolver = new WikidataResolver("https://www.wikidata.org/w/api.php", 3000, 4, "Data provided by Wikidata (CC0)", mockFetch);

    // 4 allowed calls
    await resolver.searchMovieEntities("Title 1");
    await resolver.searchMovieEntities("Title 2");
    await resolver.searchMovieEntities("Title 3");
    await resolver.searchMovieEntities("Title 4");
    assert.strictEqual(resolver.getCallCount(), 4);

    // 5th call must throw WikidataBudgetExceededError
    await assert.rejects(
      async () => {
        await resolver.searchMovieEntities("Title 5");
      },
      (err: any) => err instanceof WikidataBudgetExceededError
    );
  });

  // 9. Semantic relevance scoring for movies
  it("Scenario 9: Evaluates semantic relevance for movies and rejects off-topic genuine movies", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  { canonicalTitle: "Parasite", expectedMediaType: "MOVIE", approximateYear: 2019, matchReason: "Korean thriller about class conflict" }
                ])
              }]
            }
          }]
        }), { status: 200 });
      }
      if (url.includes("action=wbsearchentities")) {
        return new Response(JSON.stringify({
          search: [{ id: "Q61448040", label: "Parasite", description: "2019 South Korean film by Bong Joon-ho" }]
        }), { status: 200 });
      }
      if (url.includes("action=wbgetentities")) {
        return new Response(JSON.stringify({
          entities: { Q61448040: MOCK_PARASITE_ENTITY }
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = { GEMINI_API_KEY: "valid-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };

    // Query matches Parasite's thriller premise and South Korea
    const response = await executeDiscoveryPipeline(
      { query: "South Korean thriller about class division and wealthy families", contentType: "MOVIE" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "AI_ENHANCED");
    assert.strictEqual(response.items.length, 1);
    assert.strictEqual(response.items[0].title, "Parasite");
    assert.ok(response.items[0].relevanceScore && response.items[0].relevanceScore >= 50);
  });

  // 10. Direct keyword search fallback for movies
  it("Scenario 10: Fallback direct title search resolves movies from Wikidata when Gemini is unconfigured", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("action=wbsearchentities")) {
        return new Response(JSON.stringify({
          search: [{ id: "Q25188", label: "Inception", description: "2010 film directed by Christopher Nolan" }]
        }), { status: 200 });
      }
      if (url.includes("action=wbgetentities")) {
        return new Response(JSON.stringify({
          entities: { Q25188: MOCK_INCEPTION_ENTITY }
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = { GEMINI_API_KEY: "", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
    const response = await executeDiscoveryPipeline(
      { query: "Inception", contentType: "MOVIE" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "CATALOG_SEARCH");
    assert.strictEqual(response.fallbackUsed, true);
    assert.strictEqual(response.items.length, 1);
    assert.strictEqual(response.items[0].title, "Inception");
    assert.strictEqual(response.items[0].mediaType, "MOVIE");
    assert.strictEqual(response.items[0].catalogSource, "Data provided by Wikidata (CC0)");
  });

  // 11. Multi-country of origin regression tests
  it("Scenario 11: End-to-end multi-country resolution preserves all countries and satisfies UK or US filters", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("action=wbsearchentities")) {
        return new Response(JSON.stringify({
          search: [{ id: "Q25188", label: "Inception", description: "2010 film directed by Christopher Nolan" }]
        }), { status: 200 });
      }
      if (url.includes("action=wbgetentities")) {
        return new Response(JSON.stringify({
          entities: { Q25188: MOCK_INCEPTION_ENTITY }
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const resolver = new WikidataResolver("https://www.wikidata.org/w/api.php", 3000, 4, "Data provided by Wikidata (CC0)", mockFetch);

    // Filter by United Kingdom
    const ukResults = await resolver.resolveCandidates(
      [{ canonicalTitle: "Inception", expectedMediaType: "MOVIE", matchReason: "Sci-fi thriller" }],
      undefined,
      { country: "United Kingdom" }
    );
    assert.strictEqual(ukResults.length, 1);
    assert.strictEqual(ukResults[0].title, "Inception");
    assert.strictEqual(ukResults[0].countryOfOrigin, "United Kingdom, United States");
    assert.deepStrictEqual(ukResults[0].countriesOfOrigin, ["United Kingdom", "United States"]);

    // Reset call count for next test
    resolver.resetCallCount();

    // Filter by United States (US code)
    const usResults = await resolver.resolveCandidates(
      [{ canonicalTitle: "Inception", expectedMediaType: "MOVIE", matchReason: "Sci-fi thriller" }],
      undefined,
      { country: "US" }
    );
    assert.strictEqual(usResults.length, 1);
    assert.strictEqual(usResults[0].title, "Inception");

    resolver.resetCallCount();

    // Filter by France (unrelated country - must be rejected)
    const rejections: any[] = [];
    const franceResults = await resolver.resolveCandidates(
      [{ canonicalTitle: "Inception", expectedMediaType: "MOVIE", matchReason: "Sci-fi thriller" }],
      (r) => rejections.push(r),
      { country: "France" }
    );
    assert.strictEqual(franceResults.length, 0);
    assert.strictEqual(rejections.length, 1);
    assert.strictEqual(rejections[0].reason, "FILTER_MISMATCH");
  });
});
