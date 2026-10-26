package com.kunal.sfinder.domain.model

/**
 * Supported entertainment categories in S Finder.
 * Provider-independent enum representing various screen entertainment formats.
 */
enum class MediaType(val displayName: String) {
    ALL("All"),
    MOVIES("Movies"),
    TV_SERIES("TV Series"),
    ANIME("Anime"),
    KDRAMA("K-Dramas"),
    TURKISH_DRAMA("Turkish Dramas"),
    WEB_SERIES("Web Series");

    companion object {
        fun fromDisplayName(name: String): MediaType {
            val trimmed = name.trim()
            if (trimmed.equals("MOVIE", ignoreCase = true) || trimmed.equals("MOVIES", ignoreCase = true)) {
                return MOVIES
            }
            if (trimmed.equals("SERIES", ignoreCase = true) || 
                trimmed.equals("TV_SERIES", ignoreCase = true) || 
                trimmed.equals("TV SERIES", ignoreCase = true)
            ) {
                return TV_SERIES
            }
            return entries.firstOrNull { 
                it.displayName.equals(trimmed, ignoreCase = true) || it.name.equals(trimmed, ignoreCase = true) 
            } ?: ALL
        }
    }
}
