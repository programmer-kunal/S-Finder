/**
 * S Finder Canonical Benchmark Labels & Single Source of Truth
 * 
 * Defines auditable, machine-readable relevance records for benchmark queries (Q16, Q19, Q20, Q28, Q29)
 * grounded in real remote Cloudflare D1 catalog records (3,986 TVMaze series).
 * 
 * Established Relevance Scoring Standards:
 * Strict binary P@5: Only RELEVANT counts as 1.0 (all other labels count as 0.0).
 * Lenient binary P@5: Both RELEVANT and PARTIALLY_RELEVANT count as 1.0 (IRRELEVANT counts as 0.0).
 * Graded P@5: RELEVANT = 1.0, PARTIALLY_RELEVANT = 0.5, IRRELEVANT = 0.0.
 * Reciprocal Rank (RR): 1 / rank of primary target ID.
 */

export type BenchmarkRelevanceLabel = "RELEVANT" | "PARTIALLY_RELEVANT" | "IRRELEVANT";

export interface CanonicalResultItem {
  itemId: string;
  title: string;
  releaseYear: number | null;
  label: BenchmarkRelevanceLabel;
  evidence: string;
  externalSourceUrl?: string;
}

export interface CanonicalBenchmarkQuery {
  queryId: string;
  queryString: string;
  category: "GENRE_MOOD" | "STORY_TROPE";
  primaryTargetId?: string;
  results: CanonicalResultItem[];
}

