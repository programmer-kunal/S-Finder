/**
 * Bounded Levenshtein Distance Utility for S Finder Typo Recovery.
 * Fast, bounded edit-distance computation designed specifically for short candidate sets.
 */

/**
 * Computes Levenshtein distance between two tokens, short-circuiting if the distance exceeds maxDistance.
 * Returns the exact distance if <= maxDistance, or Infinity if greater.
 */
export function boundedLevenshtein(a: string, b: string, maxDistance: number = 2): number {
  if (a === b) return 0;
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > maxDistance) return Infinity;

  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();

  // If one string is empty
  if (s1.length === 0) return s2.length <= maxDistance ? s2.length : Infinity;
  if (s2.length === 0) return s1.length <= maxDistance ? s1.length : Infinity;

  // Single-row dynamic programming
  let prevRow: number[] = [];
  let currRow: number[] = [];

  for (let j = 0; j <= s2.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    currRow[0] = i;
    let minInRow = currRow[0];

    for (let j = 1; j <= s2.length; j++) {
      const cost = s1.charAt(i - 1) === s2.charAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      );
      if (currRow[j] < minInRow) {
        minInRow = currRow[j];
      }
    }

    // Early termination if entire row exceeds maxDistance
    if (minInRow > maxDistance) {
      return Infinity;
    }

    // Swap rows
    prevRow = currRow.slice();
  }

  return prevRow[s2.length] <= maxDistance ? prevRow[s2.length] : Infinity;
}

/**
 * Checks whether a candidate title contains a word that matches a target query token within maxDistance.
 * Only applies to tokens of length >= 4 to avoid falsely matching short abbreviations or prepositions.
 * Uses an adaptive maxDistance (3 for tokens >= 7 chars, 2 for 4..6 chars) when not explicitly overridden.
 * Strictly enforces length difference <= 2 and common 3-character prefix for distance 3 to eliminate
 * permissive false-positive collisions with unrelated words.
 */
export function titleMatchesTypoToken(title: string, queryToken: string, maxDistance?: number): boolean {
  if (!title || !queryToken || queryToken.length < 4) return false;

  const target = queryToken.toLowerCase();
  const maxAllowed = maxDistance !== undefined ? maxDistance : (target.length >= 7 ? 3 : 2);

  const titleTokens = title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 4);

  for (const token of titleTokens) {
    if (token === target) return true;

    // Length difference guard: typos cannot differ by more than 2 characters
    if (Math.abs(token.length - target.length) > 2) continue;

    const dist = boundedLevenshtein(token, target, maxAllowed);
    // Distance <= 2 represents highly confident edit proximity (e.g. 'braking' vs 'breaking' [dist=1], 'frosen' vs 'frozen' [dist=1])
    if (dist <= 2) {
      return true;
    }

    // Distance >= 3 (e.g. 'twilite' vs 'twilight' [dist=3]) requires a common 3-character prefix to prevent phonetic drift
    if (dist <= maxAllowed && token.slice(0, 3) === target.slice(0, 3)) {
      return true;
    }
  }

  return false;
}
