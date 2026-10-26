import { Candidate, TVMazeSearchResult } from "../src/types";

export const MOCK_GEMINI_VALID_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify([
              {
                canonicalTitle: "The K2",
                originalTitle: "더 케이투",
                approximateYear: 2016,
                expectedMediaType: "KDRAMA",
                confidenceScore: 0.95,
                matchReason: "A former mercenary bodyguard is assigned to protect a secret daughter of a presidential candidate.",
                searchKeywords: ["The K2", "K2"]
              },
              {
                canonicalTitle: "Dark",
                approximateYear: 2017,
                expectedMediaType: "TV_SERIES",
                confidenceScore: 0.88,
                matchReason: "Children disappear in a German town near a cave and nuclear plant.",
                searchKeywords: ["Dark"]
              },
              {
                canonicalTitle: "Yargi",
                originalTitle: "Yargı",
                approximateYear: 2021,
                expectedMediaType: "TURKISH_DRAMA",
                confidenceScore: 0.92,
                matchReason: "A prosecutor and a defense lawyer collaborate on a murder case uncovering family secrets.",
                searchKeywords: ["Yargi"]
              },
              {
                canonicalTitle: "Nonexistent Phantom Show XYZ",
                approximateYear: 2024,
                expectedMediaType: "TV_SERIES",
                confidenceScore: 0.4,
                matchReason: "A hallucinated title that does not exist in any real catalog."
              }
            ])
          }
        ]
      }
    }
  ]
};

export const MOCK_GEMINI_MALFORMED_JSON = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: "This is not valid JSON at all: [ { canonicalTitle: ..."
          }
        ]
      }
    }
  ]
};

export const MOCK_TVMAZE_K2: TVMazeSearchResult[] = [
  {
    score: 18.5,
    show: {
      id: 18296,
      name: "The K2",
      type: "Scripted",
      language: "Korean",
      genres: ["Drama", "Action", "Thriller"],
      status: "Ended",
      premiered: "2016-09-23",
      rating: { average: 6.5 },
      network: { country: { name: "Korea, Republic of", code: "KR" } },
      webChannel: null,
      image: {
        medium: "https://static.tvmaze.com/uploads/images/medium_portrait/79/199047.jpg",
        original: "https://static.tvmaze.com/uploads/images/original_untouched/79/199047.jpg"
      },
      summary: "<p>Drama about a patriotic bodyguard who was abandoned by his country...</p>"
    }
  }
];

export const MOCK_TVMAZE_AMBIGUOUS_DARK: TVMazeSearchResult[] = [
  {
    score: 19.8,
    show: {
      id: 34500,
      name: "In the Dark",
      type: "Scripted",
      language: "English",
      genres: ["Drama", "Comedy", "Crime"],
      status: "Ended",
      premiered: "2019-04-04",
      rating: { average: 7.0 },
      network: { country: { name: "United States", code: "US" } },
      webChannel: null,
      image: { medium: "https://static.tvmaze.com/in-the-dark.jpg" },
      summary: "<p>A flawed and irreverent blind woman...</p>"
    }
  },
  {
    score: 19.5,
    show: {
      id: 17849,
      name: "Dark",
      type: "Scripted",
      language: "German",
      genres: ["Drama", "Mystery", "Science-Fiction"],
      status: "Ended",
      premiered: "2017-12-01",
      rating: { average: 8.8 },
      network: null,
      webChannel: { name: "Netflix", country: { name: "Germany", code: "DE" } },
      image: {
        medium: "https://static.tvmaze.com/dark.jpg",
        original: "https://static.tvmaze.com/dark-orig.jpg"
      },
      summary: "<p>A missing child sets four families on a frantic hunt for answers...</p>"
    }
  }
];

export const MOCK_TVMAZE_YARGI: TVMazeSearchResult[] = [
  {
    score: 17.2,
    show: {
      id: 57921,
      name: "Yargı",
      type: "Scripted",
      language: "Turkish",
      genres: ["Drama", "Crime"],
      status: "Ended",
      premiered: "2021-09-19",
      rating: { average: 8.0 },
      network: { country: { name: "Turkey", code: "TR" } },
      webChannel: null,
      image: { medium: "https://static.tvmaze.com/yargi.jpg" },
      summary: "<p>A lawyer and a prosecutor, whose paths cross with a murder case...</p>"
    }
  }
];

export const MOCK_TVMAZE_MISSING_POSTER_SHOW: TVMazeSearchResult[] = [
  {
    score: 15.0,
    show: {
      id: 99999,
      name: "Indie Obscure Docuseries",
      type: "Documentary",
      language: "English",
      genres: ["Documentary"],
      status: "Running",
      premiered: null,
      rating: { average: null },
      network: null,
      webChannel: null,
      image: null, // No poster available
      summary: null // No summary available
    }
  }
];

// ============================================================================
// Phase 5Q Adversarial Fixtures A-F
// ============================================================================

// Fixture A: Narrative query about plane crash survivors stranded on a mysterious island
export const MOCK_FIXTURE_A_NARRATIVE_QUERY = 
  "I vaguely remember a series about plane crash survivors stranded on a mysterious island, where strange events and unanswered questions make it difficult to know what is really happening.";

