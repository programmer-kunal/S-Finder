import { describe, it } from "node:test";
import assert from "node:assert";
import { evaluateSemanticRelevance, extractSignificantTokens, RELEVANCE_ACCEPTANCE_THRESHOLD } from "../src/relevance";
import { executeDiscoveryPipeline } from "../src/pipeline";
import { TvMazeResolver } from "../src/tvmaze";
import { Env, VerifiedEntertainmentItem } from "../src/types";
import {
  MOCK_FIXTURE_A_NARRATIVE_QUERY,
  MOCK_FIXTURE_B_IRRELEVANT_CANDIDATE,
  MOCK_FIXTURE_B_TVMAZE_SHOW,
  MOCK_FIXTURE_C_RELEVANT_ISLAND_CANDIDATE,
  MOCK_FIXTURE_C_TVMAZE_SHOW,
  MOCK_FIXTURE_D_CANDIDATE,
  MOCK_FIXTURE_D_MOOD_QUERY,
  MOCK_FIXTURE_E_CANDIDATE,
  MOCK_FIXTURE_E_EXACT_QUERY,
  MOCK_FIXTURE_F_MIXED_RESPONSE,
  MOCK_FIXTURE_H_ADVERSARIAL_CANDIDATE,
  MOCK_FIXTURE_H_TVMAZE_SHOW,
  MOCK_FIXTURE_LOW_CONFIDENCE_RESPONSE,
  MOCK_TVMAZE_AMBIGUOUS_DARK,
  MOCK_TVMAZE_K2
} from "./mocks";

