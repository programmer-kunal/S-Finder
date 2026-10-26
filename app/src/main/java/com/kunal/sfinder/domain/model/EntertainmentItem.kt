package com.kunal.sfinder.domain.model

/**
 * Provider-independent domain representation of an entertainment title.
 * Decoupled from specific external catalogs (e.g., TVMaze, AniList, Wikidata).
 */
data class EntertainmentItem(
    val id: String,
    val title: String,
    val originalTitle: String? = null,
    val releaseYear: Int? = null,
    val mediaType: MediaType = MediaType.MOVIES,
    val genres: List<String> = emptyList(),
    val originalLanguage: String? = null,
    val countryOfOrigin: String? = null,
    val countriesOfOrigin: List<String> = emptyList(),
    val rating: Double? = null,
    val voteCount: Int? = null,
    val synopsis: String = "",
    val posterUrl: String? = null,
    val backdropUrl: String? = null,
    /**
     * Concise explanation of why this title matches the user's natural language query,
     * mood, character relationship, or remembered scene.
     */
    val matchExplanation: String? = null,
    /**
     * Source attribution identifier (e.g., "TVMaze", "AniList", "Wikidata").
     */
    val catalogSource: String? = null
)
