import { Candidate, VerifiedEntertainmentItem } from "./types";

/**
 * Common English stop words and query conversational filler words that
 * should not be counted as topical concept terms.
 */
const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him", "himself",
  "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most",
  "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other", "our",
  "ours", "ourselves", "out", "over", "own", "same", "she", "should", "so", "some", "such", "than",
  "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what", "when",
  "where", "which", "while", "who", "whom", "why", "will", "with", "would", "you", "your", "yours",
  // Query conversational filler words
  "vaguely", "remember", "remembers", "remembered", "series", "show", "shows", "movie", "movies",
  "looking", "look", "find", "story", "plot", "watch", "watching", "really", "happening", "make",
  "makes", "difficult", "know", "want", "like", "recommend", "something"
]);

/**
 * Maps query thematic keywords to TV and movie genres.
 */
const THEME_TO_GENRE_MAP: Record<string, string[]> = {
  "mystery": ["mystery"],
  "mysterious": ["mystery"],
  "questions": ["mystery"],
  "puzzle": ["mystery"],
  "detective": ["mystery", "crime"],
  "investigation": ["mystery", "crime"],
  "cop": ["crime", "mystery", "drama"],
  "police": ["crime", "mystery", "drama"],
  "fbi": ["crime", "mystery", "thriller"],
  "suspense": ["thriller", "drama"],
  "suspenseful": ["thriller"],
  "thriller": ["thriller"],
  "thrilling": ["thriller"],
  "twists": ["mystery", "thriller"],
  "twist": ["mystery", "thriller"],
  "dark": ["drama", "crime", "thriller", "mystery"],
  "action": ["action"],
  "bodyguard": ["action", "drama", "romance", "thriller"],
  "fight": ["action"],
  "fighting": ["action"],
  "hero": ["action", "adventure", "drama", "science-fiction", "fantasy"],
  "heroes": ["action", "adventure", "drama", "science-fiction", "fantasy"],
  "superhero": ["action", "science-fiction", "adventure"],
  "vigilante": ["action", "crime", "drama"],
  "enemy": ["action", "drama", "thriller", "crime", "war", "romance"],
  "enemies": ["action", "drama", "thriller", "crime", "war", "romance"],
  "villain": ["action", "crime", "drama", "thriller"],
  "nemesis": ["action", "crime", "drama", "thriller"],
  "antagonist": ["action", "drama", "thriller"],
  "rival": ["drama", "action", "romance", "crime"],
  "rivals": ["drama", "action", "romance", "crime"],
  "rivalry": ["drama", "action", "romance"],
  "feud": ["drama", "crime", "romance"],
  "daughter": ["drama", "family", "romance", "crime"],
  "son": ["drama", "family", "action", "crime"],
  "father": ["drama", "family", "crime"],
  "mother": ["drama", "family"],
  "family": ["drama", "family", "crime"],
  "romance": ["romance"],
  "romantic": ["romance"],
  "love": ["romance", "drama"],
  "lovers": ["romance", "drama"],
  "falls": ["romance", "drama"],
  "falling": ["romance", "drama"],
  "forbidden": ["romance", "drama"],
  "scifi": ["science-fiction"],
  "sci-fi": ["science-fiction"],
  "time": ["science-fiction", "fantasy", "mystery"],
  "travel": ["science-fiction", "fantasy", "adventure"],
  "time-travel": ["science-fiction"],
  "supernatural": ["supernatural"],
  "crime": ["crime"],
  "mob": ["crime", "drama", "action", "thriller"],
  "mafia": ["crime", "drama", "action"],
  "gang": ["crime", "action", "drama"],
  "cartel": ["crime", "thriller", "drama"],
  "horror": ["horror"],
  "scary": ["horror"],
  "comedy": ["comedy"],
  "funny": ["comedy"],
  "adventure": ["adventure"],
  "island": ["adventure", "mystery"],
  "drama": ["drama"],
  "war": ["war", "action", "drama"],
  "military": ["war", "action", "drama"],
  "king": ["drama", "history", "fantasy"],
  "queen": ["drama", "history", "fantasy"],
  "royal": ["drama", "history", "romance"]
};

/**
 * Concept synonyms for descriptive plot and trope searches.
 */
