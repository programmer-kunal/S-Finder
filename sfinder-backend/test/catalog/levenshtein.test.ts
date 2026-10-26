import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { boundedLevenshtein, titleMatchesTypoToken } from "../../src/catalog/levenshtein";

describe("Phase 5BB: Bounded Levenshtein Distance & Typo Recovery Unit Tests", () => {
  it("identifies single-character substitution (frosen vs frozen)", () => {
    const dist = boundedLevenshtein("frosen", "frozen", 2);
    assert.strictEqual(dist, 1);
  });

  it("identifies three-character distance for phonetic typo (twilite vs twilight)", () => {
    // Exact edit distance is 3 ('twili' match, 'te' -> 'ght': substitute t->g, insert h, substitute e->t)
    const dist = boundedLevenshtein("twilite", "twilight", 3);
    assert.strictEqual(dist, 3);
    // When maxDistance is 2, it correctly returns Infinity
    assert.strictEqual(boundedLevenshtein("twilite", "twilight", 2), Infinity);
  });

  it("rejects dissimilar words beyond maxDistance (twilite vs dead)", () => {
    const dist = boundedLevenshtein("twilite", "dead", 2);
    assert.strictEqual(dist, Infinity);
  });

  it("returns distance zero for identical strings (case-insensitive)", () => {
    assert.strictEqual(boundedLevenshtein("Frozen", "frozen", 2), 0);
    assert.strictEqual(boundedLevenshtein("TWILIGHT", "twilight", 2), 0);
    assert.strictEqual(boundedLevenshtein("doctor", "doctor", 2), 0);
  });

  it("efficiently short-circuits on large length differences without matrix allocation", () => {
    // Length difference > 2 (e.g. 3 vs 8)
    assert.strictEqual(boundedLevenshtein("cat", "caterpillar", 2), Infinity);
    assert.strictEqual(boundedLevenshtein("supercalifragilistic", "super", 2), Infinity);
  });

  it("titleMatchesTypoToken correctly distinguishes matched and unmatched titles", () => {
    // 'twilite' should match 'The Twilight Zone' via adaptive typo tolerance (edit distance 3 for 7-char token)
    assert.strictEqual(titleMatchesTypoToken("The Twilight Zone", "twilite"), true);
    assert.strictEqual(titleMatchesTypoToken("The Dead Zone", "twilite"), false);

    // 'frosen' should match 'Frozen Planet' but NOT 'Planet Earth' (edit distance 1)
    assert.strictEqual(titleMatchesTypoToken("Frozen Planet", "frosen"), true);
    assert.strictEqual(titleMatchesTypoToken("Planet Earth", "frosen"), false);

    // Short tokens (< 4 chars) should be ignored to prevent false positives on abbreviations/prepositions
    assert.strictEqual(titleMatchesTypoToken("The Flash", "the", 2), false);
    assert.strictEqual(titleMatchesTypoToken("Doctor Who", "who", 2), false);
  });

  it("does not falsely promote unrelated titles on single weak token matches", () => {
    // Unrelated words with completely different roots
    assert.strictEqual(titleMatchesTypoToken("Six Feet Under", "twilite", 2), false);
    assert.strictEqual(titleMatchesTypoToken("Black Butler", "frosen", 2), false);
    assert.strictEqual(titleMatchesTypoToken("Samurai 7", "shannara", 2), false);
  });
});
