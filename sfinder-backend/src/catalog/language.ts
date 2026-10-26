/**
 * S Finder Multilingual Query Normalization & Language Support.
 * Provides deterministic translation, intent extraction, conversational stop-word removal,
 * and typo recovery for Hindi (Devanagari), Hinglish (Latin), and English context queries.
 */

export interface QueryAnalysis {
  originalQuery: string;
  normalizedQuery: string;
  searchTokens: string[];
  inferredContentType?: "MOVIE" | "SERIES";
  isHindiOrHinglish: boolean;
  hasTypoCorrection: boolean;
}

// 1. Conversational intent / filler words to strip out
const HINGLISH_FILLERS = new Set([
  "mujhe", "muze", "hume", "humko", "ek", "chahiye", "chahye", "chahie", "chahate",
  "batao", "dikhao", "dikhaye", "dikhayein", "bataiye", "batao", "btao",
  "koi", "kaisi", "kuch", "kuchh", "wali", "wala", "wale", "waali",
  "hai", "hain", "h", "ho", "ki", "ka", "ke", "k", "ko", "se", "me", "mein", "par", "pe",
  "apne", "apni", "apna", "jisme", "jismein", "jismei", "jismee", "jo", "jiski", "jiske",
  "honi", "hona", "hota", "hoti", "hote", "karte", "karta", "karti", "karne", "krne", "kare",
  "lagta", "lagti", "lagte", "lgta", "lgti", "lgte", "raha", "rahi", "rahe",
  "baat", "karo", "bhi", "toh", "to", "aisi", "aisa", "aise", "chala", "jata", "jaata",
  "story", "kahani", "with", "a", "an", "the", "in", "and", "of", "but"
]);

const DEVANAGARI_FILLERS = new Set([
  "मुझे", "हमें", "एक", "चाहिए", "बताओ", "दिखाओ", "दिखाइए", "बताइए",
  "कोई", "कैसी", "कुछ", "वाली", "वाला", "वाले",
  "है", "हैं", "की", "का", "के", "को", "से", "में", "पर",
  "अपने", "अपनी", "अपना", "जिसमें", "जो", "जिसकी", "जिसके",
  "होनी", "होना", "होता", "होती", "होते", "करते", "करता", "करती", "करने", "करें",
  "लगता", "लगती", "लगते", "रहा", "रही", "रहे",
  "बात", "करो", "भी", "तो", "ऐसी", "ऐसा", "ऐसे", "चला", "जाता",
  "कहानी", "और", "का", "के", "की", "में", "से"
]);

// 2. Common typo replacements (English and Hinglish)
const TYPO_MAP: Record<string, string> = {
  "acton": "action",
  "movi": "movie",
  "romentic": "romantic",
  "romntic": "romantic",
  "chahye": "chahiye",
  "lovrs": "lovers",
  "loopp": "loop",
  "krne": "karne",
  "lgta": "lagta",
  "filam": "film",
  "suspens": "suspense",
  "thril": "thriller",
  "comdy": "comedy"
};

// 3. Concept / Keyword mappings to grounded English catalog terminology
const CONCEPT_MAP: Record<string, string[]> = {
  // Action & Blockbusters
  "dhamakedar": ["action", "explosive", "thriller"],
  "dhamaka": ["action", "explosive"],
  "धमाकेदार": ["action", "explosive", "thriller"],
  "action": ["action"],
  "एक्शन": ["action"],

  // Romance, Love & Rivals
  "romantic": ["romantic", "romance"],
  "romance": ["romance", "romantic", "love"],
  "love": ["love", "romance", "romantic", "lovers"],
  "lovers": ["lovers", "love", "romance", "romantic"],
  "रोमांटिक": ["romantic", "romance"],
  "pyar": ["love", "romance", "lovers"],
  "pyaar": ["love", "romance", "lovers"],
  "prem": ["love", "romance"],
  "प्यार": ["love", "romance", "lovers"],
  "प्रेम": ["love", "romance"],
  "dushman": ["enemies", "enemy", "rivals", "rivalry"],
  "दुश्मन": ["enemies", "enemy", "rivals", "rivalry"],
  "enemy": ["enemies", "enemy", "rivals", "rivalry"],
  "enemies": ["enemies", "enemy", "rivals", "rivalry"],
  "rivalry": ["rivalry", "rivals", "enemies"],
  "rivals": ["rivals", "rivalry", "enemies"],
  "shatru": ["enemies", "enemy"],
  "शत्रु": ["enemies", "enemy"],
  "beti": ["daughter"],
  "बेटी": ["daughter"],
  "ladka": ["boy", "hero"],
  "लड़का": ["boy", "hero"],
  "ladki": ["girl", "heroine"],
  "लड़की": ["girl", "heroine"],
  "hero": ["hero"],
  "हीरो": ["hero"],

  // Twists & Suspense
  "twist": ["twist", "unexpected", "twists"],
  "twists": ["twist", "unexpected", "twists"],
  "ट्विस्ट": ["twist", "unexpected", "twists"],
  "achanak": ["unexpected", "sudden", "twist"],
  "अचानक": ["unexpected", "sudden", "twist"],
  "unexpected": ["unexpected", "twists"],
  "suspense": ["suspense", "suspenseful", "thriller"],
  "सस्पेंस": ["suspense", "suspenseful", "thriller"],
  "thriller": ["thriller", "suspense"],
  "थ्रिलर": ["thriller", "suspense"],

  // Comedy & Sitcom
  "comedy": ["comedy", "sitcom", "funny"],
  "कॉमेडी": ["comedy", "sitcom", "funny"],
  "majedar": ["funny", "comedy", "sitcom"],
  "मजेदार": ["funny", "comedy", "sitcom"],
  "hasya": ["comedy", "humor"],
  "हास्य": ["comedy", "humor"],
  "funny": ["funny", "comedy"],
  "family": ["family", "household", "family comedy"],
  "फैमिली": ["family", "household", "family comedy"],
  "parivar": ["family", "household"],
  "परिवार": ["family", "household"],

  // Time & Loops
  "time": ["time"],
  "टाइम": ["time"],
  "samay": ["time"],
  "समय": ["time"],
  "past": ["past", "reliving", "history"],
  "ateet": ["past", "reliving", "history"],
  "अतीत": ["past", "reliving", "history"],
  "loop": ["time loop", "loop", "reliving", "relive", "same day"],
  "reliving": ["reliving", "relive", "time loop", "same day"],
  "relives": ["reliving", "relive", "time loop", "same day"],
  "relive": ["reliving", "relive", "time loop", "same day"],
  "baar baar": ["time loop", "reliving", "repeat"],
  "bar bar": ["time loop", "reliving", "repeat"],
  "बार-बार": ["time loop", "reliving", "repeat"],
  "lautata": ["reliving", "returns"],
  "लौटता": ["reliving", "returns"],

  // Cynical & High School
  "cynical": ["cynical", "sarcasm", "alienated"],
  "sarcastic": ["sarcasm", "cynical"],
  "व्यंग्यात्मक": ["cynical", "sarcasm"],
  "high school": ["high school"],
  "हाई स्कूल": ["high school"]
};

