package com.kunal.sfinder.domain.model

/**
 * Inspiration chips for testing and guiding users on natural language discovery.
 */
data class SuggestionChip(
    val title: String,
    val promptText: String,
    val targetCategory: MediaType = MediaType.ALL,
    val tag: String = "Story"
) {
    companion object {
        val DEFAULT_SUGGESTIONS = listOf(
            // Trope
            SuggestionChip(
                title = "Enemies to Lovers",
                promptText = "Romance between rivals or enemies who gradually fall in love.",
                targetCategory = MediaType.ALL,
                tag = "Trope"
            ),
            SuggestionChip(
                title = "Fake Dating",
                promptText = "A pretend relationship or fake dating agreement that develops into real romance.",
                targetCategory = MediaType.ALL,
                tag = "Trope"
            ),
            SuggestionChip(
                title = "Forbidden Love",
                promptText = "A forbidden love relationship opposed by families, rules, or circumstances.",
                targetCategory = MediaType.ALL,
                tag = "Trope"
            ),
            SuggestionChip(
                title = "Bodyguard Romance",
                promptText = "A protector or bodyguard who falls in love with the person being protected.",
                targetCategory = MediaType.ALL,
                tag = "Trope"
            ),

            // Mood
            SuggestionChip(
                title = "Dark & Twisty",
                promptText = "Dark stories with suspense and unexpected twists.",
                targetCategory = MediaType.ALL,
                tag = "Mood"
            ),
            SuggestionChip(
                title = "Feel-Good",
                promptText = "Uplifting, comforting, feel-good entertainment.",
                targetCategory = MediaType.ALL,
                tag = "Mood"
            ),
            SuggestionChip(
                title = "Heartbreaking",
                promptText = "Emotionally intense or tragic stories with heartbreaking depth.",
                targetCategory = MediaType.ALL,
                tag = "Mood"
            ),
            SuggestionChip(
                title = "Mind-Bending",
                promptText = "Stories involving shocking revelations, reality twists, or puzzles.",
                targetCategory = MediaType.ALL,
                tag = "Mood"
            ),

            // Memory
            SuggestionChip(
                title = "Time Loop",
                promptText = "Stories where events repeat in a cycle and characters are caught in a time loop.",
                targetCategory = MediaType.ALL,
                tag = "Memory"
            ),
            SuggestionChip(
                title = "Secret Identity",
                promptText = "A remembered story about a character hiding who they really are.",
                targetCategory = MediaType.ALL,
                tag = "Memory"
            ),
            SuggestionChip(
                title = "A World That Isn't Real",
                promptText = "Stories involving simulated, manipulated, or deceptive realities.",
                targetCategory = MediaType.ALL,
                tag = "Memory"
            ),

            // Single-word
            SuggestionChip(
                title = "Action",
                promptText = "Broad content discovery for thrilling action movies and series.",
                targetCategory = MediaType.ALL,
                tag = "Single-word"
            ),
            SuggestionChip(
                title = "Romance",
                promptText = "Broad content discovery for emotional and heartfelt romance.",
                targetCategory = MediaType.ALL,
                tag = "Single-word"
            ),
            SuggestionChip(
                title = "Horror",
                promptText = "Broad content discovery for suspenseful and chilling horror.",
                targetCategory = MediaType.ALL,
                tag = "Single-word"
            ),
            SuggestionChip(
                title = "Comedy",
                promptText = "Broad content discovery for witty and funny comedies.",
                targetCategory = MediaType.ALL,
                tag = "Single-word"
            ),

            // Plot
            SuggestionChip(
                title = "Family Secrets",
                promptText = "A plot focused on hidden truths and dark secrets within a family.",
                targetCategory = MediaType.ALL,
                tag = "Plot"
            ),
            SuggestionChip(
                title = "Secret Identity",
                promptText = "A plot centered on a character hiding who they really are while living a double life.",
                targetCategory = MediaType.ALL,
                tag = "Plot"
            ),
            SuggestionChip(
                title = "Revenge Story",
                promptText = "Characters seeking revenge and justice for a past wrong.",
                targetCategory = MediaType.ALL,
                tag = "Plot"
            ),
            SuggestionChip(
                title = "Hidden Powers",
                promptText = "Characters discovering or concealing extraordinary hidden abilities.",
                targetCategory = MediaType.ALL,
                tag = "Plot"
            ),

            // Anime
            SuggestionChip(
                title = "Underdog Hero",
                promptText = "An underestimated underdog character overcoming stronger opponents.",
                targetCategory = MediaType.ANIME,
                tag = "Anime"
            ),
            SuggestionChip(
                title = "Overpowered Hero",
                promptText = "An exceptionally powerful central character dominating challenges.",
                targetCategory = MediaType.ANIME,
                tag = "Anime"
            ),
            SuggestionChip(
                title = "Epic Revenge",
                promptText = "A large-scale revenge-driven story with high stakes and retribution.",
                targetCategory = MediaType.ANIME,
                tag = "Anime"
            ),

            // Drama
            SuggestionChip(
                title = "Royal Romance",
                promptText = "Romance involving royalty or royal families and palace drama.",
                targetCategory = MediaType.TURKISH_DRAMA,
                tag = "Drama"
            ),
            SuggestionChip(
                title = "Family Secrets",
                promptText = "Intense drama uncovering hidden truths within a powerful family.",
                targetCategory = MediaType.KDRAMA,
                tag = "Drama"
            ),
            SuggestionChip(
                title = "Love Triangle",
                promptText = "A romantic conflict and emotional drama involving three people.",
                targetCategory = MediaType.KDRAMA,
                tag = "Drama"
            )
        )
    }
}
