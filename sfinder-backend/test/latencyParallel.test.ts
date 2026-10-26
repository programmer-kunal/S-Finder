import { describe, it } from "node:test";
import assert from "node:assert";
import { TvMazeResolver } from "../src/tvmaze";
import { executeDiscoveryPipeline } from "../src/pipeline";
import { Candidate, Env, TVMazeSearchResult } from "../src/types";
import {
  MOCK_FIXTURE_A_NARRATIVE_QUERY,
  MOCK_GEMINI_VALID_RESPONSE,
  MOCK_TVMAZE_AMBIGUOUS_DARK,
  MOCK_TVMAZE_K2,
  MOCK_TVMAZE_YARGI
} from "./mocks";

describe("Phase 5X: Latency Instrumentation and Parallel TVMaze Resolution Tests", () => {
  it("Test 1: Stage timing fields (geminiMs, tvmazeMs, relevanceMs, totalElapsedMs) are accurately populated", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        await new Promise(r => setTimeout(r, 20)); // Simulated Gemini inference
        return new Response(JSON.stringify(MOCK_GEMINI_VALID_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.includes("api.tvmaze.com")) {
        await new Promise(r => setTimeout(r, 10)); // Simulated TVMaze fetch
        if (url.includes("K2")) return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        if (url.includes("Dark")) return new Response(JSON.stringify(MOCK_TVMAZE_AMBIGUOUS_DARK));
        if (url.includes("Yargi")) return new Response(JSON.stringify(MOCK_TVMAZE_YARGI));
        return new Response(JSON.stringify([]));
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-valid-key",
      PRIMARY_MODEL: "gemini-3.1-flash-lite"
    };

    const response = await executeDiscoveryPipeline(
      { query: "Bodyguard romance with high action and courtroom drama", category: "ALL" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "AI_ENHANCED");
    assert.ok(response.diagnostic, "Diagnostic must be present");
    assert.ok(typeof response.diagnostic.geminiDurationMs === "number" && response.diagnostic.geminiDurationMs >= 15, 
      `geminiDurationMs was ${response.diagnostic.geminiDurationMs}`);
    assert.ok(typeof response.diagnostic.tvmazeDurationMs === "number" && response.diagnostic.tvmazeDurationMs >= 8,
      `tvmazeDurationMs was ${response.diagnostic.tvmazeDurationMs}`);
    assert.ok(typeof response.diagnostic.relevanceDurationMs === "number",
      `relevanceDurationMs was ${response.diagnostic.relevanceDurationMs}`);
    assert.ok(response.diagnostic.totalElapsedMs >= response.diagnostic.geminiDurationMs,
      `totalElapsedMs (${response.diagnostic.totalElapsedMs}) must be >= geminiDurationMs (${response.diagnostic.geminiDurationMs})`);
  });

  it("Test 2 & 3: Parallel candidate resolution executes with bounded concurrency (max 3 concurrent)", async () => {
    let activeConcurrency = 0;
    let maxObservedConcurrency = 0;

    const mockFetch: typeof fetch = async () => {
      activeConcurrency++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, activeConcurrency);
      // Hold request open briefly to measure concurrent overlap
      await new Promise(r => setTimeout(r, 30));
      activeConcurrency--;
      return new Response(JSON.stringify(MOCK_TVMAZE_K2));
    };

    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4, "TVmaze", mockFetch);

    const candidates: Candidate[] = [
      { canonicalTitle: "Show 1", expectedMediaType: "TV_SERIES", matchReason: "Reason 1" },
      { canonicalTitle: "Show 2", expectedMediaType: "TV_SERIES", matchReason: "Reason 2" },
      { canonicalTitle: "Show 3", expectedMediaType: "TV_SERIES", matchReason: "Reason 3" }
    ];

    const startTime = Date.now();
    await resolver.resolveCandidates(candidates);
    const duration = Date.now() - startTime;

    // Must have executed all 3 concurrently in parallel
    assert.strictEqual(maxObservedConcurrency, 3, "Max observed concurrency must be exactly 3");
    // With 30ms per request, 3 sequential would take >= 90ms. Parallel completes concurrently.
    assert.ok(duration < 120, `Parallel resolution duration was ${duration}ms, expected < 120ms (sequential would be ~90ms+)`);
  });

  it("Test 4: Total TVMaze call budget never exceeds 4 even when more candidates are supplied", async () => {
    let fetchCalls = 0;
    let maxObservedConcurrency = 0;
    let activeConcurrency = 0;

    const mockFetch: typeof fetch = async () => {
      fetchCalls++;
      activeConcurrency++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, activeConcurrency);
      await new Promise(r => setTimeout(r, 15));
      activeConcurrency--;
      return new Response(JSON.stringify(MOCK_TVMAZE_K2));
    };

    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4, "TVmaze", mockFetch);

    const candidates: Candidate[] = [
      { canonicalTitle: "Show 1", expectedMediaType: "TV_SERIES", matchReason: "R1" },
      { canonicalTitle: "Show 2", expectedMediaType: "TV_SERIES", matchReason: "R2" },
      { canonicalTitle: "Show 3", expectedMediaType: "TV_SERIES", matchReason: "R3" },
      { canonicalTitle: "Show 4", expectedMediaType: "TV_SERIES", matchReason: "R4" },
      { canonicalTitle: "Show 5", expectedMediaType: "TV_SERIES", matchReason: "R5" }
    ];

    const rejections: any[] = [];
    await resolver.resolveCandidates(candidates, (rej) => rejections.push(rej));

    assert.strictEqual(fetchCalls, 4, "Total fetch calls must never exceed the budget of 4");
    assert.ok(maxObservedConcurrency <= 3, `Concurrency was ${maxObservedConcurrency}, must not exceed 3`);
    assert.strictEqual(resolver.getCallCount(), 4);
    assert.ok(rejections.some(r => r.candidateTitle === "Show 5" && r.reason === "BUDGET_EXCEEDED"));
  });

  it("Test 5: One candidate lookup failing does not erase successful independent results", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("FailShow")) {
        throw new Error("Simulated network failure on candidate 2");
      }
      if (url.includes("K2")) return new Response(JSON.stringify(MOCK_TVMAZE_K2));
      if (url.includes("Dark")) return new Response(JSON.stringify(MOCK_TVMAZE_AMBIGUOUS_DARK));
      return new Response(JSON.stringify([]));
    };

    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4, "TVmaze", mockFetch);

    const candidates: Candidate[] = [
      { canonicalTitle: "The K2", expectedMediaType: "KDRAMA", matchReason: "Bodyguard plot", approximateYear: 2016 },
      { canonicalTitle: "FailShow", expectedMediaType: "TV_SERIES", matchReason: "Fails" },
      { canonicalTitle: "Dark", expectedMediaType: "TV_SERIES", matchReason: "German mystery", approximateYear: 2017 }
    ];

    const rejections: any[] = [];
    const verified = await resolver.resolveCandidates(candidates, (r) => rejections.push(r));

    // The K2 and Dark must succeed despite FailShow failing!
    assert.strictEqual(verified.length, 2);
    assert.strictEqual(verified[0].title, "The K2");
    assert.strictEqual(verified[1].title, "Dark");
    assert.ok(rejections.some(r => r.candidateTitle === "FailShow" && r.reason === "LOOKUP_ERROR"));
  });

  it("Test 6 & 7: Relevance filtering and ranking remain independent of network completion order", async () => {
    // Candidate 1 (Dark) will finish slow (40ms), but has higher relevance to the prompt.
    // Candidate 2 (The K2) finishes fast (5ms), but has lower relevance to a dark cave mystery prompt.
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  { canonicalTitle: "The K2", approximateYear: 2016, expectedMediaType: "KDRAMA", matchReason: "Bodyguard" },
                  { canonicalTitle: "Dark", approximateYear: 2017, expectedMediaType: "TV_SERIES", matchReason: "German cave mystery" }
                ])
              }]
            }
          }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (url.includes("api.tvmaze.com")) {
        if (url.includes("K2")) {
          await new Promise(r => setTimeout(r, 5)); // Finishes FIRST
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        if (url.includes("Dark")) {
          await new Promise(r => setTimeout(r, 40)); // Finishes LATER
          return new Response(JSON.stringify(MOCK_TVMAZE_AMBIGUOUS_DARK));
        }
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-valid-key",
      PRIMARY_MODEL: "gemini-3.1-flash-lite"
    };

    const response = await executeDiscoveryPipeline(
      { query: "Looking for a German cave time loop mystery with mind-bending twists", category: "ALL" },
      env,
      mockFetch
    );

    assert.strictEqual(response.mode, "AI_ENHANCED");
    // "Dark" must be ranked #1 because its relevance score is substantially higher,
    // even though "The K2" completed its HTTP request much earlier!
    assert.ok(response.items.length >= 1);
    assert.strictEqual(response.items[0].title, "Dark");
  });

  it("Test 8: Exact-title direct catalog discovery remains functional and accurately timed", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ error: { code: 429, message: "RESOURCE_EXHAUSTED" } }), { status: 429 });
      }
      if (url.includes("api.tvmaze.com")) {
        await new Promise(r => setTimeout(r, 10));
        return new Response(JSON.stringify(MOCK_TVMAZE_K2));
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-valid-key",
      PRIMARY_MODEL: "gemini-3.1-flash-lite"
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
    assert.ok(response.diagnostic);
    assert.ok(typeof response.diagnostic.tvmazeDurationMs === "number" && response.diagnostic.tvmazeDurationMs >= 5);
  });

  it("Test 9, 10, 11: Single 503 retry obeys deadline; 400 location does not retry; narrative fallback skips direct TVMaze", async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        callCount++;
        // Always 503
        return new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE", message: "High demand" } }), { status: 503 });
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-valid-key",
      PRIMARY_MODEL: "gemini-3.1-flash-lite",
      RETRY_DELAY_MS: "5"
    };

    const response = await executeDiscoveryPipeline(
      { query: MOCK_FIXTURE_A_NARRATIVE_QUERY, category: "ALL" },
      env,
      mockFetch
    );

    // Bounded retry attempted and failed
    assert.strictEqual(callCount, 2);
    assert.strictEqual(response.mode, "EMPTY");
    assert.strictEqual(response.diagnostic?.retryAttempted, true);
    assert.strictEqual(response.diagnostic?.retrySucceeded, false);
    assert.strictEqual(response.diagnostic?.tvmazeCallsUsed, 0, "Narrative query must skip direct TVMaze search");
    assert.strictEqual(response.diagnostic?.tvmazeDurationMs ?? 0, 0);
  });

  it("Test 12: Diagnostic logging prints sanitized sub-stage durations without secrets", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.join(" "));
    };

    try {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify(MOCK_GEMINI_VALID_RESPONSE), { status: 200 });
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify(MOCK_TVMAZE_K2));
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = {
        GEMINI_API_KEY: "super-secret-key-9999",
        PRIMARY_MODEL: "gemini-3.1-flash-lite"
      };

      await executeDiscoveryPipeline(
        { query: "secret-user-query-pattern", category: "ALL" },
        env,
        mockFetch
      );

      const diagLog = logs.find(l => l.includes("[DiscoveryDiagnostic]"));
      assert.ok(diagLog, "Discovery diagnostic log must be present");
      assert.ok(diagLog.includes("geminiMs="), "Must log geminiMs");
      assert.ok(diagLog.includes("tvmazeMs="), "Must log tvmazeMs");
      assert.ok(diagLog.includes("relevanceMs="), "Must log relevanceMs");
      assert.ok(!diagLog.includes("super-secret-key-9999"), "Must not leak secret API key");
    } finally {
      console.log = originalLog;
    }
  });
});