export const CONCEPT_SYNONYMS: Record<string, string[]> = {
  "hero": ["vigilante", "superhero", "protagonist", "crusader", "champion", "defender", "warrior", "fighter"],
  "enemy": ["rival", "villain", "nemesis", "foe", "antagonist", "mob", "crime boss", "feud", "warring", "conflict", "mafia", "gangster"],
  "enemies": ["rivals", "villains", "nemeses", "foes", "antagonists", "feuds", "warring"],
  "daughter": ["child", "girl", "offspring", "family", "heiress"],
  "son": ["child", "boy", "offspring", "family", "heir"],
  "love": ["romance", "romantic", "lovers", "affair", "relationship", "passion", "falls for", "beloved", "smitten"],
  "falls": ["falling", "fell", "falls for", "infatuated", "drawn"],
  "forbidden": ["taboo", "secret", "rival", "feud", "opposing"],
  "bodyguard": ["protector", "guard", "security", "agent"],
  "time": ["temporal", "timeline", "loop", "dimension", "generation", "generations", "past", "future"],
  "travel": ["traveler", "travelers", "journey", "trip", "warp", "loop"]
};

export const RELEVANCE_ACCEPTANCE_THRESHOLD = 20;

export interface SemanticRelevanceResult {
  score: number; // 0 to 100
  titleMatch: boolean;
  matchedConcepts: string[];
  matchedGenres: string[];
  matchedSynopsisTokens: string[];
  matchedExplanationTokens: string[];
  isAccepted: boolean;
  rejectionReason?: "LOW_SEMANTIC_RELEVANCE";
}

/**
 * Extracts non-stopword concept terms of length > 2 from text.
 */
export function extractSignificantTokens(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");

  const words = normalized.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return Array.from(new Set(words));
}

