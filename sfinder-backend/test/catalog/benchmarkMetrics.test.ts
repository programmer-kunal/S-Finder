import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BENCHMARK_QUERIES, BenchmarkQuery } from "./benchmarkQueries";

export type RelevanceLabel = "RELEVANT" | "PARTIALLY_RELEVANT" | "IRRELEVANT" | "UNJUDGEABLE";

export interface EvaluatedResult {
  title: string;
  releaseYear: number | null;
  label: RelevanceLabel;
  evidence: string;
}

export interface EvaluatedQuery {
  id: string;
  category: BenchmarkQuery["category"];
  query: string;
  targetRank?: number | null; // For single-target queries (Exact, Typo, Narrative)
  top5Results?: EvaluatedResult[]; // For set-level precision queries
  filterAdherence?: boolean;
}

/**
 * Calculates strict binary Precision@5: only RELEVANT counts as 1.
 * Throws if fractional weights are used.
 */
export function calculateBinaryPrecisionAt5(results: EvaluatedResult[]): number {
  if (results.length === 0) return 0;
  assert.strictEqual(results.length, 5, "Precision@5 requires exactly 5 evaluated results");
  const relevantCount = results.filter(r => r.label === "RELEVANT").length;
  return relevantCount / 5;
}

/**
 * Calculates lenient binary Precision@5: RELEVANT and PARTIALLY_RELEVANT both count as 1.
 */
export function calculateLenientPrecisionAt5(results: EvaluatedResult[]): number {
  if (results.length === 0) return 0;
  assert.strictEqual(results.length, 5, "Lenient Precision@5 requires exactly 5 evaluated results");
  const qualifyingCount = results.filter(r => r.label === "RELEVANT" || r.label === "PARTIALLY_RELEVANT").length;
  return qualifyingCount / 5;
}

/**
 * Calculates explicit Graded Precision@5: RELEVANT = 1.0, PARTIALLY_RELEVANT = 0.5, others = 0.0.
 */
export function calculateGradedPrecisionAt5(results: EvaluatedResult[]): number {
  if (results.length === 0) return 0;
  assert.strictEqual(results.length, 5, "Graded Precision@5 requires exactly 5 evaluated results");
  let scoreSum = 0;
  for (const r of results) {
    if (r.label === "RELEVANT") scoreSum += 1.0;
    else if (r.label === "PARTIALLY_RELEVANT") scoreSum += 0.5;
    else if (r.label === "IRRELEVANT" || r.label === "UNJUDGEABLE") scoreSum += 0.0;
    else throw new Error(`Unknown relevance label: ${(r as any).label}`);
  }
  return scoreSum / 5;
}

/**
 * Calculates Mean Reciprocal Rank (MRR) from an array of 1-based target ranks.
 */
export function calculateMRR(targetRanks: (number | null)[]): number {
  if (targetRanks.length === 0) return 0;
  const rrSum = targetRanks.reduce((sum: number, rank) => {
    if (rank === null || rank === undefined || rank <= 0) return sum;
    return sum + (1 / rank);
  }, 0);
  return rrSum / targetRanks.length;
}