export const CANONICAL_BENCHMARK_DATA: Record<string, CanonicalBenchmarkQuery> = {
  Q16: {
    queryId: "Q16_MOOD_90S_FAMILY_COMEDY",
    queryString: "90s family comedy",
    category: "GENRE_MOOD",
    primaryTargetId: "tvmaze-84",
    results: [
      {
        itemId: "tvmaze-84",
        title: "Family Guy",
        releaseYear: 1999,
        label: "RELEVANT",
        evidence: "1999 animated prime-time family sitcom focusing on the Griffin household."
      },
      {
        itemId: "tvmaze-1248",
        title: "Blossom",
        releaseYear: 1990,
        label: "RELEVANT",
        evidence: "1990 prime-time family comedy sitcom centered on Blossom Russo and her family."
      },
      {
        itemId: "tvmaze-3370",
        title: "Familie Backeljau",
        releaseYear: 1994,
        label: "RELEVANT",
        evidence: "1994 Flemish family comedy sitcom entirely focused on the Backeljau household."
      },
      {
        itemId: "tvmaze-799",
        title: "7th Heaven",
        releaseYear: 1996,
        label: "RELEVANT",
        evidence: "1996 family drama/comedy series centered on the Camden household."
      },
      {
        itemId: "tvmaze-690",
        title: "Roseanne",
        releaseYear: 1988,
        label: "PARTIALLY_RELEVANT",
        evidence: "Premiered October 18, 1988 (outside strict 1990-1999 premiere window); external broadcast records (TVMaze/Wikipedia) verify seasons 3-9 aired continuously across 1990-1997 on ABC. Qualified as PARTIALLY_RELEVANT under verified broadcast overlap.",
        externalSourceUrl: "https://www.tvmaze.com/shows/690/roseanne"
      }
    ]
  },

  Q19: {
    queryId: "Q19_MOOD_CYNICAL_HIGH_SCHOOL",
    queryString: "Cynical high school comedy",
    category: "GENRE_MOOD",
    primaryTargetId: "tvmaze-2554",
    results: [
      {
        itemId: "tvmaze-2554",
        title: "Daria",
        releaseYear: 1997,
        label: "RELEVANT",
        evidence: "Quintessential cynical, alienated high school comedy animated series featuring misanthropic teen Daria Morgendorffer."
      },
      {
        itemId: "tvmaze-673",
        title: "Roswell",
        releaseYear: 1999,
        label: "IRRELEVANT",
        evidence: "Teen sci-fi drama and romance about alien hybrids, NOT a comedy (primary_genre: Drama, genres: [Drama, Science-Fiction, Romance])."
      },
      {
        itemId: "tvmaze-1954",
        title: "Sym-Bionic Titan",
        releaseYear: 2010,
        label: "IRRELEVANT",
        evidence: "Action mecha sci-fi animated series, NOT a cynical high school comedy."
      },
      {
        itemId: "tvmaze-393",
        title: "Video Game High School",
        releaseYear: 2012,
        label: "PARTIALLY_RELEVANT",
        evidence: "High school comedy web series about competitive gaming; contains high school comedic setting but is earnest/action-driven rather than cynical/satirical."
      },
      {
        itemId: "tvmaze-1964",
        title: "Kiseijuu: Sei no Kakuritsu",
        releaseYear: 2014,
        label: "IRRELEVANT",
        evidence: "Violent psychological body-horror anime (Parasyte) about alien parasites attacking humans, NOT a comedy."
      }
    ]
  },

  Q20: {
    queryId: "Q20_MOOD_SAMURAI_ANIME",
    queryString: "Historical samurai anime",
    category: "GENRE_MOOD",
    primaryTargetId: "tvmaze-4249",
    results: [
      {
        itemId: "tvmaze-4249",
        title: "Samurai 7",
        releaseYear: 2004,
        label: "RELEVANT",
        evidence: "Japanese anime adaptation of Akira Kurosawa's Seven Samurai set in a feudal historical/steampunk setting with samurai protecting villagers."
      },
      {
        itemId: "tvmaze-2048",
        title: "Sengoku Basara",
        releaseYear: 2009,
        label: "RELEVANT",
        evidence: "Historical Japanese anime set in the Sengoku (Warring States) feudal period featuring authentic samurai warriors and warlords."
      },
      {
        itemId: "tvmaze-4097",
        title: "Shaman King",
        releaseYear: 2001,
        label: "PARTIALLY_RELEVANT",
        evidence: "Supernatural anime featuring 600-year-old samurai ghost Amidamaru, but set in modern Tokyo rather than a historical period setting."
      },
      {
        itemId: "tvmaze-4150",
        title: "Gintama",
        releaseYear: 2006,
        label: "RELEVANT",
        evidence: "Historical anime set in alternate Edo-period Japan featuring former samurai Gintoki Sakata upholding the samurai bushido code."
      },
      {
        itemId: "tvmaze-2068",
        title: "Nobunagun",
        releaseYear: 2014,
        label: "PARTIALLY_RELEVANT",
        evidence: "Modern sci-fi anime where a high school girl awakens the weaponized spirit of warlord Oda Nobunaga against alien invaders; modern setting rather than historical period."
      }
    ]
  },

  Q28: {
    queryId: "Q28_TROPE_ENEMIES_TO_LOVERS",
    queryString: "Enemies to lovers rivalry",
    category: "STORY_TROPE",
    primaryTargetId: "tvmaze-189",
    results: [
      {
        itemId: "tvmaze-189",
        title: "Star-Crossed",
        releaseYear: 2014,
        label: "RELEVANT",
        evidence: "Core enemies-to-lovers narrative: human girl and alien boy fall in love despite fierce hostility, rivalry, and prejudice between opposing factions."
      },
      {
        itemId: "tvmaze-3234",
        title: "Apgujeong Midnight Sun",
        releaseYear: 2014,
        label: "PARTIALLY_RELEVANT",
        evidence: "Revenge melodrama where protagonist infiltrates and antagonizes a rival family, resulting in complex romantic entanglements with her adversary."
      },
      {
        itemId: "tvmaze-1787",
        title: "Zwarte Tulp",
        releaseYear: 2015,
        label: "PARTIALLY_RELEVANT",
        evidence: "Multi-generational feud and fierce rivalry between two Dutch tulip families, complicated by forbidden romance between members of rival clans."
      },
      {
        itemId: "tvmaze-2911",
        title: "The Last Enemy",
        releaseYear: 2008,
        label: "IRRELEVANT",
        evidence: "Dystopian political thriller centered on state surveillance and conspiracy; lexical match on 'Enemy', zero romance or lovers elements."
      },
      {
        itemId: "tvmaze-1102",
        title: "Hatfields & McCoys",
        releaseYear: 2012,
        label: "PARTIALLY_RELEVANT",
        evidence: "Historical miniseries depicting legendary violent family feud, featuring the illicit Romeo-and-Juliet romance between Johnse Hatfield and Roseanna McCoy."
      }
    ]
  },

  Q29: {
    queryId: "Q29_TROPE_TIME_LOOP",
    queryString: "Time loop reliving the past",
    category: "STORY_TROPE",
    primaryTargetId: "tvmaze-862",
    results: [
      {
        itemId: "tvmaze-2798",
        title: "Oda Nobuna no Yabou",
        releaseYear: 2012,
        label: "PARTIALLY_RELEVANT",
        evidence: "Time-slip isekai story where modern student is pulled back into historical Sengoku Japan; temporal time travel but not a time loop or reliving one's past."
      },
      {
        itemId: "tvmaze-2107",
        title: "The Loop",
        releaseYear: 2006,
        label: "IRRELEVANT",
        evidence: "Workplace sitcom set in Chicago's downtown transit 'Loop' district; pure title lexical match with zero temporal or sci-fi elements."
      },
      {
        itemId: "tvmaze-862",
        title: "Being Erica",
        releaseYear: 2009,
        label: "RELEVANT",
        evidence: "Core target: protagonist Erica Strange travels back in time every episode to literally relive and correct past regrets."
      },
      {
        itemId: "tvmaze-1804",
        title: "The Man in the High Castle",
        releaseYear: 2015,
        label: "PARTIALLY_RELEVANT",
        evidence: "Alternate history depicting a world where Axis powers won WWII; parallel timeline / alternate history, but not an individual reliving-past loop."
      },
      {
        itemId: "tvmaze-1007",
        title: "Tru Calling",
        releaseYear: 2003,
        label: "RELEVANT",
        evidence: "Core target: woman repeatedly relives individual days in a time-loop structure ('What would you do if you could relive a day?') to prevent deaths."
      }
    ]
  }
};

