/**
 * S Finder Narrative Concepts & Trope Synonyms Dictionary.
 * Maps high-level narrative tropes and query concepts to grounded catalog synonyms
 * for SQLite FTS5 phrase matching and broad candidate expansion.
 */

import { analyzeQuery } from "./language";

export interface TropeDefinition {
  canonical: string;
  keywords: string[];
  synonyms: string[];
}

export const TROPE_DICTIONARY: Record<string, TropeDefinition> = {
  "enemies to lovers": {
    canonical: "enemies to lovers",
    keywords: ["enemies", "lovers", "rivals", "hate", "feud", "romance"],
    synonyms: [
      "star-crossed", "enemies to lovers", "hate to love", "forbidden love",
      "rival lovers", "feuding families", "rivalry"
    ]
  },
  "fake dating": {
    canonical: "fake dating",
    keywords: ["fake", "dating", "pretend", "marriage"],
    synonyms: [
      "pretend relationship", "marriage of convenience", "sham",
      "contract marriage", "fake boyfriend", "fake girlfriend", "arranged"
    ]
  },
  "time travel": {
    canonical: "time travel",
    keywords: ["time", "travel", "loop", "past", "future"],
    synonyms: [
      "time loop", "timeline", "temporal", "time slip", "alternate history",
      "reliving", "relive", "same day", "dimension"
    ]
  },
  "heist": {
    canonical: "heist",
    keywords: ["heist", "robbery", "thief", "steal"],
    synonyms: [
      "robbery", "thief", "caper", "crew", "vault", "mastermind",
      "con artist", "bank robbery", "steal"
    ]
  },
  "undercover": {
    canonical: "undercover",
    keywords: ["undercover", "spy", "agent", "infiltrate"],
    synonyms: [
      "infiltrate", "secret agent", "mole", "double agent", "espionage",
      "disguise", "covert", "impostor"
    ]
  },
  "bodyguard": {
    canonical: "bodyguard",
    keywords: ["bodyguard", "protection", "protect", "target"],
    synonyms: [
      "protection", "protecting", "target", "assassination", "security",
      "protects", "guard"
    ]
  },
  "whodunit": {
    canonical: "whodunit",
    keywords: ["murder", "mystery", "detective", "clues"],
    synonyms: [
      "murder mystery", "detective", "investigation", "suspects",
      "clues", "homicide", "sleuth", "whodunit"
    ]
  },
  "forced proximity": {
    canonical: "forced proximity",
    keywords: ["roommates", "proximity", "stuck", "together"],
    synonyms: [
      "roommates", "cohabitation", "stranded together", "living together",
      "confined", "sharing an apartment"
    ]
  },
  "forbidden love": {
    canonical: "forbidden love",
    keywords: ["forbidden", "taboo", "secret", "love"],
    synonyms: [
      "star-crossed", "taboo", "secret relationship", "scandal",
      "opposing families", "prohibited"
    ]
  },
  "second chance": {
    canonical: "second chance",
    keywords: ["second", "chance", "reunited", "ex"],
    synonyms: [
      "reunited", "past love", "rekindled", "years later", "former lovers",
      "reconnecting"
    ]
  },
  "survival": {
    canonical: "survival",
    keywords: ["survival", "survive", "apocalypse", "stranded"],
    synonyms: [
      "stranded", "wilderness", "apocalypse", "catastrophe", "outbreak",
      "quarantine", "dystopian", "post-apocalyptic"
    ]
  },
  "vampire slayer": {
    canonical: "vampire slayer",
    keywords: ["vampire", "vampires", "slay", "slays", "slayer", "demon", "demons"],
    synonyms: [
      "slayer", "vampire slayer", "demon hunter", "forces of darkness"
    ]
  },
  "family comedy": {
    canonical: "family comedy",
    keywords: ["family", "comedy", "sitcom", "household"],
    synonyms: [
      "family comedy", "sitcom", "household"
    ]
  },
  "cynical": {
    canonical: "cynical",
    keywords: ["cynical", "sarcasm", "sarcastic", "alienated", "satire"],
    synonyms: [
      "sarcasm", "alienated", "satirical", "deadpan", "misanthrope"
    ]
  }
};

