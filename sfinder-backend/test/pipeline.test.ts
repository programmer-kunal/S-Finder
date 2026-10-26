import { describe, it } from "node:test";
import assert from "node:assert";
import { executeDiscoveryPipeline, isDirectCatalogQuery } from "../src/pipeline";
import { Env } from "../src/types";
import {
  MOCK_GEMINI_VALID_RESPONSE,
  MOCK_TVMAZE_AMBIGUOUS_DARK,
  MOCK_TVMAZE_K2,
  MOCK_TVMAZE_YARGI
} from "./mocks";

describe("Discovery Pipeline Integration Tests", () => {
  it("executes successful AI_ENHANCED search and filters out hallucinated candidates", async () => {
    let tvmazeCallCount = 0;

    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();

      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify(MOCK_GEMINI_VALID_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.includes("api.tvmaze.com")) {
        tvmazeCallCount++;
        if (url.includes("K2")) return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        if (url.includes("Dark")) return new Response(JSON.stringify(MOCK_TVMAZE_AMBIGUOUS_DARK));
        if (url.includes("Yargi")) return new Response(JSON.stringify(MOCK_TVMAZE_YARGI));
        // Hallucinated title returns empty array
        return new Response(JSON.stringify([]));
      }

      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-valid-key",
      PRIMARY_MODEL: "gemini-3.5-flash-lite",
      MAX_CANDIDATES: "4",
      MAX_TVMAZE_CALLS: "4"
    };

    const response = await executeDiscoveryPipeline(
      { query: "A bodyguard protects a rich heiress, a German cave time loop, and a prosecutor investigating a murder", category: "ALL" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "AI_ENHANCED");
    assert.strictEqual(response.fallbackUsed, false);
    // 3 verified shows resolved: The K2, Dark, Yargi. "Nonexistent Phantom Show" discarded!
    assert.strictEqual(response.resolvedCount, 3);
    assert.strictEqual(response.items.length, 3);
    assert.strictEqual(response.items[0].title, "The K2");
    assert.strictEqual(response.items[1].title, "Dark");
    assert.strictEqual(response.items[2].title, "Yargı");
    assert.ok(tvmazeCallCount <= 4, `TVmaze call count was ${tvmazeCallCount}, exceeded 4!`);
  });

  it("gracefully falls back to CATALOG_SEARCH when Gemini returns HTTP 429 quota error", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();

      if (url.includes("generativelanguage.googleapis.com")) {
        // Upstream returns 429
        return new Response(JSON.stringify({ error: { code: 429, message: "RESOURCE_EXHAUSTED" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.includes("api.tvmaze.com")) {
        // Fallback direct keyword query
        return new Response(JSON.stringify(MOCK_TVMAZE_K2));
      }

      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-valid-key",
      PRIMARY_MODEL: "gemini-3.5-flash-lite"
    };

    const response = await executeDiscoveryPipeline(
      { query: "The K2", category: "KDRAMA" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "CATALOG_SEARCH");
    assert.strictEqual(response.fallbackUsed, true);
    assert.strictEqual(response.resolvedCount, 1);
    assert.strictEqual(response.items[0].title, "The K2");
    assert.ok(response.disclaimer.includes("AI semantic matching is resting. Showing direct title matches."));
  });

  it("gracefully falls back to CATALOG_SEARCH when Gemini key is unconfigured", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("api.tvmaze.com")) {
        return new Response(JSON.stringify(MOCK_TVMAZE_YARGI));
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "" // No key provided
    };

    const response = await executeDiscoveryPipeline(
      { query: "Yargi", category: "TURKISH_DRAMA" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "CATALOG_SEARCH");
    assert.strictEqual(response.fallbackUsed, true);
    assert.strictEqual(response.resolvedCount, 1);
    assert.strictEqual(response.items[0].title, "Yargı");
  });

  it("notes catalog keyword limitation when user submits a single-word genre query", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("api.tvmaze.com")) {
        return new Response(JSON.stringify(MOCK_TVMAZE_K2));
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: ""
    };

    const response = await executeDiscoveryPipeline(
      { query: "Action", category: "ALL" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "CATALOG_SEARCH");
    assert.ok(response.disclaimer.includes("TVmaze provides keyword search"));
  });

  it("returns EMPTY mode when neither AI nor catalog direct search yields results", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ candidates: [] }));
      }
      if (url.includes("api.tvmaze.com")) {
        return new Response(JSON.stringify([]));
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-valid-key"
    };

    const response = await executeDiscoveryPipeline(
      { query: "xyzunmatched99999", category: "ALL" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "EMPTY");
    assert.strictEqual(response.resolvedCount, 0);
    assert.strictEqual(response.items.length, 0);
  });

  it("rejects empty query with ERROR mode", async () => {
    const env: Env = { GEMINI_API_KEY: "mock-key" };
    const response = await executeDiscoveryPipeline({ query: "   " }, env);

    assert.strictEqual(response.mode, "ERROR");
    assert.strictEqual(response.resolvedCount, 0);
    assert.ok(response.error?.includes("query string is required"));
  });

  it("executes direct catalog fallback when candidate resolution yields 0 matches, strictly respecting 4-call limit", async () => {
    let tvmazeCallCount = 0;

    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();

      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  { canonicalTitle: "Unmatched Show 1", expectedMediaType: "TV_SERIES", confidenceScore: 0.5, matchReason: "Reason 1" },
                  { canonicalTitle: "Unmatched Show 2", expectedMediaType: "TV_SERIES", confidenceScore: 0.5, matchReason: "Reason 2" },
                  { canonicalTitle: "Unmatched Show 3", expectedMediaType: "TV_SERIES", confidenceScore: 0.5, matchReason: "Reason 3" },
                  { canonicalTitle: "Unmatched Show 4", expectedMediaType: "TV_SERIES", confidenceScore: 0.5, matchReason: "Reason 4" }
                ])
              }]
            }
          }]
        }));
      }

      if (url.includes("api.tvmaze.com")) {
        tvmazeCallCount++;
        // The 3 candidates return empty results
        if (url.includes("Unmatched")) {
          return new Response(JSON.stringify([]));
        }
        // The 4th call is the direct keyword fallback for "The K2" which succeeds
        if (url.includes("The%20K2") || url.includes("K2")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response(JSON.stringify([]));
      }

      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-key",
      MAX_TVMAZE_CALLS: "4"
    };

    const response = await executeDiscoveryPipeline(
      { query: "The K2", category: "KDRAMA" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "CATALOG_SEARCH");
    assert.strictEqual(response.fallbackUsed, true);
    assert.strictEqual(response.resolvedCount, 1);
    assert.strictEqual(response.items[0].title, "The K2");
    // Verify candidate budget was capped to 3, leaving 1 call for fallback -> total exactly 4
    assert.strictEqual(tvmazeCallCount, 4);
  });

  it("handles double failure safely when both Gemini and TVmaze network calls fail", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ error: { code: 500, message: "Internal AI error" } }), { status: 500 });
      }
      if (url.includes("api.tvmaze.com")) {
        return new Response("TVmaze gateway timeout", { status: 504 });
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = { GEMINI_API_KEY: "mock-key" };
    const response = await executeDiscoveryPipeline(
      { query: "Chernobyl", category: "TV_SERIES" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "ERROR");
    assert.strictEqual(response.fallbackUsed, true);
    assert.strictEqual(response.resolvedCount, 0);
    assert.strictEqual(response.error, "Unable to retrieve catalog results.");
    assert.ok(response.disclaimer.includes("Catalog lookup temporarily unavailable"));
  });

  it("rejects query exceeding 1000 characters with ERROR mode", async () => {
    const env: Env = { GEMINI_API_KEY: "mock-key" };
    const longQuery = "a".repeat(1005);
    const response = await executeDiscoveryPipeline({ query: longQuery }, env);

    assert.strictEqual(response.mode, "ERROR");
    assert.ok(response.error?.includes("maximum 1,000 characters supported"));
  });

  it("handles Gemini timeout safely and falls back to TVmaze keyword search", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        throw error;
      }
      if (url.includes("api.tvmaze.com")) {
        return new Response(JSON.stringify(MOCK_TVMAZE_K2));
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = { GEMINI_API_KEY: "mock-key", GEMINI_TIMEOUT_MS: "12000" };
    const response = await executeDiscoveryPipeline(
      { query: "The K2", category: "KDRAMA" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "CATALOG_SEARCH");
    assert.strictEqual(response.fallbackUsed, true);
    assert.strictEqual(response.resolvedCount, 1);
    assert.ok(response.disclaimer.includes("AI request reached time limit"));
    assert.strictEqual(response.items[0].title, "The K2");
  });

  describe("Phase 5F Diagnostic and Candidate Pipeline Scenarios", () => {
    it("Scenario 1 & 8: Gemini returns The K2 (2016, KDRAMA) -> TVMaze resolves 2016 show -> AI_ENHANCED", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({
            candidates: [{
              content: {
                parts: [
                  { text: "Thinking: bodyguard protecting politician daughter is The K2", thought: true },
                  { text: JSON.stringify([{
                    canonicalTitle: "The K2",
                    approximateYear: 2016,
                    expectedMediaType: "KDRAMA",
                    matchReason: "A former mercenary protects a politician's secret daughter"
                  }]) }
                ]
              }
            }]
          }));
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.5-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "A bodyguard protects a politician's secret daughter", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.fallbackUsed, false);
      assert.strictEqual(response.resolvedCount, 1);
      assert.strictEqual(response.items[0].title, "The K2");
      assert.strictEqual(response.diagnostic?.stage, "AI_ENHANCED_SUCCESS");
      assert.strictEqual(response.diagnostic?.hasThoughtParts, true);
    });

    it("Scenario 2: Multiple candidates, only 1 resolves -> AI_ENHANCED with 1 item and records rejections", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify([
                    { canonicalTitle: "The K2", approximateYear: 2016, expectedMediaType: "KDRAMA", matchReason: "Bodyguard" },
                    { canonicalTitle: "Ghost Candidate Phantom", approximateYear: 2020, expectedMediaType: "KDRAMA", matchReason: "Nonexistent" }
                  ])
                }]
              }
            }]
          }));
        }
        if (url.includes("api.tvmaze.com")) {
          if (url.includes("K2")) return new Response(JSON.stringify(MOCK_TVMAZE_K2));
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "Bodyguard action dramas", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.resolvedCount, 1);
      assert.strictEqual(response.items[0].title, "The K2");
      assert.strictEqual(response.diagnostic?.stage, "AI_ENHANCED_SUCCESS");
      assert.strictEqual(response.diagnostic?.candidateRejections.length, 1);
      assert.strictEqual(response.diagnostic?.candidateRejections[0].reason, "NO_TVMAZE_RESULTS");
    });

    it("Scenario 3: Candidates not in TVMaze -> CATALOG_NO_CANDIDATES_RESOLVED -> fallback", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify([
                    { canonicalTitle: "Totally Nonexistent Drama 1", expectedMediaType: "KDRAMA", matchReason: "R1" }
                  ])
                }]
              }
            }]
          }));
        }
        if (url.includes("api.tvmaze.com")) {
          // Direct fallback succeeds
          if (url.includes("query")) return new Response(JSON.stringify(MOCK_TVMAZE_K2));
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "query", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "CATALOG_SEARCH");
      assert.strictEqual(response.fallbackUsed, true);
      assert.strictEqual(response.diagnostic?.stage, "CATALOG_NO_CANDIDATES_RESOLVED");
      assert.strictEqual(response.diagnostic?.candidateRejections[0].reason, "NO_TVMAZE_RESULTS");
    });

    it("Scenario 4: Exact title with missing year/language metadata -> resolves with 55+20=75", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify([
                    { canonicalTitle: "The K2", expectedMediaType: "KDRAMA", matchReason: "Bodyguard romance" }
                    // approximateYear omitted
                  ])
                }]
              }
            }]
          }));
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "bodyguard drama", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.resolvedCount, 1);
      assert.strictEqual(response.items[0].title, "The K2");
    });

    it("Scenario 5A: Candidate output is invalid JSON -> GEMINI_INVALID_RESPONSE", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({
            candidates: [{
              content: {
                parts: [{ text: "This is not JSON text at all" }]
              }
            }]
          }));
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "some query", category: "ALL" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_INVALID_RESPONSE");
      assert.strictEqual(response.mode, "EMPTY");
    });

    it("Scenario 5B: Candidate output is empty array -> GEMINI_ZERO_CANDIDATES", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({
            candidates: [{
              content: {
                parts: [{ text: "[]" }]
              }
            }]
          }));
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "some query", category: "ALL" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_ZERO_CANDIDATES");
      assert.strictEqual(response.mode, "EMPTY");
    });

    it("Scenario 6: TVMaze returns error during candidate resolution -> CATALOG_RESOLUTION_ERROR", async () => {
      let callCount = 0;
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify([{ canonicalTitle: "The K2", expectedMediaType: "KDRAMA", matchReason: "plot" }])
                }]
              }
            }]
          }));
        }
        if (url.includes("api.tvmaze.com")) {
          callCount++;
          // First TVmaze call throws 500 error
          return new Response("Server error", { status: 500 });
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "bodyguard drama", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "CATALOG_RESOLUTION_ERROR");
      assert.strictEqual(response.mode, "ERROR");
    });

    it("Scenario 7: Budget consumed (3 candidate calls) -> leaves 1 call for direct keyword fallback", async () => {
      let tvmazeCalls = 0;
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify([
                    { canonicalTitle: "Cand 1", expectedMediaType: "TV_SERIES", matchReason: "r1" },
                    { canonicalTitle: "Cand 2", expectedMediaType: "TV_SERIES", matchReason: "r2" },
                    { canonicalTitle: "Cand 3", expectedMediaType: "TV_SERIES", matchReason: "r3" },
                    { canonicalTitle: "Cand 4", expectedMediaType: "TV_SERIES", matchReason: "r4" }
                  ])
                }]
              }
            }]
          }));
        }
        if (url.includes("api.tvmaze.com")) {
          tvmazeCalls++;
          if (url.includes("query")) {
            return new Response(JSON.stringify(MOCK_TVMAZE_K2));
          }
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", MAX_TVMAZE_CALLS: "4" };
      const response = await executeDiscoveryPipeline(
        { query: "query", category: "ALL" },
        env,
        mockFetch
      );

      // Exactly 3 candidate calls + 1 fallback call = 4 total
      assert.strictEqual(tvmazeCalls, 4);
      assert.strictEqual(response.mode, "CATALOG_SEARCH");
      assert.strictEqual(response.fallbackUsed, true);
    });

    it("Scenario 9: Gemini timeout cannot produce false AI_ENHANCED", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          const abortErr = new Error("aborted");
          abortErr.name = "AbortError";
          throw abortErr;
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", GEMINI_TIMEOUT_MS: "16000" };
      const response = await executeDiscoveryPipeline(
        { query: "Unmatched bodyguard query", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.notStrictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.mode, "EMPTY");
      assert.strictEqual(response.diagnostic?.stage, "GEMINI_TIMEOUT");
    });
  });

  describe("Phase 5H Upstream Error Classification Integration Tests", () => {
    it("classifies HTTP 400 INVALID_ARGUMENT correctly with sanitized diagnostics", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 400,
                message: "Invalid field 'thinking_level' for model: invalid argument",
                status: "INVALID_ARGUMENT"
              }
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "The K2", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_INVALID_ARGUMENT");
      assert.strictEqual(response.diagnostic?.geminiHttpStatus, 400);
      assert.strictEqual(response.diagnostic?.geminiErrorStatus, "INVALID_ARGUMENT");
      assert.strictEqual(response.diagnostic?.geminiErrorCode, 400);
      assert.strictEqual(response.mode, "CATALOG_SEARCH");
      assert.strictEqual(response.fallbackUsed, true);
      // Public disclaimer remains generic
      assert.ok(!response.disclaimer.includes("INVALID_ARGUMENT"));
    });

    it("classifies HTTP 403 PERMISSION_DENIED correctly with generic public response", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 403,
                message: "API key not valid or caller lacks permission",
                status: "PERMISSION_DENIED"
              }
            }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "The K2", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_PERMISSION_DENIED");
      assert.strictEqual(response.diagnostic?.geminiHttpStatus, 403);
      assert.strictEqual(response.diagnostic?.geminiErrorStatus, "PERMISSION_DENIED");
      assert.strictEqual(response.mode, "CATALOG_SEARCH");
      assert.strictEqual(response.fallbackUsed, true);
    });

    it("classifies HTTP 404 NOT_FOUND correctly for unsupported model identifier", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 404,
                message: "models/gemini-3.1-flash-lite is not found for API version v1beta",
                status: "NOT_FOUND"
              }
            }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "Unmatched bodyguard query", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_MODEL_NOT_FOUND");
      assert.strictEqual(response.diagnostic?.geminiHttpStatus, 404);
      assert.strictEqual(response.diagnostic?.geminiErrorStatus, "NOT_FOUND");
      assert.strictEqual(response.diagnostic?.configuredModel, "gemini-3.1-flash-lite");
      assert.strictEqual(response.mode, "EMPTY");
      assert.strictEqual(response.fallbackUsed, true);
      assert.strictEqual(response.disclaimer, "No matching shows found in TVmaze catalog.");
    });

    it("classifies HTTP 429 RESOURCE_EXHAUSTED as GEMINI_QUOTA_EXCEEDED", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 429,
                message: "Quota exceeded for quota metric 'Generate Content Requests'",
                status: "RESOURCE_EXHAUSTED"
              }
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "The K2", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_QUOTA_EXCEEDED");
      assert.strictEqual(response.diagnostic?.geminiHttpStatus, 429);
      assert.strictEqual(response.diagnostic?.geminiErrorStatus, "RESOURCE_EXHAUSTED");
      assert.strictEqual(response.mode, "CATALOG_SEARCH");
    });

    it("classifies HTTP 503 UNAVAILABLE as GEMINI_UPSTREAM_UNAVAILABLE", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 503,
                message: "The service is temporarily unavailable",
                status: "UNAVAILABLE"
              }
            }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "The K2", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_UPSTREAM_UNAVAILABLE");
      assert.strictEqual(response.diagnostic?.geminiHttpStatus, 503);
      assert.strictEqual(response.diagnostic?.geminiErrorStatus, "UNAVAILABLE");
      assert.strictEqual(response.mode, "CATALOG_SEARCH");
    });

    it("falls back to generic GEMINI_UPSTREAM_ERROR when error is generic 500 or unstructured", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response("Internal Server Error", { status: 500 });
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key" };
      const response = await executeDiscoveryPipeline(
        { query: "The K2", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_UPSTREAM_ERROR");
      assert.strictEqual(response.diagnostic?.geminiHttpStatus, 500);
      assert.strictEqual(response.mode, "CATALOG_SEARCH");
    });
  });

  describe("Phase 5M Location-Error Fallback Tests", () => {
    it("handles exact location-policy error with successfully resolved TVMaze fallback", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 400,
                message: "User location is not supported for the API use.",
                status: "FAILED_PRECONDITION"
              }
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "The K2", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_LOCATION_UNSUPPORTED");
      assert.strictEqual(response.diagnostic?.geminiHttpStatus, 400);
      assert.strictEqual(response.diagnostic?.geminiErrorStatus, "FAILED_PRECONDITION");
      assert.strictEqual(response.mode, "CATALOG_SEARCH");
      assert.strictEqual(response.fallbackUsed, true);
      assert.strictEqual(response.resolvedCount, 1);
      assert.strictEqual(response.items[0].title, "The K2");
      assert.ok(response.disclaimer.includes("AI discovery is temporarily unavailable in this region"));
    });

    it("handles location-policy error when TVMaze fallback returns zero results, returning EMPTY mode", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 400,
                message: "User location is not supported for the API use.",
                status: "FAILED_PRECONDITION"
              }
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "Unmatched plane crash story", category: "TV_SERIES" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_LOCATION_UNSUPPORTED");
      assert.strictEqual(response.mode, "EMPTY");
      assert.strictEqual(response.fallbackUsed, true);
      assert.strictEqual(response.resolvedCount, 0);
      assert.strictEqual(response.items.length, 0);
      assert.strictEqual(
        response.disclaimer,
        "AI discovery is temporarily unavailable, and no direct catalog matches were found. Try a shorter title or genre keyword."
      );
    });

    it("handles location-policy error when TVMaze fallback itself fails (e.g. 502/network failure)", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 400,
                message: "User location is not supported for the API use.",
                status: "FAILED_PRECONDITION"
              }
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response("502 Bad Gateway", { status: 502 });
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "Long query causing tvmaze 502", category: "ALL" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_LOCATION_UNSUPPORTED");
      assert.strictEqual(response.mode, "ERROR");
      assert.strictEqual(response.fallbackUsed, true);
      assert.strictEqual(response.resolvedCount, 0);
      assert.strictEqual(response.error, "Unable to retrieve catalog results.");
      assert.ok(response.disclaimer.includes("Catalog lookup temporarily unavailable"));
    });

    it("distinguishes ordinary HTTP 400 errors from location restrictions", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 400,
                message: "Invalid field in generationConfig",
                status: "INVALID_ARGUMENT"
              }
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "The K2", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.diagnostic?.stage, "GEMINI_INVALID_ARGUMENT");
      assert.notStrictEqual(response.diagnostic?.stage, "GEMINI_LOCATION_UNSUPPORTED");
      assert.strictEqual(response.mode, "CATALOG_SEARCH");
    });
  });

  describe("Phase 5N Query-Aware Fallback Hardening Tests", () => {
    it("isDirectCatalogQuery accurately distinguishes concise title/genre queries from narrative and mood queries", () => {
      // Direct queries suitable for TVMaze title keyword lookup
      assert.strictEqual(isDirectCatalogQuery("action"), true);
      assert.strictEqual(isDirectCatalogQuery("The K2"), true);
      assert.strictEqual(isDirectCatalogQuery("Dark"), true);
      assert.strictEqual(isDirectCatalogQuery("Breaking Bad"), true);
      assert.strictEqual(isDirectCatalogQuery("romantic comedy"), true);
      assert.strictEqual(isDirectCatalogQuery("Star Trek"), true);

      // Narrative, mood, or conversational prompts unsuitable for direct TVMaze title lookup
      assert.strictEqual(
        isDirectCatalogQuery("I'm in the mood for a dark, suspenseful series with clever twists, a mysterious atmosphere, and high stakes."),
        false
      );
      assert.strictEqual(
        isDirectCatalogQuery("A bodyguard protects a politician's secret daughter. They initially dislike each other, but gradually fall in love while facing danger."),
        false
      );
      assert.strictEqual(
        isDirectCatalogQuery("I vaguely remember a series about plane crash survivors stranded on a mysterious island, where strange events and unanswered questions make it difficult to know what is really happening."),
        false
      );
      assert.strictEqual(isDirectCatalogQuery("series about doctors"), false);
      assert.strictEqual(isDirectCatalogQuery("show about time travel"), false);
      assert.strictEqual(isDirectCatalogQuery(""), false);
      assert.strictEqual(isDirectCatalogQuery("a".repeat(65)), false);
    });

    it("short direct query plus Gemini 503 results in normal TVMaze fallback", async () => {
      let tvmazeCalledWith: string | undefined;
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 503,
                message: "This model is currently experiencing high demand.",
                status: "UNAVAILABLE"
              }
            }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          tvmazeCalledWith = url;
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "action", category: "ALL" },
        env,
        mockFetch
      );

      assert.ok(typeof tvmazeCalledWith === "string" && tvmazeCalledWith.includes("action"));
      assert.strictEqual(response.mode, "CATALOG_SEARCH");
      assert.strictEqual(response.fallbackUsed, true);
      assert.strictEqual(response.resolvedCount, 1);
      assert.strictEqual(response.items[0].title, "The K2");
    });

    it("long narrative query plus Gemini location failure does NOT send the full narrative to TVMaze", async () => {
      let tvmazeCallCount = 0;
      const longNarrativeQuery = "I vaguely remember a series about plane crash survivors stranded on a mysterious island, where strange events and unanswered questions make it difficult to know what is really happening.";
      
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              error: {
                code: 400,
                message: "User location is not supported for the API use.",
                status: "FAILED_PRECONDITION"
              }
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.tvmaze.com")) {
          tvmazeCallCount++;
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: longNarrativeQuery, category: "ALL" },
        env,
        mockFetch
      );

      // Verify TVMaze was NEVER called with the 186-char prose
      assert.strictEqual(tvmazeCallCount, 0);
      assert.strictEqual(response.mode, "EMPTY");
      assert.strictEqual(response.fallbackUsed, true);
      assert.strictEqual(response.resolvedCount, 0);
      assert.strictEqual(response.items.length, 0);
      assert.ok(response.disclaimer.includes("AI discovery is temporarily unavailable in this region"));
      assert.ok(response.disclaimer.includes("Story and mood searches require AI assistance"));
    });

    it("mood query plus Gemini timeout returns a truthful empty state without sending mood prose to TVMaze", async () => {
      let tvmazeCallCount = 0;
      const moodQuery = "I'm in the mood for a dark, suspenseful series with clever twists, a mysterious atmosphere, and high stakes.";

      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          throw error;
        }
        if (url.includes("api.tvmaze.com")) {
          tvmazeCallCount++;
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite", GEMINI_TIMEOUT_MS: "5000" };
      const response = await executeDiscoveryPipeline(
        { query: moodQuery, category: "ALL" },
        env,
        mockFetch
      );

      // Verify TVMaze was NEVER called with the mood prose
      assert.strictEqual(tvmazeCallCount, 0);
      assert.strictEqual(response.mode, "EMPTY");
      assert.strictEqual(response.fallbackUsed, true);
      assert.strictEqual(response.resolvedCount, 0);
      assert.strictEqual(response.items.length, 0);
      assert.ok(response.disclaimer.includes("AI discovery reached the time limit"));
      assert.ok(response.disclaimer.includes("Story and mood searches require AI assistance"));
    });

    it("successful AI discovery remains completely functional and untouched", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify(MOCK_GEMINI_VALID_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (url.includes("api.tvmaze.com")) {
          if (url.includes("The%20K2") || url.includes("K2")) {
            return new Response(JSON.stringify(MOCK_TVMAZE_K2));
          }
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "A bodyguard romance in Korea", category: "KDRAMA" },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.fallbackUsed, false);
      assert.strictEqual(response.resolvedCount, 1);
      assert.strictEqual(response.items[0].title, "The K2");
      assert.ok(response.items[0].matchExplanation);
    });

    it("never manufactures catalog records on empty or failed fallbacks", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({ error: { code: 503, message: "UNAVAILABLE" } }), { status: 503 });
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify([]));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = { GEMINI_API_KEY: "mock-key", PRIMARY_MODEL: "gemini-3.1-flash-lite" };
      const response = await executeDiscoveryPipeline(
        { query: "nonexistent show 987654", category: "ALL" },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "EMPTY");
      assert.strictEqual(response.resolvedCount, 0);
      assert.strictEqual(response.items.length, 0);
    });
  });
});
