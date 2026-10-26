package com.kunal.sfinder.domain.model

/**
 * Indicates the resolution and intelligence mode of a search operation.
 */
enum class DiscoveryMode(val displayName: String) {
    /**
     * Gemini-powered context and trope semantic matching verified against live catalog.
     */
    AI_ENHANCED("AI Enhanced"),

    /**
     * Direct catalog keyword match or fallback when AI context search is unavailable.
     */
    CATALOG_SEARCH("Catalog Search"),

    /**
     * Search completed successfully but no verified matches were found.
     */
    EMPTY("Empty"),

    /**
     * An error occurred during search or catalog lookup.
     */
    ERROR("Error");

    companion object {
        fun fromString(value: String?): DiscoveryMode {
            if (value.isNullOrBlank()) return CATALOG_SEARCH
            return entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: CATALOG_SEARCH
        }
    }
}
