import { describe, it } from "node:test";
import assert from "node:assert";
import { TvMazeBudgetExceededError, TvMazeResolver } from "../src/tvmaze";
import { Candidate } from "../src/types";
import {
  MOCK_TVMAZE_AMBIGUOUS_DARK,
  MOCK_TVMAZE_K2,
  MOCK_TVMAZE_MISSING_POSTER_SHOW,
  MOCK_TVMAZE_YARGI
} from "./mocks";

describe("TVmaze Resolver Unit Tests", () => {
  it("resolves exact title correctly", () => {
    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4);
    const candidate: Candidate = {
      canonicalTitle: "The K2",
      expectedMediaType: "KDRAMA",
      confidenceScore: 0.9,
      matchReason: "Bodyguard plot",
      approximateYear: 2016
    };

    const match = resolver.findBestMatch(candidate, MOCK_TVMAZE_K2);
    assert.ok(match);
    assert.strictEqual(match.id, 18296);
    assert.strictEqual(match.name, "The K2");

    const verified = resolver.mapShowToVerifiedItem(match, candidate.matchReason);
    assert.strictEqual(verified.id, "tvmaze-18296");
    assert.strictEqual(verified.mediaType, "KDRAMA");
    assert.strictEqual(verified.releaseYear, 2016);
    assert.strictEqual(verified.rating, 6.5);
    assert.strictEqual(verified.posterUrl, "https://static.tvmaze.com/uploads/images/medium_portrait/79/199047.jpg");
    assert.strictEqual(verified.matchExplanation, "Bodyguard plot");
  });

  it("disambiguates ambiguous titles by year and category", () => {
    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4);
    const candidate: Candidate = {
      canonicalTitle: "Dark",
      expectedMediaType: "TV_SERIES",
      confidenceScore: 0.85,
      matchReason: "German time travel cave mystery",
      approximateYear: 2017 // German sci-fi show premiered in 2017
    };

    // Both "In the Dark" (2019) and "Dark" (2017) are present in results
    const match = resolver.findBestMatch(candidate, MOCK_TVMAZE_AMBIGUOUS_DARK);
    assert.ok(match);
    // Must pick "Dark" (id: 17849) premiered in 2017, not "In the Dark" (id: 34500)
    assert.strictEqual(match.id, 17849);
    assert.strictEqual(match.name, "Dark");
  });

  it("handles missing posters, summary, and ratings gracefully without crashing", () => {
    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4);
    const match = MOCK_TVMAZE_MISSING_POSTER_SHOW[0].show;
    const verified = resolver.mapShowToVerifiedItem(match, "Docuseries plot");

    assert.strictEqual(verified.id, "tvmaze-99999");
    assert.strictEqual(verified.title, "Indie Obscure Docuseries");
    assert.strictEqual(verified.posterUrl, null);
    assert.strictEqual(verified.synopsis, "");
    assert.strictEqual(verified.rating, null);
    assert.strictEqual(verified.releaseYear, null);
  });

  it("strictly enforces maximum allowed TVmaze API requests budget (max 4)", async () => {
    let fetchCounter = 0;
    const mockFetch: typeof fetch = async (url) => {
      fetchCounter++;
      const urlStr = url.toString();
      if (urlStr.includes("K2")) return new Response(JSON.stringify(MOCK_TVMAZE_K2));
      if (urlStr.includes("Dark")) return new Response(JSON.stringify(MOCK_TVMAZE_AMBIGUOUS_DARK));
      if (urlStr.includes("Yargi")) return new Response(JSON.stringify(MOCK_TVMAZE_YARGI));
      return new Response(JSON.stringify([]));
    };

    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4, "TVmaze", mockFetch);

    // Provide 6 candidates
    const candidates: Candidate[] = [
      { canonicalTitle: "The K2", expectedMediaType: "KDRAMA", confidenceScore: 0.9, matchReason: "Reason 1", approximateYear: 2016 },
      { canonicalTitle: "Dark", expectedMediaType: "TV_SERIES", confidenceScore: 0.8, matchReason: "Reason 2", approximateYear: 2017 },
      { canonicalTitle: "Yargi", expectedMediaType: "TURKISH_DRAMA", confidenceScore: 0.85, matchReason: "Reason 3", approximateYear: 2021 },
      { canonicalTitle: "Candidate 4", expectedMediaType: "TV_SERIES", confidenceScore: 0.7, matchReason: "Reason 4" },
      { canonicalTitle: "Candidate 5 (Should be blocked)", expectedMediaType: "TV_SERIES", confidenceScore: 0.6, matchReason: "Reason 5" },
      { canonicalTitle: "Candidate 6 (Should be blocked)", expectedMediaType: "TV_SERIES", confidenceScore: 0.5, matchReason: "Reason 6" }
    ];

    const verified = await resolver.resolveCandidates(candidates);

    // Call count must not exceed 4
    assert.ok(resolver.getCallCount() <= 4, `Call count was ${resolver.getCallCount()}, exceeded 4!`);
    assert.strictEqual(fetchCounter, 4, `Fetch calls were ${fetchCounter}, expected exactly 4!`);
    assert.ok(verified.length >= 3);
  });

  it("throws TvMazeBudgetExceededError if searchShows is called after budget is exhausted", async () => {
    const mockFetch: typeof fetch = async () => new Response(JSON.stringify([]));
    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 2, "TVmaze", mockFetch);

    await resolver.searchShows("Call 1");
    await resolver.searchShows("Call 2");

    // 3rd call must throw budget error
    await assert.rejects(
      async () => {
        await resolver.searchShows("Call 3");
      },
      (err: any) => err instanceof TvMazeBudgetExceededError
    );
  });

  it("safely binds default global fetch to prevent Cloudflare V8 Illegal invocation errors", () => {
    // Instantiating with default fetch should produce a safe callable arrow function
    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4);
    assert.strictEqual(typeof (resolver as any).fetchFn, "function");
  });

  it("resolves exact title with category match (55 + 20 = 75) when year is missing", () => {
    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4);
    const candidate: Candidate = {
      canonicalTitle: "The K2",
      expectedMediaType: "KDRAMA",
      confidenceScore: 0.9,
      matchReason: "Bodyguard plot"
      // Note: approximateYear omitted
    };

    const matchEval = resolver.evaluateCandidateMatch(candidate, MOCK_TVMAZE_K2);
    assert.strictEqual(matchEval.highestScore, 75);
    assert.ok(matchEval.bestShow);
    assert.strictEqual(matchEval.bestShow.name, "The K2");
  });

  it("normalizes punctuation so hyphenated and punctuated titles match", () => {
    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4);
    const candidate: Candidate = {
      canonicalTitle: "The K-2", // Hyphenated variant
      expectedMediaType: "KDRAMA",
      confidenceScore: 0.9,
      matchReason: "Bodyguard plot",
      approximateYear: 2016
    };

    const match = resolver.findBestMatch(candidate, MOCK_TVMAZE_K2);
    assert.ok(match);
    assert.strictEqual(match.name, "The K2");
  });

  it("reports detailed rejection reasons when candidates fail to match catalog", async () => {
    const mockFetch: typeof fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes("Empty")) return new Response(JSON.stringify([]));
      if (urlStr.includes("Unrelated")) {
        return new Response(JSON.stringify([
          {
            score: 0.4,
            show: {
              id: 8888,
              name: "Completely Different Sci-Fi Movie",
              type: "Scripted",
              language: "English",
              genres: ["Sci-Fi"],
              status: "Ended",
              premiered: "1990-01-01",
              summary: null
            }
          }
        ]));
      }
      return new Response(JSON.stringify([]));
    };

    const resolver = new TvMazeResolver("https://mock.tvmaze", 5000, 4, "TVmaze", mockFetch);
    const rejections: any[] = [];

    const candidates: Candidate[] = [
      { canonicalTitle: "Empty Show", expectedMediaType: "TV_SERIES", matchReason: "Reason 1" },
      { canonicalTitle: "Unrelated Show", expectedMediaType: "KDRAMA", matchReason: "Reason 2", approximateYear: 2024 }
    ];

    const results = await resolver.resolveCandidates(candidates, (rejection) => {
      rejections.push(rejection);
    });

    assert.strictEqual(results.length, 0);
    assert.strictEqual(rejections.length, 2);
    assert.strictEqual(rejections[0].reason, "NO_TVMAZE_RESULTS");
    assert.strictEqual(rejections[1].reason, "SCORE_BELOW_THRESHOLD");
    assert.ok(rejections[1].highestScore < 75);
  });
});
