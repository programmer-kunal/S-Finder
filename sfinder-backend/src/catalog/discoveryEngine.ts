import { ContentType, SearchMode, VerifiedEntertainmentItem } from "../types";
import { CatalogRepository } from "./catalogRepository";
import { CatalogItem, CatalogSearchParams, CatalogSearchResult, DatabaseAdapter } from "./types";

export interface BroadDiscoveryRequest {
  query: string;
  category?: string;
  contentType?: ContentType;
  genre?: string;
  country?: string;
  page?: number;
  limit?: number;
}

export interface BroadDiscoveryResponse {
  mode: SearchMode;
  query: string;
  resolvedCount: number;
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  items: VerifiedEntertainmentItem[];
  disclaimer: string;
  fallbackUsed: boolean;
}

export class BroadDiscoveryEngine {
  private repository: CatalogRepository;

  constructor(private db: DatabaseAdapter) {
    this.repository = new CatalogRepository(db);
  }

  /**
   * Executes a broad catalog discovery search using D1 and SQLite FTS5.
   * Produces up to 100+ candidates across pages with stable ranking and deterministic deduplication.
   */
  async discover(request: BroadDiscoveryRequest): Promise<BroadDiscoveryResponse> {
    const page = Math.max(1, request.page ?? 1);
    const limit = Math.min(100, Math.max(1, request.limit ?? 20));

    // Map content type filter
    let mediaType: "ALL" | "MOVIE" | "SERIES" = "ALL";
    if (request.contentType === "MOVIES" || request.contentType === "MOVIE" || request.category === "MOVIES") {
      mediaType = "MOVIE";
    } else if (request.contentType === "SERIES" || request.category === "TV_SERIES" || request.category === "SERIES") {
      mediaType = "SERIES";
    }

    const searchParams: CatalogSearchParams = {
      query: request.query,
      mediaType,
      genre: request.genre,
      country: request.country,
      page,
      limit
    };

    const searchResult = await this.repository.search(searchParams);

    const verifiedItems: VerifiedEntertainmentItem[] = searchResult.items.map(item => {
      // Generate honest match explanation
      let matchExplanation = "Verified catalog record matching your discovery query.";
      if (item.synopsis && item.synopsis.length > 20) {
        matchExplanation = `Context match: ${item.title} (${item.releaseYear || "N/A"}) - ${item.genres.join(", ") || "Entertainment"}.`;
      }

      return {
        id: item.id,
        title: item.title,
        originalTitle: item.originalTitle ?? undefined,
        releaseYear: item.releaseYear ?? undefined,
        mediaType: item.mediaType === "MOVIE" ? "MOVIE" as any : "TV_SERIES" as any,
        genres: item.genres,
        originalLanguage: undefined,
        countryOfOrigin: item.countries.join(", ") || undefined,
        rating: item.rating ?? undefined,
        voteCount: item.voteCount ?? undefined,
        synopsis: item.synopsis || "",
        posterUrl: item.posterUrl ?? undefined,
        backdropUrl: undefined,
        matchExplanation,
        catalogSource: item.catalogSource
      };
    });

    return {
      mode: searchResult.searchMode === "AI_ENHANCED" ? "AI_ENHANCED" : "CATALOG_SEARCH",
      query: request.query,
      resolvedCount: verifiedItems.length,
      totalCount: searchResult.totalCount,
      page: searchResult.page,
      limit: searchResult.limit,
      hasMore: searchResult.hasMore,
      items: verifiedItems,
      disclaimer: searchResult.disclaimer || "Verified catalog records matched via S Finder Catalog Index.",
      fallbackUsed: searchResult.searchMode !== "AI_ENHANCED"
    };
  }
}
