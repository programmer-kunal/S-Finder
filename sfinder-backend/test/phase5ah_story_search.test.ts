import assert from "node:assert";
import { describe, it } from "node:test";
import { executeDiscoveryPipeline } from "../src/pipeline";
import { evaluateSemanticRelevance } from "../src/relevance";
import { Candidate, Env, VerifiedEntertainmentItem } from "../src/types";

describe("Phase 5AH: Story-Based Discovery Quality & Exact Query Regression Tests", () => {
  const QUERY = "a hero falls in love with his enemy's daughter";

  // Fixture: Diverse candidates representing genuine story matches across movies & TV series
  const MOCK_GEMINI_CANDIDATES: Candidate[] = [
    {
      canonicalTitle: "Spider-Man: Homecoming",
      expectedMediaType: "MOVIE",
      confidenceScore: 0.9,
      matchReason: "Peter Parker falls in love with Liz, whose father is his nemesis the Vulture."
    },
    {
      canonicalTitle: "Arrow",
      expectedMediaType: "TV_SERIES",
      confidenceScore: 0.85,
      matchReason: "Vigilante hero Oliver Queen falls for Helena Bertinelli, daughter of a mob boss."
    },
    {
      canonicalTitle: "Romeo + Juliet",
      expectedMediaType: "MOVIE",
      confidenceScore: 0.95,
      matchReason: "Star-crossed lovers from rival warring families fall deeply in love."
    },
    {
      canonicalTitle: "Romeo and Juliet", // Duplicate adaptation to test deduplication!
      expectedMediaType: "MOVIE",
      confidenceScore: 0.9,
      matchReason: "Tragic romance between children of opposing feuding families."
    },
    {
      canonicalTitle: "Daredevil",
      expectedMediaType: "TV_SERIES",
      confidenceScore: 0.8,
      matchReason: "Matt Murdock falls in love with Elektra, connected to his criminal enemies."
    },
    {
      canonicalTitle: "The Great British Baking Show", // Adversarial unrelated title
      expectedMediaType: "TV_SERIES",
      confidenceScore: 0.1,
      matchReason: "Bakers compete in a tent to impress judges with cakes and pastries."
    }
  ];

  it("Semantic Relevance: correctly accepts genuine plot candidates and rejects unrelated titles", () => {
    // 1. Spider-Man: Homecoming (Movie)
    const spiderManItem: VerifiedEntertainmentItem = {
      id: "wikidata-Q23013852",
      title: "Spider-Man: Homecoming",
      releaseYear: 2017,
      mediaType: "MOVIE",
      genres: ["Action", "Adventure", "Science Fiction"],
      synopsis: "Peter Parker tries to balance high school life with being the hero Spider-Man as he battles the Vulture.",
      matchExplanation: "Peter Parker falls in love with Liz, whose father is his nemesis the Vulture.",
      catalogSource: "Data provided by Wikidata (CC0)"
    };

    const spideyRel = evaluateSemanticRelevance(QUERY, MOCK_GEMINI_CANDIDATES[0], spiderManItem);
    assert.strictEqual(spideyRel.isAccepted, true);
    assert.ok(spideyRel.score >= 20, `Spider-Man score was ${spideyRel.score}, expected >= 20`);

    // 2. Arrow (TV Series)
    const arrowItem: VerifiedEntertainmentItem = {
      id: "tvmaze-4",
      title: "Arrow",
      releaseYear: 2012,
      mediaType: "TV_SERIES",
      genres: ["Drama", "Action", "Crime"],
      synopsis: "After a violent shipwreck, billionaire playboy Oliver Queen was missing and presumed dead for five years before being discovered alive...",
      matchExplanation: "Vigilante hero Oliver Queen falls for Helena Bertinelli, daughter of a mob boss.",
      catalogSource: "Data provided by TVmaze (CC BY-SA 4.0)"
    };

    const arrowRel = evaluateSemanticRelevance(QUERY, MOCK_GEMINI_CANDIDATES[1], arrowItem);
    assert.strictEqual(arrowRel.isAccepted, true);
    assert.ok(arrowRel.score >= 20, `Arrow score was ${arrowRel.score}, expected >= 20`);

    // 3. Romeo + Juliet (Movie)
    const rjItem: VerifiedEntertainmentItem = {
      id: "wikidata-Q463313",
      title: "Romeo + Juliet",
      releaseYear: 1996,
      mediaType: "MOVIE",
      genres: ["Drama", "Romance"],
      synopsis: "Two young star-crossed lovers fall in love despite their families' feud.",
      matchExplanation: "Star-crossed lovers from rival warring families fall deeply in love.",
      catalogSource: "Data provided by Wikidata (CC0)"
    };

    const rjRel = evaluateSemanticRelevance(QUERY, MOCK_GEMINI_CANDIDATES[2], rjItem);
    assert.strictEqual(rjRel.isAccepted, true);
    assert.ok(rjRel.score >= 20, `Romeo+Juliet score was ${rjRel.score}, expected >= 20`);

    // 4. Adversarial check: The Great British Baking Show
    const bakingItem: VerifiedEntertainmentItem = {
      id: "tvmaze-1234",
      title: "The Great British Baking Show",
      releaseYear: 2010,
      mediaType: "TV_SERIES",
      genres: ["Food"],
      synopsis: "Amateur bakers take part in a bake-off in an attempt to be named Britain's best amateur baker.",
      matchExplanation: "Bakers compete in a tent to impress judges with cakes and pastries.",
      catalogSource: "Data provided by TVmaze (CC BY-SA 4.0)"
    };

    const bakingRel = evaluateSemanticRelevance(QUERY, MOCK_GEMINI_CANDIDATES[5], bakingItem);
    assert.strictEqual(bakingRel.isAccepted, false);
    assert.strictEqual(bakingRel.rejectionReason, "LOW_SEMANTIC_RELEVANCE");
    assert.strictEqual(bakingRel.score, 0);
  });

  it("Pipeline End-to-End: Resolves diverse, multi-catalog results and deduplicates adaptations", async () => {
    let wikidataCalls = 0;
    let tvmazeCalls = 0;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = input.toString();

      // Gemini candidate mock
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify(MOCK_GEMINI_CANDIDATES)
              }]
            }
          }]
        }));
      }

      // Wikidata mock (Movies)
      if (url.includes("wikidata.org")) {
        wikidataCalls++;
        if (url.includes("wbsearchentities")) {
          if (url.includes("Spider-Man") || url.includes("Homecoming")) {
            return new Response(JSON.stringify({
              search: [{ id: "Q23013852", label: "Spider-Man: Homecoming", description: "2017 superhero film" }]
            }));
          }
          if (url.includes("Romeo")) {
            return new Response(JSON.stringify({
              search: [{ id: "Q463313", label: "Romeo + Juliet", description: "1996 romantic drama film" }]
            }));
          }
          return new Response(JSON.stringify({ search: [] }));
        }

        if (url.includes("wbgetentities")) {
          return new Response(JSON.stringify({
            entities: {
              "Q23013852": {
                id: "Q23013852",
                labels: { en: { value: "Spider-Man: Homecoming" } },
                descriptions: { en: { value: "2017 superhero film" } },
                claims: {
                  P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
                  P577: [{ mainsnak: { datavalue: { value: { time: "+2017-07-07T00:00:00Z" } } } }],
                  P136: [{ mainsnak: { datavalue: { value: { id: "Q188451" } } } }], // Action
                  P495: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }] // US
                }
              },
              "Q463313": {
                id: "Q463313",
                labels: { en: { value: "Romeo + Juliet" } },
                descriptions: { en: { value: "1996 romantic drama film" } },
                claims: {
                  P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
                  P577: [{ mainsnak: { datavalue: { value: { time: "+1996-11-01T00:00:00Z" } } } }],
                  P136: [{ mainsnak: { datavalue: { value: { id: "Q130232" } } } }], // Drama
                  P495: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }] // US
                }
              }
            }
          }));
        }
      }

      // TVmaze mock (Series)
      if (url.includes("api.tvmaze.com")) {
        tvmazeCalls++;
        if (url.includes("Arrow")) {
          return new Response(JSON.stringify([
            {
              score: 0.9,
              show: {
                id: 4,
                name: "Arrow",
                type: "Scripted",
                genres: ["Drama", "Action", "Crime"],
                premiered: "2012-10-10",
                rating: { average: 7.4 },
                summary: "<p>Billionaire playboy Oliver Queen returns to clean up his city from corrupt mob enemies.</p>",
                network: { country: { name: "United States", code: "US" } }
              }
            }
          ]));
        }
        if (url.includes("Daredevil")) {
          return new Response(JSON.stringify([
            {
              score: 0.88,
              show: {
                id: 501,
                name: "Daredevil",
                type: "Scripted",
                genres: ["Action", "Crime", "Drama"],
                premiered: "2015-04-10",
                rating: { average: 8.6 },
                summary: "<p>A blind lawyer by day fights crime as vigilante Daredevil against mob enemies by night.</p>",
                network: { country: { name: "United States", code: "US" } }
              }
            }
          ]));
        }
        if (url.includes("Baking")) {
          return new Response(JSON.stringify([
            {
              score: 0.8,
              show: {
                id: 1234,
                name: "The Great British Baking Show",
                type: "Reality",
                genres: ["Food"],
                premiered: "2010-08-17",
                rating: { average: 8.5 },
                summary: "<p>Bakers compete with cakes and pastries.</p>",
                network: { country: { name: "United Kingdom", code: "GB" } }
              }
            }
          ]));
        }
        return new Response(JSON.stringify([]));
      }

      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-gemini-key",
      MAX_CANDIDATES: "6",
      MAX_TVMAZE_CALLS: "6"
    };

    const response = await executeDiscoveryPipeline(
      { query: QUERY, contentType: "ALL" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "AI_ENHANCED");
    assert.strictEqual(response.fallbackUsed, false);
    // Should have verified items from BOTH Wikidata (movies) and TVmaze (series)
    assert.ok(response.items.length >= 3, `Expected at least 3 resolved items, got ${response.items.length}`);

    const titles = response.items.map(i => i.title);
    assert.ok(titles.includes("Spider-Man: Homecoming"), "Must include Spider-Man: Homecoming");
    assert.ok(titles.includes("Arrow"), "Must include Arrow");
    assert.ok(titles.includes("Romeo + Juliet"), "Must include Romeo + Juliet");
    // Must NOT include the baking show (adversarial rejection)
    assert.strictEqual(titles.includes("The Great British Baking Show"), false, "Baking show must be rejected");

    // Check media types are correctly preserved
    const spidey = response.items.find(i => i.title === "Spider-Man: Homecoming");
    assert.strictEqual(spidey?.mediaType, "MOVIE");
    const arrow = response.items.find(i => i.title === "Arrow");
    assert.strictEqual(arrow?.mediaType, "TV_SERIES");

    // Call budgets must be respected
    assert.ok(tvmazeCalls <= 6, `TVmaze calls (${tvmazeCalls}) exceeded 6`);
    assert.ok(wikidataCalls <= 12, `Wikidata calls (${wikidataCalls}) exceeded 12`);
  });

  it("Pipeline Strict Content-Type: MOVIES returns only movies, SERIES returns only series", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  { canonicalTitle: "Spider-Man: Homecoming", expectedMediaType: "MOVIE", confidenceScore: 0.9, matchReason: "Plot match" }
                ])
              }]
            }
          }]
        }));
      }
      if (url.includes("wikidata.org")) {
        if (url.includes("wbsearchentities")) {
          return new Response(JSON.stringify({
            search: [{ id: "Q23013852", label: "Spider-Man: Homecoming" }]
          }));
        }
        if (url.includes("wbgetentities")) {
          return new Response(JSON.stringify({
            entities: {
              "Q23013852": {
                id: "Q23013852",
                labels: { en: { value: "Spider-Man: Homecoming" } },
                descriptions: { en: { value: "2017 superhero film" } },
                claims: {
                  P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
                  P136: [{ mainsnak: { datavalue: { value: { id: "Q188451" } } } }]
                }
              }
            }
          }));
        }
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = { GEMINI_API_KEY: "mock-key", MAX_CANDIDATES: "6" };
    const res = await executeDiscoveryPipeline({ query: QUERY, contentType: "MOVIE" }, env, mockFetch);
    assert.strictEqual(res.mode, "AI_ENHANCED");
    assert.strictEqual(res.items.length, 1);
    assert.strictEqual(res.items[0].mediaType, "MOVIE");
  });
});