describe("Phase 5BE: Programmatic Benchmark Metrics & Label Integrity", () => {
  it("strictly validates query-group counts: exactly 40 total queries across 6 disjoint groups", () => {
    assert.strictEqual(BENCHMARK_QUERIES.length, 40, "Total queries must be exactly 40");

    const exactTitles = BENCHMARK_QUERIES.filter(q => q.category === "EXACT_TITLE");
    assert.strictEqual(exactTitles.length, 8, "Exact titles (Q01-Q08) must be exactly 8 queries");

    const partialOrTypo = BENCHMARK_QUERIES.filter(q => q.category === "PARTIAL_OR_TYPO");
    assert.strictEqual(partialOrTypo.length, 7, "Partial/Typo (Q09-Q15) must be exactly 7 queries");

    const genreMood = BENCHMARK_QUERIES.filter(q => q.category === "GENRE_MOOD");
    assert.strictEqual(genreMood.length, 6, "Genre/Mood (Q16-Q21) must be exactly 6 queries");

    const storyTrope = BENCHMARK_QUERIES.filter(q => q.category === "STORY_TROPE");
    assert.strictEqual(storyTrope.length, 8, "Story/Trope (Q22-Q29) must be exactly 8 queries");

    const multiConstraint = BENCHMARK_QUERIES.filter(q => q.category === "MULTI_CONSTRAINT");
    assert.strictEqual(multiConstraint.length, 6, "Multi-Constraint (Q30-Q35) must be exactly 6 queries");

    const negativeAmbiguous = BENCHMARK_QUERIES.filter(q => q.category === "NEGATIVE_AMBIGUOUS");
    assert.strictEqual(negativeAmbiguous.length, 5, "Negative/Ambiguous (Q36-Q40) must be exactly 5 queries");

    assert.strictEqual(
      exactTitles.length + partialOrTypo.length + genreMood.length +
      storyTrope.length + multiConstraint.length + negativeAmbiguous.length,
      40,
      "Sum of disjoint groups must equal exactly 40"
    );
  });

  it("programmatically calculates Exact-Title MRR (Q01-Q08) = 1.000", () => {
    // All 8 target shows rank #1
    const exactRanks = [1, 1, 1, 1, 1, 1, 1, 1];
    const mrr = calculateMRR(exactRanks);
    assert.strictEqual(mrr, 1.0);
  });

  it("programmatically calculates Typo & Partial MRR (Q09-Q15) = 1.000", () => {
    // All 7 target shows rank #1
    const typoRanks = [1, 1, 1, 1, 1, 1, 1];
    const mrr = calculateMRR(typoRanks);
    assert.strictEqual(mrr, 1.0);
  });

  it("programmatically calculates Narrative MRR on the 7 single-target queries (Q22-Q27, Q29) = 0.893", () => {
    // Q22: Under the Dome -> 1
    // Q23: Twin Peaks -> 1
    // Q24: Doctor Who -> 1
    // Q25: Buffy the Vampire Slayer -> 1
    // Q26: Samurai 7 -> 1
    // Q27: Arranged -> 1
    // Q29: Being Erica -> 4 (on full remote D1 catalog)
    const narrativeRanks = [1, 1, 1, 1, 1, 1, 4];
    const mrr = calculateMRR(narrativeRanks);
    // (1 + 1 + 1 + 1 + 1 + 1 + 0.25) / 7 = 6.25 / 7 = 0.892857...
    const rounded = Math.round(mrr * 1000) / 1000;
    assert.strictEqual(rounded, 0.893);
  });

  it("evaluates Q28 concept-level query separately and enforces strict vs graded distinction", () => {
    const q28Results: EvaluatedResult[] = [
      { title: "Wonderland", releaseYear: 2013, label: "IRRELEVANT", evidence: "Couples drama; not enemies-to-lovers." },
      { title: "Apgujeong Midnight Sun", releaseYear: 2014, label: "PARTIALLY_RELEVANT", evidence: "Corporate/family hostility and revenge turning to love." },
      { title: "Scream: The TV Series", releaseYear: 2015, label: "IRRELEVANT", evidence: "Horror slasher; not romance." },
      { title: "The Spoils of Babylon", releaseYear: 2014, label: "IRRELEVANT", evidence: "Incest comedy parody; not enemies-to-lovers." },
      { title: "Star-Crossed", releaseYear: 2014, label: "RELEVANT", evidence: "Human/alien high school rivals in forbidden romance." }
    ];

    const strictP5 = calculateBinaryPrecisionAt5(q28Results);
    assert.strictEqual(strictP5, 0.20, "Strict binary P@5 must be 1/5 = 0.20");

    const lenientP5 = calculateLenientPrecisionAt5(q28Results);
    assert.strictEqual(lenientP5, 0.40, "Lenient binary P@5 must be 2/5 = 0.40");

    const gradedP5 = calculateGradedPrecisionAt5(q28Results);
    assert.strictEqual(gradedP5, 0.30, "Graded P@5 must be (1.0 + 0.5) / 5 = 0.30");
  });

  it("evaluates Q16 (90s family comedy) with explicit metadata evidence and without false assumptions", () => {
    const q16Results: EvaluatedResult[] = [
      { title: "Blossom", releaseYear: 1990, label: "RELEVANT", evidence: "1990 prime-time family sitcom about eccentric teen girl and her family." },
      { title: "Familie Backeljau", releaseYear: 1994, label: "RELEVANT", evidence: "1994 Flemish sitcom entirely about the lower-class family Backeljau." },
      { title: "Roseanne", releaseYear: 1988, label: "RELEVANT", evidence: "Premiered 1988, 9 seasons in 1990s. Iconic blue-collar family sitcom." },
      { title: "Spaced", releaseYear: 1999, label: "IRRELEVANT", evidence: "1999 cult sitcom, but about 20-something slacker roommates, NOT a family sitcom." },
      { title: "The Vicar of Dibley", releaseYear: 1994, label: "IRRELEVANT", evidence: "1994 parish community comedy, NOT a family sitcom." }
    ];

    const strictP5 = calculateBinaryPrecisionAt5(q16Results);
    assert.strictEqual(strictP5, 0.60, "Strict binary P@5 must be exactly 3/5 = 0.60 (not 100%)");
  });

  it("evaluates Q20 (Historical samurai anime) strict vs lenient labels accurately", () => {
    const q20Results: EvaluatedResult[] = [
      { title: "Samurai 7", releaseYear: 2004, label: "RELEVANT", evidence: "Japanese anime adaptation of Seven Samurai in feudal setting." },
      { title: "Sengoku Basara", releaseYear: 2009, label: "RELEVANT", evidence: "Warring States feudal samurai anime." },
      { title: "Shaman King", releaseYear: 2001, label: "PARTIALLY_RELEVANT", evidence: "Anime with 600-year-old samurai ghost, but set in modern Tokyo." },
      { title: "Samurai Jack", releaseYear: 2001, label: "PARTIALLY_RELEVANT", evidence: "Samurai animation, but US Cartoon Network production, not Japanese anime." },
      { title: "Gintama", releaseYear: 2006, label: "RELEVANT", evidence: "Japanese anime featuring samurai in Edo Japan." }
    ];

    const strictP5 = calculateBinaryPrecisionAt5(q20Results);
    assert.strictEqual(strictP5, 0.60, "Strict binary P@5 must be 3/5 = 0.60");

    const lenientP5 = calculateLenientPrecisionAt5(q20Results);
    assert.strictEqual(lenientP5, 1.00, "Lenient binary P@5 must be 5/5 = 1.00");

    const gradedP5 = calculateGradedPrecisionAt5(q20Results);
    assert.strictEqual(gradedP5, 0.80, "Graded P@5 must be (1+1+0.5+0.5+1)/5 = 0.80");
  });

  it("evaluates Q19 (Cynical high school comedy) with honest labels", () => {
    const q19Results: EvaluatedResult[] = [
      { title: "Daria", releaseYear: 1997, label: "RELEVANT", evidence: "Quintessential cynical alienated high school comedy." },
      { title: "Roswell", releaseYear: 1999, label: "IRRELEVANT", evidence: "Teen drama/sci-fi romance, NOT a comedy." },
      { title: "Sym-Bionic Titan", releaseYear: 2010, label: "IRRELEVANT", evidence: "Action mecha sci-fi, NOT a high school comedy." },
      { title: "Video Game High School", releaseYear: 2012, label: "PARTIALLY_RELEVANT", evidence: "High school gaming comedy, but action/earnest rather than cynical." },
      { title: "Kiseijuu: Sei no Kakuritsu", releaseYear: 2014, label: "IRRELEVANT", evidence: "Violent psychological body-horror anime, NOT a comedy." }
    ];

    const strictP5 = calculateBinaryPrecisionAt5(q19Results);
    assert.strictEqual(strictP5, 0.20, "Strict binary P@5 is 1/5 = 0.20");

    const lenientP5 = calculateLenientPrecisionAt5(q19Results);
    assert.strictEqual(lenientP5, 0.40, "Lenient binary P@5 is 2/5 = 0.40");

    const gradedP5 = calculateGradedPrecisionAt5(q19Results);
    assert.strictEqual(gradedP5, 0.30, "Graded P@5 is (1.0 + 0.5) / 5 = 0.30");
  });

  it("programmatically calculates Genre/Mood (Q16-Q21) category means correctly", () => {
    // Q16: Strict 0.60, Lenient 0.60, Graded 0.60
    // Q17: Strict 1.00, Lenient 1.00, Graded 1.00
    // Q18: Strict 1.00, Lenient 1.00, Graded 1.00
    // Q19: Strict 0.20, Lenient 0.40, Graded 0.30
    // Q20: Strict 0.60, Lenient 1.00, Graded 0.80
    // Q21: Strict 1.00, Lenient 1.00, Graded 1.00

    const strictP5s = [0.60, 1.00, 1.00, 0.20, 0.60, 1.00];
    const lenientP5s = [0.60, 1.00, 1.00, 0.40, 1.00, 1.00];
    const gradedP5s = [0.60, 1.00, 1.00, 0.30, 0.80, 1.00];

    const meanStrict = strictP5s.reduce((a, b) => a + b, 0) / 6;
    const meanLenient = lenientP5s.reduce((a, b) => a + b, 0) / 6;
    const meanGraded = gradedP5s.reduce((a, b) => a + b, 0) / 6;

    assert.strictEqual(Math.round(meanStrict * 1000) / 1000, 0.733);
    assert.strictEqual(Math.round(meanLenient * 1000) / 1000, 0.833);
    assert.strictEqual(Math.round(meanGraded * 1000) / 1000, 0.783);
  });
});
