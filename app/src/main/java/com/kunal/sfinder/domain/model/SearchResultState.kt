package com.kunal.sfinder.domain.model

/**
 * Represents the observable UI states of the entertainment discovery flow.
 */
sealed interface SearchResultState {
    /**
     * Initial state before any search is performed.
     * Displays suggestions, mood inspiration, and discovery hints.
     */
    data object Idle : SearchResultState

    /**
     * Search operation in progress.
     */
    data class Loading(
        val message: String = "Analyzing your story description..."
    ) : SearchResultState

    /**
     * Results successfully retrieved.
     */
    data class Success(
        val items: List<EntertainmentItem>,
        val queryText: String,
        val category: MediaType,
        val searchMode: DiscoveryMode = DiscoveryMode.AI_ENHANCED,
        val disclaimer: String? = null,
        val fallbackUsed: Boolean = false,
        val totalCount: Int = items.size,
        val page: Int = 1,
        val hasMore: Boolean = false,
        val isLoadingMore: Boolean = false
    ) : SearchResultState

    /**
     * Query completed but no matching entertainment was found.
     */
    data class Empty(
        val queryText: String,
        val suggestions: List<String> = listOf(
            "Try describing the core conflict or character relationships",
            "Try broadening or resetting category filters",
            "Mention the era, setting, or specific remembered scenes"
        ),
        val searchMode: DiscoveryMode = DiscoveryMode.EMPTY,
        val disclaimer: String? = null,
        val fallbackUsed: Boolean = false
    ) : SearchResultState

    /**
     * An error occurred during search or catalog lookup.
     */
    data class Error(
        val message: String,
        val canRetry: Boolean = true
    ) : SearchResultState

    /**
     * Requested content format is currently unsupported by connected catalogs
     * (e.g. Movies selected when only TVmaze TV catalog is connected).
     * Handled honestly with 0 network calls and 0 wasted AI quota.
     */
    data class Unsupported(
        val contentType: ContentType,
        val message: String
    ) : SearchResultState
}