// Fixture B: Irrelevant genuine title (I Am Not Okay With This, teen-superpower premise)
export const MOCK_FIXTURE_B_IRRELEVANT_CANDIDATE: Candidate = {
  canonicalTitle: "I Am Not Okay With This",
  approximateYear: 2020,
  expectedMediaType: "WEB_SERIES",
  confidenceScore: 0.5,
  matchReason: "A teen discovers she has superpowers while dealing with high school angst."
};

export const MOCK_FIXTURE_B_TVMAZE_SHOW: TVMazeSearchResult[] = [
  {
    score: 18.2,
    show: {
      id: 42827,
      name: "I Am Not Okay With This",
      type: "Scripted",
      language: "English",
      genres: ["Drama", "Romance", "Supernatural"],
      status: "Ended",
      premiered: "2020-02-26",
      rating: { average: 7.5 },
      network: null,
      webChannel: { name: "Netflix", country: { name: "Germany", code: "DE" } },
      image: {
        medium: "https://static.tvmaze.com/uploads/images/medium_portrait/242/607421.jpg"
      },
      summary: "<p>A coming of age story about a teenage girl navigating high school angst while discovering telekinetic powers.</p>"
    }
  }
];

// Fixture C: Hypothetical relevant catalog candidate (test fixture only; isolated island & survival themes)
export const MOCK_FIXTURE_C_RELEVANT_ISLAND_CANDIDATE: Candidate = {
  canonicalTitle: "The Mysterious Island Chronicles",
  approximateYear: 2018,
  expectedMediaType: "TV_SERIES",
  confidenceScore: 0.95,
  matchReason: "Survivors of a catastrophic plane crash stranded on a mysterious island solve unexplained events."
};

export const MOCK_FIXTURE_C_TVMAZE_SHOW: TVMazeSearchResult[] = [
  {
    score: 19.1,
    show: {
      id: 88812,
      name: "The Mysterious Island Chronicles",
      type: "Scripted",
      language: "English",
      genres: ["Drama", "Mystery", "Adventure"],
      status: "Ended",
      premiered: "2018-09-15",
      rating: { average: 8.4 },
      network: { country: { name: "United States", code: "US" } },
      webChannel: null,
      image: {
        medium: "https://static.tvmaze.com/uploads/images/medium_portrait/hypothetical.jpg"
      },
      summary: "<p>After a commercial plane crash, the survivors find themselves stranded on an uncharted mysterious island where unexplained events and dangerous questions arise.</p>"
    }
  }
];

// Fixture D: Mood query asking for dark suspense and clever twists
export const MOCK_FIXTURE_D_MOOD_QUERY = 
  "Looking for dark suspense with clever twists and mind-bending mystery.";

export const MOCK_FIXTURE_D_CANDIDATE: Candidate = {
  canonicalTitle: "Dark",
  approximateYear: 2017,
  expectedMediaType: "TV_SERIES",
  confidenceScore: 0.9,
  matchReason: "A mind-bending dark mystery with clever twists surrounding a cave in a German town."
};

// Fixture E: Exact title search
export const MOCK_FIXTURE_E_EXACT_QUERY = "The K2";

export const MOCK_FIXTURE_E_CANDIDATE: Candidate = {
  canonicalTitle: "The K2",
  approximateYear: 2016,
  expectedMediaType: "KDRAMA",
  confidenceScore: 0.95,
  matchReason: "A mercenary bodyguard protects a politician's daughter."
};

// Fixture F: Mixed candidate generation (one relevant, one clearly unrelated genuine catalog title)
export const MOCK_FIXTURE_F_MIXED_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify([
              MOCK_FIXTURE_C_RELEVANT_ISLAND_CANDIDATE,
              MOCK_FIXTURE_B_IRRELEVANT_CANDIDATE
            ])
          }
        ]
      }
    }
  ]
};

// Low-confidence candidate set (all candidates unrelated / low relevance)
export const MOCK_FIXTURE_LOW_CONFIDENCE_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify([
              MOCK_FIXTURE_B_IRRELEVANT_CANDIDATE
            ])
          }
        ]
      }
    }
  ]
};

// Adversarial case: Explanation tries to fabricate query keywords, but catalog synopsis/genres are unrelated reality food
export const MOCK_FIXTURE_H_ADVERSARIAL_CANDIDATE: Candidate = {
  canonicalTitle: "Sweet Bakery Showdown",
  approximateYear: 2021,
  expectedMediaType: "TV_SERIES",
  confidenceScore: 0.4,
  matchReason: "Plane crash survivors stranded on a mysterious island face strange events."
};

export const MOCK_FIXTURE_H_TVMAZE_SHOW: TVMazeSearchResult[] = [
  {
    score: 18.0,
    show: {
      id: 77721,
      name: "Sweet Bakery Showdown",
      type: "Reality",
      language: "English",
      genres: ["Food"],
      status: "Running",
      premiered: "2021-04-10",
      rating: { average: 6.0 },
      network: null,
      webChannel: { name: "Cooking Channel" },
      image: null,
      summary: "<p>Pastry chefs compete in Paris baking croissants, tarts, and wedding cakes.</p>"
    }
  }
];
