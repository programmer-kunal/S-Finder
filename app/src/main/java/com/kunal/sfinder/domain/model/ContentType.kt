package com.kunal.sfinder.domain.model

/**
 * Three primary content-type discovery filters for S Finder.
 * Content-Type takes priority over contradictory phrasing in natural-language queries.
 */
enum class ContentType(val displayName: String) {
    ALL("All"),
    MOVIES("Movies"),
    SERIES("Series");

    companion object {
        fun fromDisplayName(name: String): ContentType {
            return entries.firstOrNull { it.displayName.equals(name, ignoreCase = true) } ?: ALL
        }
    }
}