export interface DecadeRange {
  startYear: number;
  endYear: number;
  decadeString: string;
}

/**
 * Extracts a decade range from query text (e.g. '90s', '80s', '1990s', '2000s').
 */
export function extractDecade(query: string): DecadeRange | null {
  const match = query.match(/\b(19\d0|20[012]\d|\d0)s\b/i);
  if (!match) return null;
  const raw = match[1];
  let val = parseInt(raw, 10);
  if (val < 100) {
    val = val >= 30 ? 1900 + val : 2000 + val;
  }
  return {
    startYear: val,
    endYear: val + 9,
    decadeString: match[0].toLowerCase()
  };
}

export const KNOWN_COMPOUND_PHRASES = [
  "high school",
  "family comedy",
  "time loop",
  "time travel",
  "enemies to lovers",
  "fake dating",
  "forced proximity",
  "forbidden love",
  "second chance",
  "murder mystery",
  "dark supernatural",
  "secret agent",
  "double agent",
  "vampire slayer",
  "samurai anime",
  "frozen planet",
  "twilight zone",
  "under the dome",
  "doctor who",
  "samurai 7",
  "mutant x"
];

/**
 * Extracts recognized trope concepts and associated search terms from user query text.
 */
export function extractTropeSynonyms(queryText: string): string[] {
  const lower = queryText.toLowerCase();
  const matchedTerms = new Set<string>();

  for (const [name, def] of Object.entries(TROPE_DICTIONARY)) {
    let matched = false;
    if (lower.includes(name)) {
      matched = true;
    } else {
      // Check if multiple defining keywords appear
      const keywordHits = def.keywords.filter(k => lower.includes(k));
      if (keywordHits.length >= 2) {
        matched = true;
      }
    }

    if (matched) {
      for (const synonym of def.synonyms) {
        matchedTerms.add(synonym);
      }
    }
  }

  return Array.from(matchedTerms);
}

export const STOP_WORDS = new Set([
  "the", "and", "a", "an", "of", "to", "in", "for", "on", "with",
  "at", "by", "from", "is", "it", "as", "or", "are", "this", "that",
  "about", "into", "over", "after", "show", "series", "movie", "film",
  "who", "whom", "whose", "which", "what", "when", "where", "how", "all",
  "he", "she", "him", "her", "his", "hers", "they", "them", "their", "theirs",
  "i", "me", "my", "mine", "you", "your", "yours", "we", "us", "our", "ours",
  "someone", "anyone", "everyone", "person", "want"
]);

/**
 * Detects whether the query text specifically targets an enemies-to-lovers / adversarial romance trope.
 */
export function isEnemiesToLoversQuery(queryText: string): boolean {
  const lower = queryText.toLowerCase();
  if (lower.includes("enemies to lovers") || lower.includes("hate to love") || lower.includes("enemies to romance") || lower.includes("enemies to lovrs")) {
    return true;
  }
  // Check Hindi/Hinglish enemies-to-lovers
  if (/\b(dushman|shatru)\b/i.test(lower) && /\b(pyar|pyaar|prem|lovers?|love)\b/i.test(lower)) {
    return true;
  }
  if (/दुश्मन|शत्रु/.test(queryText) && /प्यार|प्रेम|रोमांटिक/.test(queryText)) {
    return true;
  }
  const hasOpposition = /\b(enemies|rivalry|rivals|feud|hostile|antagonists?)\b/i.test(lower);
  const hasRomance = /\b(lovers|romance|romantic|love|lovrs)\b/i.test(lower);
  return Boolean(hasOpposition && hasRomance);
}

export function buildEnemiesToLoversFtsQuery(): string {
  return [
    '("enemies" + "to" + "lovers")',
    '("hate" + "to" + "love")',
    '("romeo" + "juliet")',
    '(("star" + "crossed") AND ("rivals" OR "enemies" OR "rivalry" OR "conflict" OR "feud" OR "hostile" OR "opposing"))',
    '(("enemies" OR "rivalry" OR "rivals" OR "hostile" OR "feud" OR "opposing") AND ("romance" OR "lovers" OR "love" OR "romantic"))',
  ].join(' OR ');
}