describe("Phase 5Q Semantic Relevance and Regression Tests", () => {
  const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4);

  describe("Semantic Relevance Evaluator Unit Tests", () => {
    it("extracts significant concept tokens while filtering common stop words and query filler", () => {
      const tokens = extractSignificantTokens(MOCK_FIXTURE_A_NARRATIVE_QUERY);
      assert.ok(tokens.includes("plane"));
      assert.ok(tokens.includes("crash"));
      assert.ok(tokens.includes("survivors"));
      assert.ok(tokens.includes("stranded"));
      assert.ok(tokens.includes("mysterious"));
      assert.ok(tokens.includes("island"));
      assert.ok(tokens.includes("strange"));
      assert.ok(tokens.includes("events"));
      assert.ok(tokens.includes("unanswered"));
      assert.ok(tokens.includes("questions"));

      // Filler words must be filtered out
      assert.strictEqual(tokens.includes("vaguely"), false);
      assert.strictEqual(tokens.includes("remember"), false);
      assert.strictEqual(tokens.includes("series"), false);
      assert.strictEqual(tokens.includes("about"), false);
      assert.strictEqual(tokens.includes("difficult"), false);
    });

    it("Fixture B: rejects clearly irrelevant genuine catalog title (I Am Not Okay With This)", () => {
      const show = MOCK_FIXTURE_B_TVMAZE_SHOW[0].show;
      const verifiedItem: VerifiedEntertainmentItem = resolver.mapShowToVerifiedItem(
        show,
        MOCK_FIXTURE_B_IRRELEVANT_CANDIDATE.matchReason
      );

      const result = evaluateSemanticRelevance(
        MOCK_FIXTURE_A_NARRATIVE_QUERY,
        MOCK_FIXTURE_B_IRRELEVANT_CANDIDATE,
        verifiedItem
      );

      assert.strictEqual(result.isAccepted, false);
      assert.strictEqual(result.titleMatch, false);
      assert.strictEqual(result.rejectionReason, "LOW_SEMANTIC_RELEVANCE");
      assert.ok(result.score < RELEVANCE_ACCEPTANCE_THRESHOLD, `Score ${result.score} was >= threshold ${RELEVANCE_ACCEPTANCE_THRESHOLD}`);
      assert.strictEqual(result.matchedSynopsisTokens.length, 0);
    });

    it("Fixture C: accepts well-supported candidate matching narrative premise", () => {
      const show = MOCK_FIXTURE_C_TVMAZE_SHOW[0].show;
      const verifiedItem: VerifiedEntertainmentItem = resolver.mapShowToVerifiedItem(
        show,
        MOCK_FIXTURE_C_RELEVANT_ISLAND_CANDIDATE.matchReason
      );

      const result = evaluateSemanticRelevance(
        MOCK_FIXTURE_A_NARRATIVE_QUERY,
        MOCK_FIXTURE_C_RELEVANT_ISLAND_CANDIDATE,
        verifiedItem
      );

      assert.strictEqual(result.isAccepted, true);
      assert.ok(result.score >= 50, `Score was ${result.score}, expected >= 50`);
      assert.ok(result.matchedSynopsisTokens.length >= 3);
      assert.ok(result.matchedGenres.length >= 1);
    });

    it("Fixture E: preserves direct exact-title discovery (The K2)", () => {
      const show = MOCK_TVMAZE_K2[0].show;
      const verifiedItem: VerifiedEntertainmentItem = resolver.mapShowToVerifiedItem(
        show,
        MOCK_FIXTURE_E_CANDIDATE.matchReason
      );

      const result = evaluateSemanticRelevance(
        MOCK_FIXTURE_E_EXACT_QUERY,
        MOCK_FIXTURE_E_CANDIDATE,
        verifiedItem
      );

      assert.strictEqual(result.isAccepted, true);
      assert.strictEqual(result.titleMatch, true);
      assert.ok(result.score >= 60);
    });

    it("Fixture D: preserves strong mood-based recommendations (Dark)", () => {
      const show = MOCK_TVMAZE_AMBIGUOUS_DARK[1].show; // "Dark" (2017)
      const verifiedItem: VerifiedEntertainmentItem = resolver.mapShowToVerifiedItem(
        show,
        MOCK_FIXTURE_D_CANDIDATE.matchReason
      );

      const result = evaluateSemanticRelevance(
        MOCK_FIXTURE_D_MOOD_QUERY,
        MOCK_FIXTURE_D_CANDIDATE,
        verifiedItem
      );

      assert.strictEqual(result.isAccepted, true);
      assert.ok(result.score >= 50);
      assert.ok(result.matchedGenres.length >= 1);
    });

    it("Adversarial Case: an AI explanation cannot override zero catalog evidence", () => {
      // Explanation claims island survival, but catalog show is reality baking
      const show = MOCK_FIXTURE_H_TVMAZE_SHOW[0].show;
      const verifiedItem: VerifiedEntertainmentItem = resolver.mapShowToVerifiedItem(
        show,
        MOCK_FIXTURE_H_ADVERSARIAL_CANDIDATE.matchReason
      );

      const result = evaluateSemanticRelevance(
        MOCK_FIXTURE_A_NARRATIVE_QUERY,
        MOCK_FIXTURE_H_ADVERSARIAL_CANDIDATE,
        verifiedItem
      );

      // Explanation is capped at 15 pts, threshold is 20, catalog synopsis/genres have 0 match
      assert.strictEqual(result.isAccepted, false);
      assert.strictEqual(result.rejectionReason, "LOW_SEMANTIC_RELEVANCE");
      assert.ok(result.score < RELEVANCE_ACCEPTANCE_THRESHOLD, `Score ${result.score} was >= ${RELEVANCE_ACCEPTANCE_THRESHOLD}`);
    });
  });

  describe("Pipeline Regression & Integration Tests", () => {
    it("Fixture F: ranks relevant candidate #1 and filters out unrelated genuine title", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();

        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify(MOCK_FIXTURE_F_MIXED_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        if (url.includes("api.tvmaze.com")) {
          if (url.includes("Island") || url.includes("Mysterious")) {
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
        MAX_CANDIDATES: "3",
        MAX_TVMAZE_CALLS: "4"
      };

      const response = await executeDiscoveryPipeline(
        { query: MOCK_FIXTURE_A_NARRATIVE_QUERY, category: "ALL" },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.fallbackUsed, false);
      // The relevant show was accepted; the irrelevant show was rejected!
      assert.strictEqual(response.resolvedCount, 1);
      assert.strictEqual(response.items[0].title, "The Mysterious Island Chronicles");
      assert.ok(response.items[0].relevanceScore && response.items[0].relevanceScore >= 50);

      // Verify rejection recorded in diagnostics
      const rejection = response.diagnostic?.candidateRejections.find(
        r => r.candidateTitle === "I Am Not Okay With This"
      );
      assert.ok(rejection);
      assert.strictEqual(rejection.reason, "LOW_SEMANTIC_RELEVANCE");
    });

    it("Fixture G: returns truthful EMPTY mode when candidate set has insufficient evidence", async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();

        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify(MOCK_FIXTURE_LOW_CONFIDENCE_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        if (url.includes("api.tvmaze.com")) {
          if (url.includes("Not%20Okay") || url.includes("Okay")) {
            return new Response(JSON.stringify(MOCK_FIXTURE_B_TVMAZE_SHOW));
          }
          return new Response(JSON.stringify([]));
        }

        return new Response("Not found", { status: 404 });
      };

      const env: Env = {
        GEMINI_API_KEY: "mock-valid-key",
        PRIMARY_MODEL: "gemini-3.1-flash-lite"
      };

      const response = await executeDiscoveryPipeline(
        { query: MOCK_FIXTURE_A_NARRATIVE_QUERY, category: "ALL" },
        env,
        mockFetch
      );

      assert.strictEqual(response.mode, "EMPTY");
      assert.strictEqual(response.resolvedCount, 0);
      assert.strictEqual(response.items.length, 0);
      assert.ok(
        response.disclaimer.includes("No television series matched your description with sufficient confidence")
      );
    });

    it("verifies that no fictional metadata or non-catalog items can ever enter the public response", async () => {
      const phantomShowResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      canonicalTitle: "Completely Made Up Series 2026",
                      approximateYear: 2026,
                      expectedMediaType: "TV_SERIES",
                      confidenceScore: 0.99,
                      matchReason: "A completely fictional show invented by an LLM."
                    }
                  ])
                }
              ]
            }
          }
        ]
      };

      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify(phantomShowResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (url.includes("api.tvmaze.com")) {
          return new Response(JSON.stringify([])); // 0 results in TVmaze
        }
        return new Response("Not found", { status: 404 });
      };

      const env: Env = {
        GEMINI_API_KEY: "mock-valid-key",
        PRIMARY_MODEL: "gemini-3.1-flash-lite"
      };

      const response = await executeDiscoveryPipeline(
        { query: "Completely Made Up Series 2026", category: "ALL" },
        env,
        mockFetch
      );

      assert.notStrictEqual(response.mode, "AI_ENHANCED");
      assert.strictEqual(response.items.length, 0);
    });
  });
});
