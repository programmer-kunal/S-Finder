package com.kunal.sfinder.domain.model

/**
 * Encapsulates the user's search intent, selected filters, and semantic context.
 */
data class SearchQuery(
    val rawText: String = "",
    val category: MediaType = MediaType.ALL,
    val contentType: ContentType = ContentType.ALL,
    val genre: String = "ANY",
    val country: String = "ANY",
    val page: Int = 1,
    val limit: Int = 20,
    val isSemanticSearch: Boolean = false,
    val detectedMoods: List<String> = emptyList(),
    val detectedTropes: List<String> = emptyList()
) {
    val isBlank: Boolean
        get() = rawText.trim().isEmpty()

    val isLongDescription: Boolean
        get() = rawText.trim().length > 80 || rawText.contains("\n")
}
