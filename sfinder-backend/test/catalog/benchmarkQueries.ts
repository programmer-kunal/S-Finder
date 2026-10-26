/**
 * S Finder Phase 5BA: Search Relevance Benchmark Dataset
 * 40 representative test queries grounded in real remote D1 catalog metadata (3,986 series).
 */

export interface BenchmarkQuery {
  id: string;
  category: "EXACT_TITLE" | "PARTIAL_OR_TYPO" | "GENRE_MOOD" | "STORY_TROPE" | "MULTI_CONSTRAINT" | "NEGATIVE_AMBIGUOUS";
  query: string;
  filters?: {
    mediaType?: "ALL" | "MOVIE" | "SERIES";
    genre?: string;
    country?: string;
  };
  expectedTopTitles?: string[];
  expectedTopIds?: number[];
  groundedCatalogEvidence: string;
  relevanceCriteria: string;
}

export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // --- Category 1: Exact Titles (8 queries) ---
  {
    id: "Q01_EXACT_UNDER_THE_DOME",
    category: "EXACT_TITLE",
    query: "Under the Dome",
    expectedTopTitles: ["Under the Dome"],
    expectedTopIds: [1],
    groundedCatalogEvidence: "Catalog item 1: Exact title 'Under the Dome', premiered 2013 on CBS (Page 0 boundary).",
    relevanceCriteria: "Exact target title MUST rank #1 (Reciprocal Rank = 1.0)."
  },
  {
    id: "Q02_EXACT_MUTANT_X",
    category: "EXACT_TITLE",
    query: "Mutant X",
    expectedTopTitles: ["Mutant X"],
    expectedTopIds: [486],
    groundedCatalogEvidence: "Catalog item 486 (provider 500): Exact title 'Mutant X', premiered 2001 (Page 2 boundary).",
    relevanceCriteria: "Exact target title MUST rank #1 (Reciprocal Rank = 1.0)."
  },
  {
    id: "Q03_EXACT_THE_BRADY_BUNCH",
    category: "EXACT_TITLE",
    query: "The Brady Bunch",
    expectedTopTitles: ["The Brady Bunch"],
    expectedTopIds: [1211],
    groundedCatalogEvidence: "Catalog item 1211 (provider 1249): Exact title 'The Brady Bunch', premiered 1969 (Page 4 boundary).",
    relevanceCriteria: "Exact target title MUST rank #1 (Reciprocal Rank = 1.0)."
  },
  {
    id: "Q04_EXACT_BLACK_BUTLER",
    category: "EXACT_TITLE",
    query: "Black Butler",
    expectedTopTitles: ["Black Butler"],
    expectedTopIds: [2154],
    groundedCatalogEvidence: "Catalog item 2154 (provider 1750): Exact title 'Black Butler', anime series premiered 2008 (Page 7 boundary).",
    relevanceCriteria: "Exact target title MUST rank #1 (Reciprocal Rank = 1.0)."
  },
  {
    id: "Q05_EXACT_DARIA",
    category: "EXACT_TITLE",
    query: "Daria",
    expectedTopTitles: ["Daria"],
    expectedTopIds: [2911],
    groundedCatalogEvidence: "Catalog item 2911 (provider 2554): Exact title 'Daria', MTV animated series premiered 1997 (Page 10).",
    relevanceCriteria: "Exact target title MUST rank #1 (Reciprocal Rank = 1.0)."
  },
  {
    id: "Q06_EXACT_SHANNARA",
    category: "EXACT_TITLE",
    query: "The Shannara Chronicles",
    expectedTopTitles: ["The Shannara Chronicles"],
    expectedTopIds: [3315],
    groundedCatalogEvidence: "Catalog item 3315 (provider 2999): Exact title 'The Shannara Chronicles', premiered 2016 (Page 11 boundary).",
    relevanceCriteria: "Exact target title MUST rank #1 (Reciprocal Rank = 1.0)."
  },
  {
    id: "Q07_EXACT_FROZEN_PLANET",
    category: "EXACT_TITLE",
    query: "Frozen Planet",
    expectedTopTitles: ["Frozen Planet"],
    expectedTopIds: [4234],
    groundedCatalogEvidence: "Catalog item 4234 (provider 4000): Exact title 'Frozen Planet', BBC documentary premiered 2011 (Page 16 boundary).",
    relevanceCriteria: "Exact target title MUST rank #1 (Reciprocal Rank = 1.0)."
  },
  {
    id: "Q08_EXACT_SAMURAI_7",
    category: "EXACT_TITLE",
    query: "Samurai 7",
    expectedTopTitles: ["Samurai 7"],
    expectedTopIds: [4465],
    groundedCatalogEvidence: "Catalog item 4465 (provider 4249): Exact title 'Samurai 7', anime premiered 2004 (Page 16 ceiling).",
    relevanceCriteria: "Exact target title MUST rank #1 (Reciprocal Rank = 1.0)."
  },

  // --- Category 2: Partial Titles and Misspellings (7 queries) ---
  {
    id: "Q09_PARTIAL_BRADY_BUNCH",
    category: "PARTIAL_OR_TYPO",
    query: "Brady Bunch",
    expectedTopTitles: ["The Brady Bunch"],
    expectedTopIds: [1211],
    groundedCatalogEvidence: "Missing leading article 'The'. Item 1211 normalized_title='the brady bunch'.",
    relevanceCriteria: "Target title should appear in Top 3."
  },
  {
    id: "Q10_PARTIAL_GARGOYLE",
    category: "PARTIAL_OR_TYPO",
    query: "Gargoyle",
    expectedTopTitles: ["Gargoyles"],
    expectedTopIds: [2296],
    groundedCatalogEvidence: "Singular form of plural title 'Gargoyles' (item 2296).",
    relevanceCriteria: "Target title should appear in Top 3."
  },
  {
    id: "Q11_PARTIAL_SIX_MILLION",
    category: "PARTIAL_OR_TYPO",
    query: "Six Million Dollar",
    expectedTopTitles: ["The Six Million Dollar Man"],
    expectedTopIds: [1685],
    groundedCatalogEvidence: "Missing trailing noun 'Man' from 'The Six Million Dollar Man' (item 1685).",
    relevanceCriteria: "Target title should rank #1."
  },
  {
    id: "Q12_PARTIAL_DAILY_STEWART",
    category: "PARTIAL_OR_TYPO",
    query: "Daily Show Stewart",
    expectedTopTitles: ["The Daily Show with Jon Stewart"],
    expectedTopIds: [240],
    groundedCatalogEvidence: "Subset of title tokens matching item 240.",
    relevanceCriteria: "Target title should rank #1."
  },
  {
    id: "Q13_PARTIAL_DOCTOR_WH",
    category: "PARTIAL_OR_TYPO",
    query: "Doctor Wh",
    expectedTopTitles: ["Doctor Who"],
    expectedTopIds: [202, 747],
    groundedCatalogEvidence: "Truncated token 'Wh' missing trailing 'o' for Doctor Who.",
    relevanceCriteria: "Check if prefix/token matching handles truncated tokens or falls back."
  },
  {
    id: "Q14_TYPO_TWILITE_ZONE",
    category: "PARTIAL_OR_TYPO",
    query: "Twilite Zone",
    expectedTopTitles: ["The Twilight Zone"],
    expectedTopIds: [766, 3578, 4120],
    groundedCatalogEvidence: "Phonetic misspelling 'Twilite' instead of 'Twilight'.",
    relevanceCriteria: "Check FTS5 robustness to spelling variations."
  },
  {
    id: "Q15_TYPO_FROSEN_PLANET",
    category: "PARTIAL_OR_TYPO",
    query: "Frosen Planet",
    expectedTopTitles: ["Frozen Planet"],
    expectedTopIds: [4234],
    groundedCatalogEvidence: "Misspelling 'Frosen' for 'Frozen' (item 4234).",
    relevanceCriteria: "Check FTS5 token behavior on single-character typo."
  },

  // --- Category 3: Genre and Mood Prompts (6 queries) ---
  {
    id: "Q16_MOOD_90S_FAMILY_COMEDY",
    category: "GENRE_MOOD",
    query: "90s family comedy",
    expectedTopTitles: ["Family Matters", "Married... with Children"],
    expectedTopIds: [1452, 485],
    groundedCatalogEvidence: "Family Matters (1989-1998 comedy) and Married... with Children (1987-1997 comedy).",
    relevanceCriteria: "Precision@5: Returned results should be genuinely family or comedy series."
  },
  {
    id: "Q17_MOOD_DARK_SUPERNATURAL",
    category: "GENRE_MOOD",
    query: "Dark supernatural mystery",
    expectedTopTitles: ["Twin Peaks", "The Twilight Zone", "Buffy the Vampire Slayer"],
    expectedTopIds: [149, 766, 415],
    groundedCatalogEvidence: "Twin Peaks synopsis: 'murder of schoolgirl', Twilight Zone: 'macabre and unusual', Buffy: 'forces of darkness'.",
    relevanceCriteria: "Precision@5: At least 3 of top 5 must have dark/mystery/supernatural themes."
  },
  {
    id: "Q18_MOOD_POLAR_WILDLIFE",
    category: "GENRE_MOOD",
    query: "Polar nature wildlife documentary",
    expectedTopTitles: ["Frozen Planet"],
    expectedTopIds: [4234],
    groundedCatalogEvidence: "Frozen Planet (item 4234): 'David Attenborough travels to polar regions of our planet'.",
    relevanceCriteria: "Frozen Planet must be in Top 3."
  },
  {
    id: "Q19_MOOD_CYNICAL_HIGH_SCHOOL",
    category: "GENRE_MOOD",
    query: "Cynical high school comedy",
    expectedTopTitles: ["Daria"],
    expectedTopIds: [2911],
    groundedCatalogEvidence: "Daria (item 2911): 'Daria was born alienated... Lawndale high school'.",
    relevanceCriteria: "Daria should appear in Top 5."
  },
  {
    id: "Q20_MOOD_SAMURAI_ANIME",
    category: "GENRE_MOOD",
    query: "Historical samurai anime",
    expectedTopTitles: ["Samurai 7"],
    expectedTopIds: [4465],
    groundedCatalogEvidence: "Samurai 7 (item 4465): 'Akira Kurosawa classic movie Seven Samurai... anime preview'.",
    relevanceCriteria: "Samurai 7 must be #1."
  },
  {
    id: "Q21_MOOD_MUTANT_SUPERPOWERS",
    category: "GENRE_MOOD",
    query: "Mutants with extraordinary superpowers",
    expectedTopTitles: ["Mutant X"],
    expectedTopIds: [486],
    groundedCatalogEvidence: "Mutant X (item 486) synopsis: 'team of human mutants who possess extraordinary powers'.",
    relevanceCriteria: "Mutant X must rank #1."
  },

  // --- Category 4: Story and Trope Descriptions (8 queries) ---
  {
    id: "Q22_STORY_SEALED_DOME",
    category: "STORY_TROPE",
    query: "Town sealed off by transparent dome",
    expectedTopTitles: ["Under the Dome"],
    expectedTopIds: [1],
    groundedCatalogEvidence: "Under the Dome (item 1): 'small town that is suddenly and inexplicably sealed off from the rest of the world by an enormous transparent dome'.",
    relevanceCriteria: "Under the Dome MUST rank #1."
  },
  {
    id: "Q23_STORY_TWIN_PEAKS_MURDER",
    category: "STORY_TROPE",
    query: "FBI agent investigates murdered teenage girl",
    expectedTopTitles: ["Twin Peaks"],
    expectedTopIds: [149],
    groundedCatalogEvidence: "Twin Peaks (item 149): 'FBI Special Agent Dale Cooper and his investigation of the murder of a popular local teenage schoolgirl, Laura Palmer'.",
    relevanceCriteria: "Twin Peaks MUST rank #1."
  },
  {
    id: "Q24_STORY_DOCTOR_WHO_TIME",
    category: "STORY_TROPE",
    query: "Time travelling alien and companions",
    expectedTopTitles: ["Doctor Who"],
    expectedTopIds: [202, 747],
    groundedCatalogEvidence: "Doctor Who (item 202): 'Adventures across time and space with the time travelling alien and companions'.",
    relevanceCriteria: "Doctor Who MUST rank #1."
  },
  {
    id: "Q25_STORY_BUFFY_SLAYER",
    category: "STORY_TROPE",
    query: "High school girl slays vampires and demons",
    expectedTopTitles: ["Buffy the Vampire Slayer"],
    expectedTopIds: [415],
    groundedCatalogEvidence: "Buffy (item 415): 'young women known as Vampire Slayers who have to battle vampires, demons and other forces of evil, all while growing up in high school'.",
    relevanceCriteria: "Buffy the Vampire Slayer MUST rank #1."
  },
  {
    id: "Q26_STORY_SAMURAI_DEFEND_VILLAGE",
    category: "STORY_TROPE",
    query: "Villagers recruit samurai to defend crops from bandits",
    expectedTopTitles: ["Samurai 7"],
    expectedTopIds: [4465],
    groundedCatalogEvidence: "Samurai 7 (item 4465): 'villagers send out a mission to find and recruit some samurai to defend them... return every harvest to seize the village crops'.",
    relevanceCriteria: "Samurai 7 MUST rank #1."
  },
  {
    id: "Q27_STORY_ARRANGED_MARRIAGES",
    category: "STORY_TROPE",
    query: "Couples with arranged marriages from different cultures",
    expectedTopTitles: ["Arranged"],
    expectedTopIds: [3500],
    groundedCatalogEvidence: "Arranged (item 3500): 'three couples from different cultural backgrounds have one thing in common – the belief in arranged marriages'.",
    relevanceCriteria: "Arranged MUST rank #1."
  },
  {
    id: "Q28_TROPE_ENEMIES_TO_LOVERS",
    category: "STORY_TROPE",
    query: "Enemies to lovers rivalry",
    expectedTopTitles: [],
    groundedCatalogEvidence: "Trope dictionary expands to: 'rivalry', 'opposing', 'feud', 'nemesis', 'hate to love'. Evaluates candidate expansion in catalog.",
    relevanceCriteria: "Precision@5: Results must contain actual rivalry/antagonist relationships in synopsis."
  },
  {
    id: "Q29_TROPE_TIME_LOOP",
    category: "STORY_TROPE",
    query: "Time loop reliving the past",
    expectedTopTitles: ["Doctor Who", "The Twilight Zone"],
    groundedCatalogEvidence: "Trope dictionary expands to: 'temporal', 'timeline', 'reliving'. Doctor Who and Twilight Zone contain temporal anomalies.",
    relevanceCriteria: "At least 1 sci-fi temporal series in Top 5."
  },

  // --- Category 5: Multi-Constraint Filter Queries (6 queries) ---
  {
    id: "Q30_FILTER_DOCTOR_WHO_UK",
    category: "MULTI_CONSTRAINT",
    query: "Doctor Who",
    filters: { country: "United Kingdom", mediaType: "SERIES" },
    expectedTopTitles: ["Doctor Who"],
    expectedTopIds: [202, 747],
    groundedCatalogEvidence: "Doctor Who (items 202 & 747) are UK SERIES.",
    relevanceCriteria: "Doctor Who #1 and 100% of returned items have country = United Kingdom."
  },
  {
    id: "Q31_FILTER_FROZEN_PLANET_NATURE",
    category: "MULTI_CONSTRAINT",
    query: "Frozen Planet",
    filters: { genre: "Nature", mediaType: "SERIES" },
    expectedTopTitles: ["Frozen Planet"],
    expectedTopIds: [4234],
    groundedCatalogEvidence: "Frozen Planet (item 4234) primary_genre = 'Nature'.",
    relevanceCriteria: "Frozen Planet #1 and 100% of returned items have genre = Nature."
  },
  {
    id: "Q32_FILTER_SAMURAI_JAPAN",
    category: "MULTI_CONSTRAINT",
    query: "Samurai 7",
    filters: { country: "Japan", mediaType: "SERIES" },
    expectedTopTitles: ["Samurai 7"],
    expectedTopIds: [4465],
    groundedCatalogEvidence: "Samurai 7 (item 4465) primary_country = 'Japan'.",
    relevanceCriteria: "Samurai 7 #1 and 100% of returned items have country = Japan."
  },
  {
    id: "Q33_FILTER_FAMILY_MATTERS_COMEDY",
    category: "MULTI_CONSTRAINT",
    query: "Family Matters",
    filters: { genre: "Comedy" },
    expectedTopTitles: ["Family Matters"],
    expectedTopIds: [1452],
    groundedCatalogEvidence: "Family Matters (item 1452) primary_genre = 'Comedy'.",
    relevanceCriteria: "Family Matters #1 and 100% of returned items have genre = Comedy."
  },
  {
    id: "Q34_FILTER_TWIN_PEAKS_US",
    category: "MULTI_CONSTRAINT",
    query: "Twin Peaks",
    filters: { country: "United States" },
    expectedTopTitles: ["Twin Peaks"],
    expectedTopIds: [149],
    groundedCatalogEvidence: "Twin Peaks (item 149) primary_country = 'United States'.",
    relevanceCriteria: "Twin Peaks #1 and 100% of returned items have country = United States."
  },
  {
    id: "Q35_FILTER_UK_NATURE_DISCOVERY",
    category: "MULTI_CONSTRAINT",
    query: "Nature",
    filters: { country: "United Kingdom", genre: "Nature" },
    expectedTopTitles: ["Frozen Planet"],
    groundedCatalogEvidence: "Broad discovery for Nature shows from the UK.",
    relevanceCriteria: "Frozen Planet appears in Top 5 and all items have country = United Kingdom."
  },

  // --- Category 6: Negative, Ambiguous, and Robustness Queries (5 queries) ---
  {
    id: "Q36_ROBUSTNESS_STOP_WORDS",
    category: "NEGATIVE_AMBIGUOUS",
    query: "The The",
    groundedCatalogEvidence: "Contains only stop words. Tests fallback behavior.",
    relevanceCriteria: "Must execute cleanly without SQL error; fallback title matching."
  },
  {
    id: "Q37_NEGATIVE_GIBBERISH",
    category: "NEGATIVE_AMBIGUOUS",
    query: "randomgibberishxyzabc",
    expectedTopTitles: [],
    groundedCatalogEvidence: "Nonsense string with no hits in catalog.",
    relevanceCriteria: "Must return 0 results cleanly (empty array, totalCount = 0)."
  },
  {
    id: "Q38_AMBIGUOUS_UNDER",
    category: "NEGATIVE_AMBIGUOUS",
    query: "Under",
    expectedTopTitles: ["Under the Dome", "Six Feet Under"],
    groundedCatalogEvidence: "Single ubiquitous word appearing in multiple show titles.",
    relevanceCriteria: "Shows with 'Under' as leading word should rank ahead of incidental synopsis matches."
  },
  {
    id: "Q39_NEGATIVE_STAR_WARS",
    category: "NEGATIVE_AMBIGUOUS",
    query: "Star Wars",
    expectedTopTitles: [],
    groundedCatalogEvidence: "Franchise not in TVMaze Pages 0..16 catalog.",
    relevanceCriteria: "Evaluates false positives; no ungrounded hallucination."
  },
  {
    id: "Q40_AMBIGUOUS_SEINFELD",
    category: "NEGATIVE_AMBIGUOUS",
    query: "Show about nothing",
    expectedTopTitles: [],
    groundedCatalogEvidence: "Culturally famous descriptor for Seinfeld, which is not in the current 3,986 catalog.",
    relevanceCriteria: "Examines whether token OR generates irrelevant synopsis matches."
  }
];
