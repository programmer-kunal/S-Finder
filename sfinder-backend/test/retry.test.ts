import { describe, it } from "node:test";
import assert from "node:assert";
import { GeminiError, GeminiQuotaExceededError, GeminiTimeoutError, requestGeminiCandidates } from "../src/gemini";
import { executeDiscoveryPipeline } from "../src/pipeline";
import { Env, PipelineDiagnostic } from "../src/types";
import {
  MOCK_FIXTURE_A_NARRATIVE_QUERY,
  MOCK_FIXTURE_B_IRRELEVANT_CANDIDATE,
  MOCK_FIXTURE_B_TVMAZE_SHOW,
  MOCK_FIXTURE_C_RELEVANT_ISLAND_CANDIDATE,
  MOCK_FIXTURE_C_TVMAZE_SHOW,
  MOCK_GEMINI_VALID_RESPONSE,
  MOCK_TVMAZE_K2
} from "./mocks";

describe("Phase 5T Bounded Recovery for Transient Gemini 503 Unit & Integration Tests", () => {
  it("Scenario 1: First request returns 503, second attempt succeeds with bounded retry", async () => {
    let callCount = 0;
    let capturedDiag: any;

    const mockFetch: typeof fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: 503,
              status: "UNAVAILABLE",
              message: "This model is currently experiencing high demand. Spikes in demand are usually temporary."
            }
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify(MOCK_GEMINI_VALID_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const candidates = await requestGeminiCandidates({
      apiKey: "test-api-key",
      query: "bodyguard romance",
      category: "KDRAMA",
      model: "gemini-3.1-flash-lite",
      baseUrl: "https://mock.api",
      timeoutMs: 5000,
      maxCandidates: 4,
      fetchFn: mockFetch,
      retryDelayMs: 10, // Fast delay for test
      onDiagnostic: (diag) => {
        capturedDiag = diag;
      }
    });

    assert.strictEqual(callCount, 2, "Must make exactly 2 attempts");
    assert.strictEqual(candidates.length, 4, "Must return parsed candidates on successful attempt 2");
    assert.strictEqual(candidates[0].canonicalTitle, "The K2");
    assert.strictEqual(capturedDiag?.retryAttempted, true);
    assert.strictEqual(capturedDiag?.retrySucceeded, true);
    assert.strictEqual(capturedDiag?.httpStatus, 200);
  });

  it("Scenario 2: Both attempts return 503, bounded retry exhausted and throws cleanly", async () => {
    let callCount = 0;
    let capturedDiag: any;

    const mockFetch: typeof fetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          error: {
            code: 503,
            status: "UNAVAILABLE",
            message: "This model is currently experiencing high demand. Spikes in demand are usually temporary."
          }
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    };

    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: "test-api-key",
          query: "bodyguard romance",
          category: "KDRAMA",
          model: "gemini-3.1-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 5000,
          maxCandidates: 4,
          fetchFn: mockFetch,
          retryDelayMs: 10,
          onDiagnostic: (diag) => {
            capturedDiag = diag;
          }
        });
      },
      (err: any) => {
        assert.ok(err instanceof GeminiError);
        assert.strictEqual(err.statusCode, 503);
        assert.strictEqual(err.errorStatus, "UNAVAILABLE");
        return true;
      }
    );

    assert.strictEqual(callCount, 2, "Must make exactly 2 attempts before abandoning");
    assert.strictEqual(capturedDiag?.retryAttempted, true);
    assert.strictEqual(capturedDiag?.retrySucceeded, false);
    assert.strictEqual(capturedDiag?.httpStatus, 503);
  });

  it("Scenario 3: First attempt returns 400 location policy error, strictly never retries", async () => {
    let callCount = 0;
    let capturedDiag: any;

    const mockFetch: typeof fetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          error: {
            code: 400,
            status: "FAILED_PRECONDITION",
            message: "User location is not supported for the API use."
          }
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    };

    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: "test-api-key",
          query: "bodyguard romance",
          category: "KDRAMA",
          model: "gemini-3.1-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 5000,
          maxCandidates: 4,
          fetchFn: mockFetch,
          retryDelayMs: 10,
          onDiagnostic: (diag) => {
            capturedDiag = diag;
          }
        });
      },
      (err: any) => {
        assert.ok(err instanceof GeminiError);
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.errorStatus, "FAILED_PRECONDITION");
        return true;
      }
    );

    assert.strictEqual(callCount, 1, "Must NOT retry a 400 location error");
    assert.strictEqual(capturedDiag?.retryAttempted, false);
    assert.strictEqual(capturedDiag?.retrySucceeded, false);
    assert.strictEqual(capturedDiag?.httpStatus, 400);
  });

  it("Scenario 4: First attempt returns 403 permission error, strictly never retries", async () => {
    let callCount = 0;
    let capturedDiag: any;

    const mockFetch: typeof fetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            status: "PERMISSION_DENIED",
            message: "The caller does not have permission"
          }
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    };

    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: "test-api-key",
          query: "bodyguard romance",
          category: "KDRAMA",
          model: "gemini-3.1-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 5000,
          maxCandidates: 4,
          fetchFn: mockFetch,
          retryDelayMs: 10,
          onDiagnostic: (diag) => {
            capturedDiag = diag;
          }
        });
      },
      (err: any) => {
        assert.ok(err instanceof GeminiError);
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.errorStatus, "PERMISSION_DENIED");
        return true;
      }
    );

    assert.strictEqual(callCount, 1, "Must NOT retry a 403 error");
    assert.strictEqual(capturedDiag?.retryAttempted, false);
    assert.strictEqual(capturedDiag?.retrySucceeded, false);
  });

  it("Scenario 5: First attempt returns 429 quota error, strictly never retries", async () => {
    let callCount = 0;
    let capturedDiag: any;

    const mockFetch: typeof fetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            message: "Rate limit exceeded"
          }
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    };

    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: "test-api-key",
          query: "bodyguard romance",
          category: "KDRAMA",
          model: "gemini-3.1-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 5000,
          maxCandidates: 4,
          fetchFn: mockFetch,
          retryDelayMs: 10,
          onDiagnostic: (diag) => {
            capturedDiag = diag;
          }
        });
      },
      (err: any) => {
        assert.ok(err instanceof GeminiQuotaExceededError);
        return true;
      }
    );

    assert.strictEqual(callCount, 1, "Must NOT retry a 429 quota error");
    assert.strictEqual(capturedDiag?.retryAttempted, false);
    assert.strictEqual(capturedDiag?.retrySucceeded, false);
  });

  it("Scenario 6: First attempt times out, strictly never retries", async () => {
    let callCount = 0;

    const mockFetch: typeof fetch = async (_input, init) => {
      callCount++;
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    };

    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: "test-api-key",
          query: "bodyguard romance",
          category: "KDRAMA",
          model: "gemini-3.1-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 50, // Short timeout to trigger abort
          maxCandidates: 4,
          fetchFn: mockFetch,
          retryDelayMs: 10
        });
      },
      (err: any) => {
        assert.ok(err instanceof GeminiTimeoutError);
        return true;
      }
    );

    assert.strictEqual(callCount, 1, "Must NOT retry after a timeout");
  });

  it("Scenario 7: Insufficient overall deadline remaining skips retry even on 503", async () => {
    let callCount = 0;
    let capturedDiag: any;

    const mockFetch: typeof fetch = async () => {
      callCount++;
      // Simulate taking 800ms
      await new Promise(r => setTimeout(r, 50));
      return new Response(
        JSON.stringify({
          error: {
            code: 503,
            status: "UNAVAILABLE",
            message: "This model is currently experiencing high demand."
          }
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    };

    // Total timeout is 1000ms, retryDelayMs is 500ms.
    // minRequiredForRetry = 500 + 1000 = 1500ms.
    // Since total timeout is 1000ms, remainingTotalMs < 1500ms guaranteed!
    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: "test-api-key",
          query: "bodyguard romance",
          category: "KDRAMA",
          model: "gemini-3.1-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 1000,
          maxCandidates: 4,
          fetchFn: mockFetch,
          retryDelayMs: 500,
          onDiagnostic: (diag) => {
            capturedDiag = diag;
          }
        });
      },
      (err: any) => {
        assert.ok(err instanceof GeminiError);
        assert.strictEqual(err.statusCode, 503);
        return true;
      }
    );

    assert.strictEqual(callCount, 1, "Must skip retry when remaining deadline is insufficient");
    assert.strictEqual(capturedDiag?.retryAttempted, false, "retryAttempted must be false when skipped");
  });

  it("Scenario 8: Long narrative query skips direct TVMaze fallback after repeated 503", async () => {
    let tvmazeCallCount = 0;
    let geminiCallCount = 0;

    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCallCount++;
        return new Response(
          JSON.stringify({
            error: {
              code: 503,
              status: "UNAVAILABLE",
              message: "This model is currently experiencing high demand. Spikes in demand are usually temporary."
            }
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("api.tvmaze.com")) {
        tvmazeCallCount++;
        return new Response(JSON.stringify([]));
      }
      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-valid-key",
      PRIMARY_MODEL: "gemini-3.1-flash-lite",
      RETRY_DELAY_MS: "10"
    };

    const response = await executeDiscoveryPipeline(
      { query: MOCK_FIXTURE_A_NARRATIVE_QUERY, category: "ALL" },
      env,
      mockFetch
    );

    assert.strictEqual(geminiCallCount, 2, "Gemini must have performed attempt 1 and attempt 2");
    assert.strictEqual(tvmazeCallCount, 0, "TVMaze must NOT be called with a narrative query on 503 failure");
    assert.strictEqual(response.mode, "EMPTY");
    assert.strictEqual(response.resolvedCount, 0);
    assert.strictEqual(response.items.length, 0);
    assert.ok(response.diagnostic, "Diagnostic must be present");
    assert.strictEqual(response.diagnostic.stage, "GEMINI_UPSTREAM_UNAVAILABLE");
    assert.strictEqual(response.diagnostic.retryAttempted, true);
    assert.strictEqual(response.diagnostic.retrySucceeded, false);
    assert.ok(
      response.disclaimer.includes("AI discovery is temporarily unavailable"),
      `Disclaimer should explain AI unavailable: ${response.disclaimer}`
    );
  });

  it("Scenario 9: Successful retry candidate generation still passes TVMaze verification and Phase 5Q relevance evaluation", async () => {
    let geminiCallCount = 0;
    let tvmazeCallCount = 0;

    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();

      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCallCount++;
        if (geminiCallCount === 1) {
          // Attempt 1: 503
          return new Response(
            JSON.stringify({
              error: {
                code: 503,
                status: "UNAVAILABLE",
                message: "This model is currently experiencing high demand."
              }
            }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
        // Attempt 2: 200 with 2 candidates (1 relevant island show, 1 irrelevant teen show)
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify([
                        MOCK_FIXTURE_C_RELEVANT_ISLAND_CANDIDATE,
                        MOCK_FIXTURE_B_IRRELEVANT_CANDIDATE
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
        tvmazeCallCount++;
        if (url.includes("Mysterious%20Island") || url.includes("Mysterious Island") || url.includes("Chronicles")) {
          return new Response(JSON.stringify(MOCK_FIXTURE_C_TVMAZE_SHOW));
        }
        if (url.includes("Not%20Okay") || url.includes("Okay")) {
          return new Response(JSON.stringify(MOCK_FIXTURE_B_TVMAZE_SHOW));
        }
        return new Response(JSON.stringify([]));
      }

      return new Response("Not found", { status: 404 });
    };

    const env: Env = {
      GEMINI_API_KEY: "mock-valid-key",
      PRIMARY_MODEL: "gemini-3.1-flash-lite",
      RETRY_DELAY_MS: "10"
    };

    const response = await executeDiscoveryPipeline(
      { query: MOCK_FIXTURE_A_NARRATIVE_QUERY, category: "ALL" },
      env,
      mockFetch
    );

    assert.strictEqual(geminiCallCount, 2, "Gemini must have performed 2 attempts");
    assert.strictEqual(response.mode, "AI_ENHANCED");
    assert.strictEqual(response.resolvedCount, 1, "Only the semantically relevant title should be accepted");
    assert.strictEqual(response.items[0].title, "The Mysterious Island Chronicles");
    assert.ok(response.diagnostic, "Diagnostic must be present");
    assert.strictEqual(response.diagnostic.stage, "AI_ENHANCED_SUCCESS");
    assert.strictEqual(response.diagnostic.retryAttempted, true);
    assert.strictEqual(response.diagnostic.retrySucceeded, true);
    assert.strictEqual(response.diagnostic.candidateRejections.length, 1);
    assert.strictEqual(response.diagnostic.candidateRejections[0].reason, "LOW_SEMANTIC_RELEVANCE");
  });

  it("Scenario 10: Diagnostics and error logs remain sanitized with zero secrets or query leakages", async () => {
    let capturedDiag: any;
    const SECRET_KEY = "AIzaSySecretTestKeyThatMustNeverAppearInLogs999";
    const QUERY_STRING = "A very specific secret query phrase";

    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 503,
            status: "UNAVAILABLE",
            message: `Key ${SECRET_KEY} failed on query ${QUERY_STRING}: unavailable upstream https://secret.internal.net/v1`
          }
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    };

    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: SECRET_KEY,
          query: QUERY_STRING,
          category: "ALL",
          model: "gemini-3.1-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 5000,
          maxCandidates: 4,
          fetchFn: mockFetch,
          retryDelayMs: 10,
          onDiagnostic: (diag) => {
            capturedDiag = diag;
          }
        });
      },
      (err: any) => {
        assert.ok(err instanceof GeminiError);
        assert.ok(!err.message.includes(SECRET_KEY), "Error message must not contain secret key");
        return true;
      }
    );

    assert.ok(capturedDiag, "Diagnostic must be captured");
    assert.ok(!capturedDiag.errorMessage?.includes(SECRET_KEY), "Diagnostic errorMessage must not contain secret key");
    assert.ok(!capturedDiag.errorMessage?.includes(QUERY_STRING), "Diagnostic errorMessage must not contain raw query");
    assert.ok(capturedDiag.errorMessage?.includes("[QUERY]"), "Query should be sanitized to [QUERY]");
  });
});
