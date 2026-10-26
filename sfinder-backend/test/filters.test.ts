import { describe, it } from "node:test";
import assert from "node:assert";
import { executeDiscoveryPipeline } from "../src/pipeline";
import { matchesCountryFilter, matchesGenreFilter, TvMazeResolver } from "../src/tvmaze";
import { Candidate, Env, TVMazeSearchResult, TVMazeShow } from "../src/types";
import { MOCK_TVMAZE_AMBIGUOUS_DARK, MOCK_TVMAZE_K2 } from "./mocks";

describe("Phase 5AA: Smart Discovery Filters and Content-Type Priority Tests", () => {
  describe("Content-Type Priority & Capability-Awareness", () => {
    it("Phase 5AD: routes contentType MOVIE to movie discovery (calls Gemini with MOVIE constraints, does not call TVmaze)", async () => {
      let geminiCalled = false;
      let tvmazeCalled = false;
      let capturedPrompt = "";

      const mockFetch: typeof fetch = async (input, init) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          geminiCalled = true;
          const body = JSON.parse(init?.body as string);
          capturedPrompt = body.contents[0].parts[0].text;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify([
                          {
                            canonicalTitle: "Interstellar",
                            expectedMediaType: "MOVIE",
                            matchReason: "Sci-fi space travel movie"
                          }
                        ])
                      }
                    ]
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          tvmazeCalled = true;
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (url.includes("wikidata.org")) {
          return new Response(
            JSON.stringify({
              search: [{ id: "Q13417213", label: "Interstellar", description: "2014 film by Christopher Nolan" }],
              entities: {
                Q13417213: {
                  id: "Q13417213",
                  labels: { en: { value: "Interstellar" } },
                  descriptions: { en: { value: "2014 film directed by Christopher Nolan" } },
                  claims: {
                    P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
                    P577: [{ mainsnak: { datavalue: { value: { time: "+2014-11-05T00:00:00Z" } } } }]
                  }
                }
              }
            }),
            { status: 200 }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = {
        GEMINI_API_KEY: "mock-valid-key",
        PRIMARY_MODEL: "gemini-3.1-flash-lite"
      };

      const response = await executeDiscoveryPipeline(
        {
          query: "I want a blockbuster sci-fi space action film with starships",
          contentType: "MOVIE"
        },
        env,
        mockFetch
      );

      assert.strictEqual(geminiCalled, true, "Gemini MUST be called for movie discovery!");
      assert.strictEqual(tvmazeCalled, false, "TVmaze MUST NOT be called for movie discovery!");
      assert.ok(capturedPrompt.includes("STRICT CONTENT-TYPE CONSTRAINT: The user has selected the 'Movies' filter"));
      assert.strictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.items[0].mediaType, "MOVIE");
    });

    it("legacy category MOVIES also maps to MOVIE discovery", async () => {
      let geminiCalled = false;
      let tvmazeCalled = false;

      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          geminiCalled = true;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify([
                          {
                            canonicalTitle: "The Hangover",
                            expectedMediaType: "MOVIE",
                            matchReason: "Comedy movie"
                          }
                        ])
                      }
                    ]
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          tvmazeCalled = true;
          return new Response("OK", { status: 200 });
        }
        if (url.includes("wikidata.org")) {
          return new Response(
            JSON.stringify({
              search: [{ id: "Q219476", label: "The Hangover", description: "2009 comedy film" }],
              entities: {
                Q219476: {
                  id: "Q219476",
                  labels: { en: { value: "The Hangover" } },
                  descriptions: { en: { value: "2009 comedy film" } },
                  claims: {
                    P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
                    P136: [{ mainsnak: { datavalue: { value: { id: "Q157443" } } } }]
                  }
                }
              }
            }),
            { status: 200 }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = {
        GEMINI_API_KEY: "mock-valid-key",
        PRIMARY_MODEL: "gemini-3.1-flash-lite"
      };

      const response = await executeDiscoveryPipeline(
        {
          query: "Looking for a comedy film",
          category: "MOVIES"
        },
        env,
        mockFetch
      );

      assert.strictEqual(geminiCalled, true);
      assert.strictEqual(tvmazeCalled, false);
      assert.strictEqual(response.items[0].mediaType, "MOVIE");
    });

    it("MOVIE filter overrides contradictory query text asking for a television series", async () => {
      let capturedPrompt = "";
      const mockFetch: typeof fetch = async (input, init) => {
        const url = input.toString();
        if (url.includes("generativelanguage")) {
          const body = JSON.parse(init?.body as string);
          capturedPrompt = body.contents[0].parts[0].text;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify([
                          {
                            canonicalTitle: "True Detective",
                            expectedMediaType: "MOVIE",
                            matchReason: "Crime movie candidate"
                          }
                        ])
                      }
                    ]
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }
        if (url.includes("wikidata.org")) {
          // Returning True Detective as TV series Q5398426 which WikidataResolver will reject for MOVIE!
          return new Response(
            JSON.stringify({
              search: [{ id: "Q7847400", label: "True Detective" }],
              entities: {
                Q7847400: {
                  id: "Q7847400",
                  claims: {
                    P31: [{ mainsnak: { datavalue: { value: { id: "Q5398426" } } } }] // TV series!
                  }
                }
              }
            }),
            { status: 200 }
          );
        }
        return new Response("OK", { status: 200 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };

      const response = await executeDiscoveryPipeline(
        {
          query: "I want a 10-episode television series about detectives and prosecutors",
          contentType: "MOVIE"
        },
        env,
        mockFetch
      );

      assert.ok(capturedPrompt.includes("STRICT CONTENT-TYPE CONSTRAINT: The user has selected the 'Movies' filter"));
      // Candidate was a TV series according to Wikidata P31, so it should be rejected from movies!
      assert.strictEqual(response.items.length, 0);
    });

    it("SERIES filter overrides contradictory query text asking for a movie and enforces series constraints in prompt", async () => {
      let capturedPrompt = "";

      const mockFetch: typeof fetch = async (input, init) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          const body = JSON.parse(init?.body as string);
          capturedPrompt = body.contents[0].parts[0].text;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify([
                          {
                            canonicalTitle: "The K2",
                            expectedMediaType: "KDRAMA",
                            matchReason: "Bodyguard action series matching thriller premise"
                          }
                        ])
                      }
                    ]
                  }
                }
              ]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };

      const response = await executeDiscoveryPipeline(
        {
          query: "I want a movie about an ex-soldier bodyguard protecting an heiress",
          contentType: "SERIES"
        },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.resolvedCount, 1);
      assert.strictEqual(response.items[0].title, "The K2");
      // Check that prompt specifically commanded episodic series over the conflicting movie wording
      assert.ok(
        capturedPrompt.includes("STRICT CONTENT-TYPE CONSTRAINT: The user has selected the 'Series' filter"),
        "Prompt must include strict series constraint!"
      );
      assert.ok(
        capturedPrompt.includes("Even if the user's search text mentions 'movie' or 'film', you MUST NOT return movies"),
        "Prompt must instruct Gemini to forbid movies!"
      );
    });
  });

  describe("Genre and Country Filter Helpers", () => {
    const mockShowDark: TVMazeShow = {
      id: 17838,
      name: "Dark",
      type: "Scripted",
      language: "German",
      genres: ["Drama", "Mystery", "Science-Fiction", "Thriller"],
      status: "Ended",
      premiered: "2017-12-01",
      network: null,
      webChannel: { name: "Netflix", country: { name: "Germany", code: "DE" } },
      summary: "A missing child sets four families on a frantic hunt for answers."
    };

    const mockShowK2: TVMazeShow = {
      id: 20963,
      name: "The K2",
      type: "Scripted",
      language: "Korean",
      genres: ["Action", "Drama", "Thriller"],
      status: "Ended",
      premiered: "2016-09-23",
      network: { country: { name: "Korea, Republic of", code: "KR" } },
      webChannel: null,
      summary: "A former mercenary soldier is hired as a bodyguard."
    };

    it("matchesGenreFilter correctly validates matching and non-matching genres", () => {
      // Dark has Drama, Mystery, Science-Fiction, Thriller
      assert.strictEqual(matchesGenreFilter(mockShowDark, "Mystery"), true);
      assert.strictEqual(matchesGenreFilter(mockShowDark, "Sci-Fi"), true);
      assert.strictEqual(matchesGenreFilter(mockShowDark, "Drama"), true);
      assert.strictEqual(matchesGenreFilter(mockShowDark, "Comedy"), false);
      assert.strictEqual(matchesGenreFilter(mockShowDark, "Horror"), false);
      assert.strictEqual(matchesGenreFilter(mockShowDark, "ANY"), true);
      assert.strictEqual(matchesGenreFilter(mockShowDark, undefined), true);

      // The K2 has Action, Drama, Thriller
      assert.strictEqual(matchesGenreFilter(mockShowK2, "Action"), true);
      assert.strictEqual(matchesGenreFilter(mockShowK2, "Animation / Anime"), false);
    });

    it("matchesCountryFilter correctly validates matching and non-matching countries", () => {
      // Dark is from Germany (DE)
      assert.strictEqual(matchesCountryFilter(mockShowDark, "Germany"), true);
      assert.strictEqual(matchesCountryFilter(mockShowDark, "South Korea"), false);
      assert.strictEqual(matchesCountryFilter(mockShowDark, "United States"), false);
      assert.strictEqual(matchesCountryFilter(mockShowDark, "ANY"), true);

      // The K2 is from South Korea (KR, Korean language)
      assert.strictEqual(matchesCountryFilter(mockShowK2, "South Korea"), true);
      assert.strictEqual(matchesCountryFilter(mockShowK2, "Korea"), true);
      assert.strictEqual(matchesCountryFilter(mockShowK2, "Japan"), false);
      assert.strictEqual(matchesCountryFilter(mockShowK2, "United Kingdom"), false);

      // Extended countries beyond initial shortlist: Australia, Sweden, Brazil, Italy
      const mockShowAussie: TVMazeShow = {
        id: 9901,
        name: "Mystery Road",
        type: "Scripted",
        language: "English",
        genres: ["Drama", "Mystery"],
        status: "Ended",
        premiered: "2018-06-03",
        network: { country: { name: "Australia", code: "AU" } },
        summary: "An Indigenous detective investigates mysteries."
      };
      assert.strictEqual(matchesCountryFilter(mockShowAussie, "Australia"), true);
      assert.strictEqual(matchesCountryFilter(mockShowAussie, "AU"), true);
      assert.strictEqual(matchesCountryFilter(mockShowAussie, "United States"), false);

      const mockShowBrazil: TVMazeShow = {
        id: 9902,
        name: "3%",
        type: "Scripted",
        language: "Portuguese",
        genres: ["Action", "Sci-Fi"],
        status: "Ended",
        premiered: "2016-11-25",
        webChannel: { name: "Netflix", country: { name: "Brazil", code: "BR" } },
        summary: "A dystopian thriller set in Brazil."
      };
      assert.strictEqual(matchesCountryFilter(mockShowBrazil, "Brazil"), true);
      assert.strictEqual(matchesCountryFilter(mockShowBrazil, "BR"), true);
      assert.strictEqual(matchesCountryFilter(mockShowBrazil, "Portugal"), false);

      // Defensively verify: Missing country metadata CANNOT falsely satisfy explicit country filter,
      // and language is NOT inferred as country
      const mockShowNoCountry: TVMazeShow = {
        id: 9903,
        name: "Global Streamer Mystery",
        type: "Scripted",
        language: "Korean", // Language alone must not satisfy Korea filter
        genres: ["Mystery"],
        status: "Running",
        premiered: "2023-01-01",
        network: null,
        webChannel: null, // Zero country evidence
        summary: "A show with no network or webChannel country metadata."
      };
      assert.strictEqual(
        matchesCountryFilter(mockShowNoCountry, "South Korea"),
        false,
        "Missing country metadata must return false even if language matches!"
      );
      assert.strictEqual(
        matchesCountryFilter(mockShowNoCountry, "ANY"),
        true,
        "ANY country filter must accept titles with missing country metadata"
      );
    });

    it("Phase 5AA.2: Strictly avoids false-positive country matches and enforces exact identity", () => {
      // 1. Guinea vs Equatorial Guinea
      const mockEqGuinea: TVMazeShow = {
        id: 9910,
        name: "Malabo Beat",
        type: "Scripted",
        language: "Spanish",
        genres: ["Drama"],
        status: "Ended",
        premiered: "2020-01-01",
        network: { country: { name: "Equatorial Guinea", code: "GQ" } },
        summary: "A show from Equatorial Guinea."
      };
      assert.strictEqual(matchesCountryFilter(mockEqGuinea, "Guinea"), false, "Guinea must NOT match Equatorial Guinea!");
      assert.strictEqual(matchesCountryFilter(mockEqGuinea, "GN"), false, "GN code must NOT match Equatorial Guinea!");
      assert.strictEqual(matchesCountryFilter(mockEqGuinea, "Equatorial Guinea"), true);
      assert.strictEqual(matchesCountryFilter(mockEqGuinea, "GQ"), true);

      // 2. Congo (Republic of the Congo) vs Democratic Republic of the Congo
      const mockCongoRep: TVMazeShow = {
        id: 9911,
        name: "Brazzaville Nights",
        type: "Scripted",
        language: "French",
        genres: ["Drama"],
        status: "Ended",
        premiered: "2019-01-01",
        network: { country: { name: "Republic of the Congo", code: "CG" } },
        summary: "Show from Republic of the Congo."
      };
      const mockDrc: TVMazeShow = {
        id: 9912,
        name: "Kinshasa Symphony",
        type: "Scripted",
        language: "French",
        genres: ["Music", "Drama"],
        status: "Ended",
        premiered: "2021-01-01",
        network: { country: { name: "Democratic Republic of the Congo", code: "CD" } },
        summary: "Show from DRC."
      };
      assert.strictEqual(matchesCountryFilter(mockCongoRep, "Democratic Republic of the Congo"), false);
      assert.strictEqual(matchesCountryFilter(mockCongoRep, "DR Congo"), false);
      assert.strictEqual(matchesCountryFilter(mockCongoRep, "CD"), false);
      assert.strictEqual(matchesCountryFilter(mockCongoRep, "Republic of the Congo"), true);
      assert.strictEqual(matchesCountryFilter(mockCongoRep, "CG"), true);

      assert.strictEqual(matchesCountryFilter(mockDrc, "Republic of the Congo"), false);
      assert.strictEqual(matchesCountryFilter(mockDrc, "CG"), false);
      assert.strictEqual(matchesCountryFilter(mockDrc, "Democratic Republic of the Congo"), true);
      assert.strictEqual(matchesCountryFilter(mockDrc, "DR Congo"), true);
      assert.strictEqual(matchesCountryFilter(mockDrc, "CD"), true);

      // 3. North Korea vs South Korea
      const mockNorthKorea: TVMazeShow = {
        id: 9913,
        name: "Pyongyang Stories",
        type: "Scripted",
        language: "Korean",
        genres: ["Drama"],
        status: "Ended",
        premiered: "2015-01-01",
        network: { country: { name: "Democratic People's Republic of Korea", code: "KP" } },
        summary: "Show from DPRK."
      };
      assert.strictEqual(matchesCountryFilter(mockNorthKorea, "South Korea"), false, "North Korea must NOT match South Korea!");
      assert.strictEqual(matchesCountryFilter(mockNorthKorea, "KR"), false, "North Korea must NOT match KR code!");
      assert.strictEqual(matchesCountryFilter(mockNorthKorea, "North Korea"), true);
      assert.strictEqual(matchesCountryFilter(mockNorthKorea, "KP"), true);

      // Also ensure South Korea does not match North Korea
      assert.strictEqual(matchesCountryFilter(mockShowK2, "North Korea"), false, "South Korea must NOT match North Korea!");
      assert.strictEqual(matchesCountryFilter(mockShowK2, "KP"), false, "South Korea must NOT match KP code!");

      // 4. ISO Code substring false-positive prevention (e.g. 'IN' inside Finland or Argentina)
      const mockFinland: TVMazeShow = {
        id: 9914,
        name: "Deadwind",
        type: "Scripted",
        language: "Finnish",
        genres: ["Crime", "Drama"],
        status: "Ended",
        premiered: "2018-03-14",
        network: { country: { name: "Finland", code: "FI" } },
        summary: "Crime show from Finland."
      };
      assert.strictEqual(matchesCountryFilter(mockFinland, "IN"), false, "Finland must NOT match 'IN' code!");
      assert.strictEqual(matchesCountryFilter(mockFinland, "India"), false, "Finland must NOT match India!");
      assert.strictEqual(matchesCountryFilter(mockFinland, "Finland"), true);
      assert.strictEqual(matchesCountryFilter(mockFinland, "FI"), true);

      // 5. Niger vs Nigeria
      const mockNiger: TVMazeShow = {
        id: 9915,
        name: "Sahel Tales",
        type: "Scripted",
        language: "French",
        genres: ["Drama"],
        status: "Ended",
        premiered: "2022-01-01",
        network: { country: { name: "Niger", code: "NE" } },
        summary: "Show from Niger."
      };
      assert.strictEqual(matchesCountryFilter(mockNiger, "Nigeria"), false, "Niger must NOT match Nigeria!");
      assert.strictEqual(matchesCountryFilter(mockNiger, "NG"), false, "Niger must NOT match NG code!");
      assert.strictEqual(matchesCountryFilter(mockNiger, "Niger"), true);
      assert.strictEqual(matchesCountryFilter(mockNiger, "NE"), true);

      // 6. Legitimate Aliases (Türkiye / Turkey, UK / United Kingdom / Great Britain)
      const mockTurkey: TVMazeShow = {
        id: 9916,
        name: "Yargı",
        type: "Scripted",
        language: "Turkish",
        genres: ["Drama", "Crime"],
        status: "Ended",
        premiered: "2021-09-19",
        network: { country: { name: "Turkey", code: "TR" } },
        summary: "Turkish prosecutor drama."
      };
      assert.strictEqual(matchesCountryFilter(mockTurkey, "Türkiye"), true, "Türkiye must match Turkey!");
      assert.strictEqual(matchesCountryFilter(mockTurkey, "Turkey"), true);
      assert.strictEqual(matchesCountryFilter(mockTurkey, "TR"), true);

      const mockUK: TVMazeShow = {
        id: 9917,
        name: "Broadchurch",
        type: "Scripted",
        language: "English",
        genres: ["Crime", "Drama"],
        status: "Ended",
        premiered: "2013-03-04",
        network: { country: { name: "United Kingdom", code: "GB" } },
        summary: "British detective drama."
      };
      assert.strictEqual(matchesCountryFilter(mockUK, "United Kingdom"), true);
      assert.strictEqual(matchesCountryFilter(mockUK, "UK"), true);
      assert.strictEqual(matchesCountryFilter(mockUK, "Great Britain"), true);
      assert.strictEqual(matchesCountryFilter(mockUK, "GB"), true);
      assert.strictEqual(matchesCountryFilter(mockUK, "US"), false);
    });
  });

  describe("Post-Catalog Filter Verification & Rejection Reporting", () => {
    it("rejects candidate with FILTER_MISMATCH when catalog metadata does not match requested genre", async () => {
      const resolver = new TvMazeResolver("https://api.tvmaze.com", 5000, 4, "TVmaze", async () => {
        // Return The K2 which has genres: Action, Drama, Thriller
        return new Response(JSON.stringify(MOCK_TVMAZE_K2), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      });

      const candidates: Candidate[] = [
        {
          canonicalTitle: "The K2",
          approximateYear: 2016,
          expectedMediaType: "KDRAMA",
          matchReason: "Action bodyguard drama"
        }
      ];

      const rejections: any[] = [];
      // Request Comedy genre
      const resolved = await resolver.resolveCandidates(
        candidates,
        (r) => rejections.push(r),
        { genre: "Comedy" }
      );

      assert.strictEqual(resolved.length, 0, "Show should be rejected because it lacks Comedy genre");
      assert.strictEqual(rejections.length, 1);
      assert.strictEqual(rejections[0].candidateTitle, "The K2");
      assert.strictEqual(rejections[0].reason, "FILTER_MISMATCH");
    });

    it("rejects candidate with FILTER_MISMATCH when catalog metadata does not match requested country", async () => {
      const resolver = new TvMazeResolver("https://api.tvmaze.com", 5000, 4, "TVmaze", async () => {
        // Return The K2 (South Korea)
        return new Response(JSON.stringify(MOCK_TVMAZE_K2), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      });

      const candidates: Candidate[] = [
        {
          canonicalTitle: "The K2",
          approximateYear: 2016,
          expectedMediaType: "KDRAMA",
          matchReason: "Action bodyguard drama"
        }
      ];

      const rejections: any[] = [];
      // Request Turkey country
      const resolved = await resolver.resolveCandidates(
        candidates,
        (r) => rejections.push(r),
        { country: "Turkey" }
      );

      assert.strictEqual(resolved.length, 0, "Show should be rejected because it is not from Turkey");
      assert.strictEqual(rejections.length, 1);
      assert.strictEqual(rejections[0].candidateTitle, "The K2");
      assert.strictEqual(rejections[0].reason, "FILTER_MISMATCH");
    });

    it("accepts candidate when both genre and country filters match catalog record", async () => {
      const resolver = new TvMazeResolver("https://api.tvmaze.com", 5000, 4, "TVmaze", async () => {
        // Return The K2 (Action, South Korea)
        return new Response(JSON.stringify(MOCK_TVMAZE_K2), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      });

      const candidates: Candidate[] = [
        {
          canonicalTitle: "The K2",
          approximateYear: 2016,
          expectedMediaType: "KDRAMA",
          matchReason: "Action bodyguard drama"
        }
      ];

      const rejections: any[] = [];
      const resolved = await resolver.resolveCandidates(
        candidates,
        (r) => rejections.push(r),
        { genre: "Action", country: "South Korea" }
      );

      assert.strictEqual(resolved.length, 1);
      assert.strictEqual(resolved[0].title, "The K2");
      assert.strictEqual(rejections.length, 0);
    });
  });

  describe("End-to-End Pipeline Filter Scenarios", () => {
    it("passes structured genre and country constraints to Gemini and TVmaze resolver", async () => {
      let promptText = "";

      const mockFetch: typeof fetch = async (input, init) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          const body = JSON.parse(init?.body as string);
          promptText = body.contents[0].parts[0].text;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify([
                          {
                            canonicalTitle: "Dark",
                            approximateYear: 2017,
                            expectedMediaType: "TV_SERIES",
                            matchReason: "Time travel mystery set in Germany"
                          }
                        ])
                      }
                    ]
                  }
                }
              ]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_AMBIGUOUS_DARK), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };

      const response = await executeDiscoveryPipeline(
        {
          query: "A missing child sets four families on a frantic hunt for answers",
          contentType: "SERIES",
          genre: "Mystery",
          country: "Germany"
        },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.resolvedCount, 1);
      assert.strictEqual(response.items[0].title, "Dark");

      // Verify prompt included both constraints
      assert.ok(promptText.includes("STRICT GENRE CONSTRAINT: The user has specified the genre 'Mystery'"));
      assert.ok(promptText.includes("STRICT COUNTRY CONSTRAINT: The user has specified the country/region 'Germany'"));
    });
  });
});
