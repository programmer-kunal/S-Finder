import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_BENCHMARK_DATA,
  calculateStrictPrecisionAt5,
  calculateLenientPrecisionAt5,
  calculateGradedPrecisionAt5,
  calculateReciprocalRank
} from "./canonicalBenchmarkLabels";

describe("Phase 5BN: Canonical Benchmark Label Consistency & Regression Guard", () => {
  it("verifies canonical structure has exactly 5 unique results per query across all 5 queries", () => {
    for (const [qid, data] of Object.entries(CANONICAL_BENCHMARK_DATA)) {
      assert.strictEqual(data.results.length, 5, `${qid} must contain exactly 5 results`);
      const itemIds = new Set(data.results.map(r => r.itemId));
      assert.strictEqual(itemIds.size, 5, `${qid} result IDs must be unique`);
    }
  });

  it("verifies Q16 (90s family comedy) canonical labels, Roseanne PARTIALLY_RELEVANT status, and metrics", () => {
    const q16 = CANONICAL_BENCHMARK_DATA.Q16;
    
    // Explicit regression check: Roseanne must be labeled PARTIALLY_RELEVANT due to 1988 premiere
    const roseanne = q16.results.find(r => r.itemId === "tvmaze-690");
    assert.ok(roseanne, "Roseanne must be present in Q16 results");
    assert.strictEqual(roseanne.label, "PARTIALLY_RELEVANT", "Roseanne must be labeled PARTIALLY_RELEVANT under verified broadcast overlap");
    assert.strictEqual(roseanne.releaseYear, 1988, "Roseanne release_year must reflect 1988 premiere");
    assert.ok(roseanne.externalSourceUrl?.includes("tvmaze.com/shows/690/roseanne"), "Must cite external broadcast verification URL");

    // Standard metric calculations with zero ad-hoc flags
    const strictP5 = calculateStrictPrecisionAt5(q16.results);
    const lenientP5 = calculateLenientPrecisionAt5(q16.results);
    const gradedP5 = calculateGradedPrecisionAt5(q16.results);
    const rr = calculateReciprocalRank(q16.results, q16.primaryTargetId);

    assert.strictEqual(strictP5, 0.80, "Strict premiere-year P@5 must be 4/5 = 0.80 (excluding Roseanne 1988)");
    assert.strictEqual(lenientP5, 1.00, "Lenient verified-overlap P@5 must be 5/5 = 1.00 (including Roseanne 90s run)");
    assert.strictEqual(gradedP5, 0.90, "Graded P@5 must be (1.0*4 + 0.5*1)/5 = 0.90");
    assert.strictEqual(rr, 1.00, "Reciprocal Rank for Family Guy at #1 must be 1.00");
  });

  it("verifies Q19 (Cynical high school comedy) canonical metrics prevent Roswell inflation", () => {
    const q19 = CANONICAL_BENCHMARK_DATA.Q19;
    
    const roswell = q19.results.find(r => r.itemId === "tvmaze-673");
    assert.ok(roswell, "Roswell must be in Q19 results");
    assert.strictEqual(roswell.label, "IRRELEVANT", "Roswell must be labeled IRRELEVANT (drama, not comedy)");

    const vghs = q19.results.find(r => r.itemId === "tvmaze-393");
    assert.ok(vghs, "VGHS must be in Q19 results");
    assert.strictEqual(vghs.label, "PARTIALLY_RELEVANT", "VGHS is PARTIALLY_RELEVANT (high school comedy, but not cynical)");

    const strictP5 = calculateStrictPrecisionAt5(q19.results);
    const lenientP5 = calculateLenientPrecisionAt5(q19.results);
    const gradedP5 = calculateGradedPrecisionAt5(q19.results);
    const rr = calculateReciprocalRank(q19.results, q19.primaryTargetId);

    assert.strictEqual(strictP5, 0.20, "Strict P@5 must be 1/5 = 0.20 (only Daria)");
    assert.strictEqual(lenientP5, 0.40, "Lenient P@5 must be 2/5 = 0.40 (Daria + VGHS)");
    assert.strictEqual(gradedP5, 0.30, "Graded P@5 must be (1.0 + 0.5)/5 = 0.30");
    assert.strictEqual(rr, 1.00, "Reciprocal Rank for Daria at #1 must be 1.00");
  });

  it("verifies Q20 (Historical samurai anime) canonical metrics distinguish historical setting from modern spirit", () => {
    const q20 = CANONICAL_BENCHMARK_DATA.Q20;

    const nobunagun = q20.results.find(r => r.itemId === "tvmaze-2068");
    assert.ok(nobunagun, "Nobunagun must be in Q20 results");
    assert.strictEqual(nobunagun.label, "PARTIALLY_RELEVANT", "Nobunagun must be PARTIALLY_RELEVANT (modern sci-fi with samurai soul)");

    const shamanKing = q20.results.find(r => r.itemId === "tvmaze-4097");
    assert.ok(shamanKing, "Shaman King must be in Q20 results");
    assert.strictEqual(shamanKing.label, "PARTIALLY_RELEVANT", "Shaman King must be PARTIALLY_RELEVANT (modern Tokyo with samurai ghost)");

    const strictP5 = calculateStrictPrecisionAt5(q20.results);
    const lenientP5 = calculateLenientPrecisionAt5(q20.results);
    const gradedP5 = calculateGradedPrecisionAt5(q20.results);
    const rr = calculateReciprocalRank(q20.results, q20.primaryTargetId);

    assert.strictEqual(strictP5, 0.60, "Strict P@5 must be 3/5 = 0.60 (Samurai 7, Sengoku Basara, Gintama)");
    assert.strictEqual(lenientP5, 1.00, "Lenient P@5 must be 5/5 = 1.00 (all 5 feature authentic samurai elements)");
    assert.strictEqual(gradedP5, 0.80, "Graded P@5 must be (1.0*3 + 0.5*2)/5 = 0.80");
    assert.strictEqual(rr, 1.00, "Reciprocal Rank for Samurai 7 at #1 must be 1.00");
  });

  it("verifies Q28 (Enemies to lovers rivalry) canonical metrics", () => {
    const q28 = CANONICAL_BENCHMARK_DATA.Q28;
    const strictP5 = calculateStrictPrecisionAt5(q28.results);
    const lenientP5 = calculateLenientPrecisionAt5(q28.results);
    const gradedP5 = calculateGradedPrecisionAt5(q28.results);
    const rr = calculateReciprocalRank(q28.results, q28.primaryTargetId);

    assert.strictEqual(strictP5, 0.20, "Strict P@5 must be 1/5 = 0.20 (Star-Crossed)");
    assert.strictEqual(lenientP5, 0.80, "Lenient P@5 must be 4/5 = 0.80 (excluding The Last Enemy)");
    assert.strictEqual(gradedP5, 0.50, "Graded P@5 must be (1.0*1 + 0.5*3 + 0.0*1)/5 = 0.50");
    assert.strictEqual(rr, 1.00, "Reciprocal Rank for Star-Crossed at #1 must be 1.00");
  });

  it("verifies Q29 (Time loop reliving the past) canonical metrics and Being Erica rank #3", () => {
    const q29 = CANONICAL_BENCHMARK_DATA.Q29;

    const highCastle = q29.results.find(r => r.itemId === "tvmaze-1804");
    assert.ok(highCastle, "The Man in the High Castle must be in Q29 top 5");
    assert.strictEqual(highCastle.label, "PARTIALLY_RELEVANT", "The Man in the High Castle is PARTIALLY_RELEVANT (alternate history timeline)");

    const truCalling = q29.results.find(r => r.itemId === "tvmaze-1007");
    assert.ok(truCalling, "Tru Calling must be in Q29 top 5");
    assert.strictEqual(truCalling.label, "RELEVANT", "Tru Calling is RELEVANT (reliving days time loop)");

    const strictP5 = calculateStrictPrecisionAt5(q29.results);
    const lenientP5 = calculateLenientPrecisionAt5(q29.results);
    const gradedP5 = calculateGradedPrecisionAt5(q29.results);
    const rr = calculateReciprocalRank(q29.results, q29.primaryTargetId);

    assert.strictEqual(strictP5, 0.40, "Strict P@5 must be 2/5 = 0.40 (Being Erica, Tru Calling)");
    assert.strictEqual(lenientP5, 0.80, "Lenient P@5 must be 4/5 = 0.80");
    assert.strictEqual(gradedP5, 0.60, "Graded P@5 must be (1.0*2 + 0.5*2)/5 = 0.60");
    assert.strictEqual(Math.round(rr * 1000) / 1000, 0.333, "Reciprocal Rank for Being Erica at rank #3 is 1/3 = 0.333");
  });
});