export function normalizeTextForMatching(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evaluates semantic relevance between the user's query and a candidate whose
 * existence has been verified against TVmaze.
 *
 * Distinguishes catalog validity (the record exists in TVmaze with matching title/format)
 * from semantic relevance (available evidence indicates the record fits the requested premise).
 *
 * Scoring breakdown:
 * 1. Title Relevance (up to 60 pts): Direct title searches match with high confidence.
 * 2. Verified Catalog Evidence (up to 50 pts):
 *    - TVmaze verified genres matching query concepts (up to 20 pts).
 *    - TVmaze verified synopsis containing query concepts (up to 30 pts).
 * 3. AI Explanation Context (up to 15 pts):
 *    - Bounded to 15 pts so an explanation alone cannot meet the 20 pts acceptance threshold.
 * 4. Model Confidence Factor (up to 15 pts):
 *    - Proportional to candidate.confidenceScore.
 * 5. Acceptance:
 *    - Must be a direct title match OR score >= RELEVANCE_ACCEPTANCE_THRESHOLD (20 pts).
 */
export function evaluateSemanticRelevance(
  query: string,
  candidate: Candidate,
  item: VerifiedEntertainmentItem
): SemanticRelevanceResult {
  const normQuery = normalizeTextForMatching(query);
  const normTitle = normalizeTextForMatching(item.title);
  const normOriginalTitle = item.originalTitle ? normalizeTextForMatching(item.originalTitle) : "";

  let score = 0;
  let titleMatch = false;

  // 1. Direct Title Match Evaluation (up to 60 pts)
  if (normQuery === normTitle || (normOriginalTitle && normQuery === normOriginalTitle)) {
    titleMatch = true;
    score += 60;
  } else if (normTitle.length >= 3 && normQuery.length >= 3) {
    if (normQuery.includes(normTitle) || (normOriginalTitle && normQuery.includes(normOriginalTitle))) {
      titleMatch = true;
      score += 45;
    } else if (normTitle.includes(normQuery)) {
      titleMatch = true;
      score += 40;
    }
  }

  // Check if title words match query tokens
  const queryTokens = extractSignificantTokens(query);
  const titleTokens = extractSignificantTokens(item.title);
  const matchingTitleTokens = queryTokens.filter(t => titleTokens.includes(t));
  if (!titleMatch && matchingTitleTokens.length > 0) {
    score += Math.min(25, matchingTitleTokens.length * 15);
  }

  // 2. Verified Catalog Metadata Evidence (Genres and Synopsis)
  const matchedGenres: string[] = [];
  const matchedSynopsisTokens: string[] = [];
  const matchedExplanationTokens: string[] = [];

  const itemGenresLower = (item.genres || []).map(g => g.toLowerCase());
  const cleanSynopsis = normalizeTextForMatching(item.synopsis || "");
  const cleanExplanation = normalizeTextForMatching(item.matchExplanation || "");

  // Genre matching (max 20 pts)
  let genreScore = 0;
  for (const token of queryTokens) {
    if (itemGenresLower.includes(token)) {
      if (!matchedGenres.includes(token)) {
        matchedGenres.push(token);
        genreScore += 10;
      }
    } else if (THEME_TO_GENRE_MAP[token]) {
      const mapped = THEME_TO_GENRE_MAP[token];
      if (mapped.some(g => itemGenresLower.includes(g))) {
        if (!matchedGenres.includes(token)) {
          matchedGenres.push(token);
          genreScore += 8;
        }
      }
    }
    if (genreScore >= 20) break;
  }
  score += Math.min(20, genreScore);

  // Synopsis concept matching (max 30 pts)
  let synopsisScore = 0;
  if (cleanSynopsis.length > 0) {
    for (const token of queryTokens) {
      const tokenRegex = new RegExp(`\\b${token}\\b`, "i");
      const stem = token.length > 4 ? token.substring(0, token.length - 2) : token;
      const stemRegex = new RegExp(`\\b${stem}[a-z]*\\b`, "i");
      const synonyms = CONCEPT_SYNONYMS[token] || [];
      const hasSynonym = synonyms.some(syn => {
        const synRegex = new RegExp(`\\b${syn}\\b`, "i");
        return synRegex.test(cleanSynopsis);
      });

      if (tokenRegex.test(cleanSynopsis) || stemRegex.test(cleanSynopsis) || hasSynonym) {
        matchedSynopsisTokens.push(token);
        synopsisScore += 10;
      }
      if (synopsisScore >= 30) break;
    }
  }
  score += Math.min(30, synopsisScore);

  // 3. AI Explanation Context (max 15 pts)
  // Explanation provides narrative context explaining how this candidate matches the story query.
  let explanationScore = 0;
  if (cleanExplanation.length > 0) {
    for (const token of queryTokens) {
      const tokenRegex = new RegExp(`\\b${token}\\b`, "i");
      const stem = token.length > 4 ? token.substring(0, token.length - 2) : token;
      const stemRegex = new RegExp(`\\b${stem}[a-z]*\\b`, "i");
      const synonyms = CONCEPT_SYNONYMS[token] || [];
      const hasSynonym = synonyms.some(syn => {
        const synRegex = new RegExp(`\\b${syn}\\b`, "i");
        return synRegex.test(cleanExplanation);
      });

      if (tokenRegex.test(cleanExplanation) || stemRegex.test(cleanExplanation) || hasSynonym) {
        matchedExplanationTokens.push(token);
        explanationScore += 4;
      }
      if (explanationScore >= 15) break;
    }
  }
  score += Math.min(15, explanationScore);

  // 4. Model Confidence factor (max 15 pts)
  if (typeof candidate.confidenceScore === "number") {
    if (candidate.confidenceScore >= 0.4) {
      score += Math.round(candidate.confidenceScore * 15);
    }
  } else {
    // Default neutral confidence contribution
    score += 7;
  }

  // Grounding requirement: to be accepted, a candidate MUST have supporting catalog evidence
  // (a title match, or at least one matching genre or synopsis concept in the verified catalog record).
  // An AI explanation or model confidence alone cannot give relevance to an unevidenced record.
  const hasCatalogGrounding = titleMatch || (genreScore > 0 || synopsisScore > 0);
  
  if (!hasCatalogGrounding) {
    score = 0;
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));
  const isAccepted = titleMatch || (hasCatalogGrounding && finalScore >= RELEVANCE_ACCEPTANCE_THRESHOLD);

  return {
    score: finalScore,
    titleMatch,
    matchedConcepts: Array.from(new Set([...matchedGenres, ...matchedSynopsisTokens])),
    matchedGenres,
    matchedSynopsisTokens,
    matchedExplanationTokens,
    isAccepted,
    rejectionReason: isAccepted ? undefined : "LOW_SEMANTIC_RELEVANCE"
  };
}
