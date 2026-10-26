package com.kunal.sfinder.data.preview

import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.MediaType

/**
 * Isolated preview dataset for local UI validation and layout inspection.
 * Clearly identified as sample preview records — does not represent live catalog data.
 */
object PreviewEntertainmentData {

    val SAMPLE_ITEMS = listOf(
        // 1. Movie Record
        EntertainmentItem(
            id = "preview-movie-1",
            title = "Inception",
            originalTitle = "Inception",
            releaseYear = 2010,
            mediaType = MediaType.MOVIES,
            genres = listOf("Sci-Fi", "Action", "Thriller", "Mystery"),
            originalLanguage = "English",
            countryOfOrigin = "United States",
            rating = 8.8,
            voteCount = 2400000,
            synopsis = "Dom Cobb is a skilled thief, the absolute best in the dangerous art of extraction: stealing valuable secrets from deep within the subconscious during the dream state. Offered a chance at redemption, he must accomplish the impossible: inception, planting an idea rather than stealing one.",
            posterUrl = null, // Uses graceful monogram placeholder
            matchExplanation = "Matches your search for high-concept sci-fi thrillers with intricate mind-bending plots, subconscious dream heists, and layered narrative reality.",
            catalogSource = "Preview Sample Record"
        ),

        // 2. TV / Web Series Record
        EntertainmentItem(
            id = "preview-tv-1",
            title = "Severance",
            originalTitle = "Severance",
            releaseYear = 2022,
            mediaType = MediaType.TV_SERIES,
            genres = listOf("Sci-Fi", "Psychological Thriller", "Mystery", "Drama"),
            originalLanguage = "English",
            countryOfOrigin = "United States",
            rating = 8.7,
            voteCount = 180000,
            synopsis = "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives. When a mysterious colleague appears outside of work, it begins a journey to discover the truth about their jobs and the corporation controlling them.",
            posterUrl = null,
            matchExplanation = "Matches your vague memory description of a story where a person's entire routine and consciousness are secretly controlled by an elusive authority, questioning what is real.",
            catalogSource = "Preview Sample Record"
        ),

        // 3. Anime Record
        EntertainmentItem(
            id = "preview-anime-1",
            title = "Demon Slayer: Kimetsu no Yaiba",
            originalTitle = "鬼滅の刃 (Kimetsu no Yaiba)",
            releaseYear = 2019,
            mediaType = MediaType.ANIME,
            genres = listOf("Anime", "Dark Fantasy", "Action", "Historical"),
            originalLanguage = "Japanese",
            countryOfOrigin = "Japan",
            rating = 8.6,
            voteCount = 145000,
            synopsis = "Tanjiro Kamado is a kind-hearted boy whose family is slaughtered by demons while his younger sister Nezuko is transformed into a demon herself. Tanjiro embarks on a perilous journey to become a demon slayer, determined to avenge his family and cure his sister.",
            posterUrl = null,
            matchExplanation = "Matches your query for an underdog swordsman who trains tirelessly against supernatural adversaries to protect what remains of their family.",
            catalogSource = "Preview Sample Record"
        ),

        // 4. Korean Drama Record
        EntertainmentItem(
            id = "preview-kdrama-1",
            title = "The K2",
            originalTitle = "더 케이투 (The K2)",
            releaseYear = 2016,
            mediaType = MediaType.KDRAMA,
            genres = listOf("K-Drama", "Action", "Romance", "Political Thriller"),
            originalLanguage = "Korean",
            countryOfOrigin = "South Korea",
            rating = 7.8,
            voteCount = 22000,
            synopsis = "Kim Je-ha is a former mercenary soldier known as K2 who is framed for murder and hired as a bodyguard by a powerful presidential candidate's wife. He is assigned to secretly guard the candidate's hidden daughter, leading to a deep emotional bond as they navigate dangerous political conspiracies.",
            posterUrl = null,
            matchExplanation = "Matches your bodyguard romance trope query: a hardened protector initially clashes with a vulnerable wealthy heiress, gradually developing mutual love amidst lethal conspiracies.",
            catalogSource = "Preview Sample Record"
        ),

        // 5. Turkish Drama Record
        EntertainmentItem(
            id = "preview-turkish-1",
            title = "Yargı (Family Secrets)",
            originalTitle = "Yargı",
            releaseYear = 2021,
            mediaType = MediaType.TURKISH_DRAMA,
            genres = listOf("Turkish Drama", "Crime", "Mystery", "Romance"),
            originalLanguage = "Turkish",
            countryOfOrigin = "Turkey",
            rating = 8.4,
            voteCount = 19000,
            synopsis = "Ilgaz, a rule-abiding prosecutor with unshakeable morals, crosses paths with Ceylin, an audacious defense attorney who bends the rules for justice. When a murder case entangles both their families, they are forced to work together, uncovering dark secrets while facing growing attraction.",
            posterUrl = null,
            matchExplanation = "Matches your suspenseful, emotional drama query featuring moral conflicts, intense family betrayals, and romantic tension between two clashing opposites.",
            catalogSource = "Preview Sample Record"
        )
    )

    /**
     * Filters preview sample items by [category] and optional [query].
     */
    fun filterSampleItems(category: MediaType, query: String = ""): List<EntertainmentItem> {
        val categoryFiltered = if (category == MediaType.ALL) {
            SAMPLE_ITEMS
        } else {
            SAMPLE_ITEMS.filter { it.mediaType == category }
        }

        if (query.isBlank()) return categoryFiltered

        val normalized = query.lowercase().trim()
        return categoryFiltered.filter { item ->
            item.title.lowercase().contains(normalized) ||
                item.genres.any { it.lowercase().contains(normalized) } ||
                item.synopsis.lowercase().contains(normalized) ||
                item.matchExplanation?.lowercase()?.contains(normalized) == true
        }
    }
}