/**
 * Calculates strict binary Precision@5: only RELEVANT counts as 1.0 (all other labels count as 0.0).
 */
export function calculateStrictPrecisionAt5(items: CanonicalResultItem[]): number {
  if (items.length !== 5) throw new Error(`Expected exactly 5 items, got ${items.length}`);
  const relevantCount = items.filter(item => item.label === "RELEVANT").length;
  return relevantCount / 5;
}

/**
 * Calculates lenient binary Precision@5: both RELEVANT and PARTIALLY_RELEVANT count as 1.0.
 */
export function calculateLenientPrecisionAt5(items: CanonicalResultItem[]): number {
  if (items.length !== 5) throw new Error(`Expected exactly 5 items, got ${items.length}`);
  const qualifying = items.filter(item => item.label === "RELEVANT" || item.label === "PARTIALLY_RELEVANT").length;
  return qualifying / 5;
}

/**
 * Calculates graded Precision@5: RELEVANT = 1.0, PARTIALLY_RELEVANT = 0.5, IRRELEVANT = 0.0.
 */
export function calculateGradedPrecisionAt5(items: CanonicalResultItem[]): number {
  if (items.length !== 5) throw new Error(`Expected exactly 5 items, got ${items.length}`);
  let total = 0;
  for (const item of items) {
    if (item.label === "RELEVANT") {
      total += 1.0;
    } else if (item.label === "PARTIALLY_RELEVANT") {
      total += 0.5;
    }
  }
  return total / 5;
}

/**
 * Calculates Reciprocal Rank (RR) for a primary target ID.
 */
export function calculateReciprocalRank(items: CanonicalResultItem[], primaryTargetId?: string): number {
  if (!primaryTargetId) return 0;
  const rank = items.findIndex(item => item.itemId === primaryTargetId);
  return rank >= 0 ? 1 / (rank + 1) : 0;
}