/**
 * Checks if text contains Devanagari Unicode characters (U+0900 to U+097F).
 */
export function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Normalizes and analyzes a search query.
 * Extracts intent, language, typos, and maps to catalog concepts while preserving
 * exact title search integrity.
 */
export function analyzeQuery(rawQuery: string): QueryAnalysis {
  const originalQuery = (rawQuery || "").trim();
  if (!originalQuery) {
    return {
      originalQuery: "",
      normalizedQuery: "",
      searchTokens: [],
      isHindiOrHinglish: false,
      hasTypoCorrection: false
    };
  }

  const isDevanagari = containsDevanagari(originalQuery);
  let lower = originalQuery.toLowerCase();

  // 1. Detect Inferred Media Type
  let inferredContentType: "MOVIE" | "SERIES" | undefined;
  if (/\b(movies?|films?|cinema|movi|filam)\b/i.test(lower) || /मूवी|फिल्म|सिनेमा/.test(originalQuery)) {
    inferredContentType = "MOVIE";
  } else if (/\b(series|shows?|sitcom|dharaavahik)\b/i.test(lower) || /सीरीज|शो|धारावाहिक/.test(originalQuery)) {
    inferredContentType = "SERIES";
  }

  // 2. Tokenize and correct typos
  // Split on punctuation/spaces, preserving Devanagari script letters and combining marks (\p{L}\p{M})
  const rawWords = originalQuery
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}\s\-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0);

  let hasTypoCorrection = false;
  let hasHinglishOrHindi = isDevanagari;

  const correctedWords: string[] = [];
  for (const word of rawWords) {
    const wLower = word.toLowerCase();
    if (TYPO_MAP[wLower]) {
      correctedWords.push(TYPO_MAP[wLower]);
      hasTypoCorrection = true;
    } else {
      correctedWords.push(wLower);
    }
  }

  // Check for Hinglish markers
  for (const w of correctedWords) {
    if (HINGLISH_FILLERS.has(w) || CONCEPT_MAP[w] || DEVANAGARI_FILLERS.has(w)) {
      if (w !== "action" && w !== "movie" && w !== "comedy" && w !== "family" && w !== "time" && w !== "past" && w !== "funny") {
        hasHinglishOrHindi = true;
      }
    }
  }

  // 3. Multi-word phrase replacements
  let fullCorrected = correctedWords.join(" ");
  fullCorrected = fullCorrected
    .replace(/\bbaar\s+baar\b/g, "baar-baar")
    .replace(/\bbar\s+bar\b/g, "bar-bar")
    .replace(/बार\s+बार/g, "बार-बार")
    .replace(/\bhigh\s+school\b/g, "high-school")
    .replace(/\bहाई\s+स्कूल\b/g, "हाई-स्कूल");

  const normalizedTokens = fullCorrected.split(/\s+/);

  // 4. Filter fillers and extract concept terms
  const searchConcepts = new Set<string>();
  for (const token of normalizedTokens) {
    const cleanToken = token.replace(/-/g, " ");

    // Check concept mapping first
    if (CONCEPT_MAP[cleanToken]) {
      for (const concept of CONCEPT_MAP[cleanToken]) {
        searchConcepts.add(concept);
      }
      continue;
    }

    if (CONCEPT_MAP[token]) {
      for (const concept of CONCEPT_MAP[token]) {
        searchConcepts.add(concept);
      }
      continue;
    }

    // Skip fillers
    if (HINGLISH_FILLERS.has(token) || DEVANAGARI_FILLERS.has(token)) {
      continue;
    }

    // Retain clean tokens
    if (cleanToken.length >= 2) {
      searchConcepts.add(cleanToken);
    }
  }

  const finalTokens = Array.from(searchConcepts);
  const normalizedQuery = finalTokens.join(" ");

  return {
    originalQuery,
    normalizedQuery: normalizedQuery || originalQuery,
    searchTokens: finalTokens,
    inferredContentType,
    isHindiOrHinglish: hasHinglishOrHindi,
    hasTypoCorrection
  };
}