/**
 * Builds the broad disjunctive fallback query when strict matching yields too few candidates.
 */
export function buildBroadFtsQuery(queryText: string): string {
  const analysis = analyzeQuery(queryText);
  const terms = new Set<string>();
  for (const t of analysis.searchTokens) {
    if (t.length > 2 && !STOP_WORDS.has(t.toLowerCase())) {
      terms.add(t.toLowerCase());
    }
  }
  const rawTokens = queryText
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .map(t => t.toLowerCase())
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));
  for (const t of rawTokens) {
    terms.add(t);
  }
  if (terms.size === 0) return "";
  return Array.from(terms).slice(0, 6).map(t => `"${t}"`).join(" OR ");
}

/**
 * Builds a safe SQLite FTS5 MATCH expression from user query text, compound phrases, and detected tropes.
 * Escapes special SQLite FTS5 operators and combines query terms with OR/AND.
 */
export function buildFtsQuery(queryText: string): string {
  const lowerQuery = queryText.toLowerCase();

  // Targeted romance trope strategy:
  if (isEnemiesToLoversQuery(queryText)) {
    return buildEnemiesToLoversFtsQuery();
  }

  const analysis = analyzeQuery(queryText);
  const effectiveQuery = analysis.isHindiOrHinglish || analysis.hasTypoCorrection
    ? analysis.normalizedQuery
    : queryText;
  const effectiveLower = effectiveQuery.toLowerCase();

  // 1. Detect any decade patterns (e.g. '90s', '80s')
  const decade = extractDecade(effectiveQuery) || extractDecade(queryText);
  const decadeToken = decade ? decade.decadeString : null;

  // Clean punctuation and SQLite FTS5 reserved characters
  const rawTokens = effectiveQuery
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .map(t => t.toLowerCase())
    .filter(token => token.length > 2);

  // Filter out stop words AND decade tokens
  const nonStopTokens = rawTokens.filter(t => !STOP_WORDS.has(t) && t !== decadeToken);
  const finalTokens = nonStopTokens.length > 0 ? nonStopTokens : rawTokens;
  const boundedTokens = finalTokens.slice(0, 10);

  // 2. Detect compound phrases
  const compoundPhrases: string[] = [];
  for (const phrase of KNOWN_COMPOUND_PHRASES) {
    if (effectiveLower.includes(phrase) || lowerQuery.includes(phrase)) {
      const parts = phrase.split(/\s+/).map(p => `"${p}"`).join(" + ");
      compoundPhrases.push(`(${parts})`);
      if (phrase === "samurai anime") {
        compoundPhrases.push('("samurai" AND "anime")');
        if (effectiveLower.includes("historical") || lowerQuery.includes("historical")) {
          compoundPhrases.push('("historical" AND "anime")');
        }
      }
    }
  }

  // 3. Detect trope expansions
  const synonyms = [
    ...extractTropeSynonyms(queryText),
    ...extractTropeSynonyms(effectiveQuery)
  ];
  const uniqueSynonyms = Array.from(new Set(synonyms)).slice(0, 5);

  const queryParts: string[] = [];

  if (compoundPhrases.length > 0) {
    queryParts.push(compoundPhrases.join(" OR "));
  }

  if (boundedTokens.length > 0) {
    queryParts.push(boundedTokens.map(t => `"${t}"`).join(" OR "));
  }

  if (uniqueSynonyms.length > 0) {
    const formattedSynonyms = uniqueSynonyms.map(s => {
      const parts = s.trim().split(/\s+/);
      return parts.length > 1 ? `(${parts.map(p => `"${p}"`).join(" + ")})` : `"${s}"`;
    });
    queryParts.push(formattedSynonyms.join(" OR "));
  }

  if (queryParts.length === 0) {
    return "";
  }

  if (queryParts.length === 1) {
    return queryParts[0];
  }

  return queryParts.map(p => `(${p})`).join(" OR ");
}
