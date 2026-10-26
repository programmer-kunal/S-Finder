import { describe, it } from "node:test";
import assert from "node:assert";
import { GeminiError, GeminiQuotaExceededError, requestGeminiCandidates } from "../src/gemini";
import { MOCK_GEMINI_MALFORMED_JSON, MOCK_GEMINI_VALID_RESPONSE } from "./mocks";

describe("Gemini Client Unit Tests", () => {
  it("successfully parses valid structured candidate output", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify(MOCK_GEMINI_VALID_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const candidates = await requestGeminiCandidates({
      apiKey: "test-mock-key",
      query: "A bodyguard romance in Korea",
      category: "KDRAMA",
      model: "gemini-3.5-flash-lite",
      baseUrl: "https://mock.api",
      timeoutMs: 5000,
      maxCandidates: 4,
      fetchFn: mockFetch
    });

    assert.strictEqual(candidates.length, 4);
    assert.strictEqual(candidates[0].canonicalTitle, "The K2");
    assert.strictEqual(candidates[0].expectedMediaType, "KDRAMA");
    assert.strictEqual(candidates[1].canonicalTitle, "Dark");
    assert.strictEqual(candidates[2].canonicalTitle, "Yargi");
    assert.strictEqual(candidates[3].canonicalTitle, "Nonexistent Phantom Show XYZ");
  });

  it("handles malformed JSON response safely by returning empty list", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify(MOCK_GEMINI_MALFORMED_JSON), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const candidates = await requestGeminiCandidates({
      apiKey: "test-mock-key",
      query: "Random plot description",
      category: "ALL",
      model: "gemini-3.5-flash-lite",
      baseUrl: "https://mock.api",
      timeoutMs: 5000,
      maxCandidates: 4,
      fetchFn: mockFetch
    });

    assert.deepStrictEqual(candidates, []);
  });

  it("throws GeminiQuotaExceededError when upstream returns HTTP 429", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: { code: 429, message: "RESOURCE_EXHAUSTED" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    };

    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: "test-mock-key",
          query: "A drama with plot twists",
          model: "gemini-3.5-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 5000,
          maxCandidates: 4,
          fetchFn: mockFetch
        });
      },
      (err: any) => err instanceof GeminiQuotaExceededError
    );
  });

  it("throws GeminiError when API key is missing", async () => {
    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: "",
          query: "Some query",
          model: "gemini-3.5-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 5000,
          maxCandidates: 4
        });
      },
      (err: any) => err instanceof GeminiError && err.message.includes("API key is not configured")
    );
  });

  it("redacts API keys and never exposes secret keys in error messages", async () => {
    const sensitiveKey = "AIzaSySecretFakeApiKey12345";
    const mockFetch: typeof fetch = async () => {
      // Simulate fetch throwing an error containing the full URL with the key
      throw new Error(`fetch failed to https://generativelanguage.googleapis.com/v1beta/models/gemini?key=${sensitiveKey}`);
    };

    await assert.rejects(
      async () => {
        await requestGeminiCandidates({
          apiKey: sensitiveKey,
          query: "Some query",
          model: "gemini-3.5-flash-lite",
          baseUrl: "https://mock.api",
          timeoutMs: 5000,
          maxCandidates: 4,
          fetchFn: mockFetch
        });
      },
      (err: any) => {
        assert.ok(err instanceof GeminiError);
        assert.strictEqual(err.message.includes(sensitiveKey), false, "Error message leaked the sensitive API key!");
        assert.ok(err.message.includes("[REDACTED]"), "Error message should have redacted the key");
        return true;
      }
    );
  });

  it("constructs payload with MINIMAL thinking level, bounded maxOutputTokens, and 3 candidates", async () => {
    let capturedBody: any = null;
    const mockFetch: typeof fetch = async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify(MOCK_GEMINI_VALID_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    await requestGeminiCandidates({
      apiKey: "test-key",
      query: "A bodyguard protects a politician's daughter",
      model: "gemini-3.5-flash-lite",
      baseUrl: "https://mock.api",
      timeoutMs: 5000,
      maxCandidates: 3,
      fetchFn: mockFetch
    });

    assert.ok(capturedBody);
    assert.strictEqual(capturedBody.generationConfig?.thinkingConfig?.thinkingLevel, "MINIMAL");
    assert.strictEqual(capturedBody.generationConfig?.maxOutputTokens, 1200);
    assert.strictEqual(capturedBody.generationConfig?.responseMimeType, "application/json");
    assert.ok(capturedBody.contents[0].parts[0].text.includes("Identify up to 3 real"));
  });

  it("extracts JSON correctly from multi-part response with thought parts", async () => {
    let capturedDiag: any = null;
    const multiPartResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: "Thinking process: The user wants a bodyguard romance. Let's suggest The K2.",
                thought: true
              },
              {
                text: JSON.stringify([
                  {
                    canonicalTitle: "The K2",
                    approximateYear: 2016,
                    expectedMediaType: "KDRAMA",
                    confidenceScore: 0.95,
                    matchReason: "Bodyguard romance plot"
                  }
                ])
              }
            ]
          },
          finishReason: "STOP"
        }
      ]
    };

    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify(multiPartResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const candidates = await requestGeminiCandidates({
      apiKey: "test-key",
      query: "bodyguard romance",
      model: "gemini-3.5-flash-lite",
      baseUrl: "https://mock.api",
      timeoutMs: 5000,
      maxCandidates: 3,
      fetchFn: mockFetch,
      onDiagnostic: (diag) => {
        capturedDiag = diag;
      }
    });

    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].canonicalTitle, "The K2");
    assert.ok(capturedDiag);
    assert.strictEqual(capturedDiag.hasThoughtParts, true);
    assert.strictEqual(capturedDiag.acceptedCandidatesCount, 1);
  });

  it("handles markdown code-fenced JSON cleanly", async () => {
    const fencedResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: "```json\n[\n  {\n    \"canonicalTitle\": \"Crash Landing on You\",\n    \"expectedMediaType\": \"KDRAMA\",\n    \"matchReason\": \"Trope match\"\n  }\n]\n```"
              }
            ]
          }
        }
      ]
    };

    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify(fencedResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const candidates = await requestGeminiCandidates({
      apiKey: "test-key",
      query: "paragliding romance",
      model: "gemini-3.5-flash-lite",
      baseUrl: "https://mock.api",
      timeoutMs: 5000,
      maxCandidates: 3,
      fetchFn: mockFetch
    });

    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].canonicalTitle, "Crash Landing on You");
  });

  describe("Phase 5H Upstream Error Diagnostics", () => {
    it("captures structured INVALID_ARGUMENT (HTTP 400) and sanitizes secrets and user query", async () => {
      let capturedDiag: any = null;
      const secretKey = "AIzaSySecretKey123456";
      const userQuery = "secret sensitive query text";

      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 400,
              message: `Invalid argument in request for key=${secretKey}: unknown parameter for query: ${userQuery}`,
              status: "INVALID_ARGUMENT"
            }
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      };

      await assert.rejects(
        async () => {
          await requestGeminiCandidates({
            apiKey: secretKey,
            query: userQuery,
            model: "gemini-3.1-flash-lite",
            baseUrl: "https://mock.api",
            timeoutMs: 5000,
            maxCandidates: 3,
            fetchFn: mockFetch,
            onDiagnostic: (diag) => {
              capturedDiag = diag;
            }
          });
        },
        (err: any) => err instanceof GeminiError && err.statusCode === 400 && err.errorStatus === "INVALID_ARGUMENT"
      );

      assert.ok(capturedDiag);
      assert.strictEqual(capturedDiag.httpStatus, 400);
      assert.strictEqual(capturedDiag.errorCode, 400);
      assert.strictEqual(capturedDiag.errorStatus, "INVALID_ARGUMENT");
      assert.strictEqual(capturedDiag.configuredModel, "gemini-3.1-flash-lite");
      // Verify sensitive key and query are redacted
      assert.ok(!capturedDiag.errorMessage.includes(secretKey));
      assert.ok(!capturedDiag.errorMessage.includes(userQuery));
      assert.ok(capturedDiag.errorMessage.includes("[REDACTED]"));
      assert.ok(capturedDiag.errorMessage.includes("[QUERY]"));
    });

    it("captures structured NOT_FOUND (HTTP 404) for unsupported model identifier", async () => {
      let capturedDiag: any = null;
      const mockFetch: typeof fetch = async () => {
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
      };

      await assert.rejects(
        async () => {
          await requestGeminiCandidates({
            apiKey: "valid-key",
            query: "action show",
            model: "gemini-3.1-flash-lite",
            baseUrl: "https://mock.api",
            timeoutMs: 5000,
            maxCandidates: 3,
            fetchFn: mockFetch,
            onDiagnostic: (diag) => {
              capturedDiag = diag;
            }
          });
        },
        (err: any) => err instanceof GeminiError && err.statusCode === 404 && err.errorStatus === "NOT_FOUND"
      );

      assert.ok(capturedDiag);
      assert.strictEqual(capturedDiag.httpStatus, 404);
      assert.strictEqual(capturedDiag.errorCode, 404);
      assert.strictEqual(capturedDiag.errorStatus, "NOT_FOUND");
      assert.ok(capturedDiag.errorMessage.includes("models/gemini-3.1-flash-lite is not found"));
    });

    it("safely handles non-JSON HTML error bodies without crashing", async () => {
      let capturedDiag: any = null;
      const mockFetch: typeof fetch = async () => {
        return new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          headers: { "Content-Type": "text/html" }
        });
      };

      await assert.rejects(
        async () => {
          await requestGeminiCandidates({
            apiKey: "valid-key",
            query: "action show",
            model: "gemini-3.5-flash-lite",
            baseUrl: "https://mock.api",
            timeoutMs: 5000,
            maxCandidates: 3,
            fetchFn: mockFetch,
            onDiagnostic: (diag) => {
              capturedDiag = diag;
            }
          });
        },
        (err: any) => err instanceof GeminiError && err.statusCode === 502
      );

      assert.ok(capturedDiag);
      assert.strictEqual(capturedDiag.httpStatus, 502);
      assert.strictEqual(capturedDiag.errorStatus, undefined);
      assert.strictEqual(capturedDiag.errorMessage, undefined);
    });

    it("truncates overly long error messages to a maximum of 120 characters", async () => {
      let capturedDiag: any = null;
      const longMessage = "E".repeat(300);
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 500,
              message: longMessage,
              status: "INTERNAL"
            }
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      };

      await assert.rejects(
        async () => {
          await requestGeminiCandidates({
            apiKey: "valid-key",
            query: "action show",
            model: "gemini-3.5-flash-lite",
            baseUrl: "https://mock.api",
            timeoutMs: 5000,
            maxCandidates: 3,
            fetchFn: mockFetch,
            onDiagnostic: (diag) => {
              capturedDiag = diag;
            }
          });
        },
        (err: any) => err instanceof GeminiError && err.statusCode === 500
      );

      assert.ok(capturedDiag);
      assert.ok(capturedDiag.errorMessage.length <= 120);
    });

    it("captures structured FAILED_PRECONDITION (HTTP 400) location error and sanitizes secrets and user query", async () => {
      let capturedDiag: any = null;
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 400,
              message: "User location is not supported for the API use. key=secret-api-key-123",
              status: "FAILED_PRECONDITION"
            }
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      };

      await assert.rejects(
        async () => {
          await requestGeminiCandidates({
            apiKey: "secret-api-key-123",
            query: "mysterious plane crash survivors",
            model: "gemini-3.1-flash-lite",
            baseUrl: "https://mock.api",
            timeoutMs: 5000,
            maxCandidates: 3,
            fetchFn: mockFetch,
            onDiagnostic: (diag) => {
              capturedDiag = diag;
            }
          });
        },
        (err: any) => err instanceof GeminiError && err.statusCode === 400
      );

      assert.ok(capturedDiag);
      assert.strictEqual(capturedDiag.httpStatus, 400);
      assert.strictEqual(capturedDiag.errorStatus, "FAILED_PRECONDITION");
      assert.ok(capturedDiag.errorMessage.includes("User location is not supported for the API use."));
      assert.ok(!JSON.stringify(capturedDiag).includes("secret-api-key-123"));
      assert.ok(capturedDiag.errorMessage.includes("[REDACTED]"));
    });
  });
});
