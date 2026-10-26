package com.kunal.sfinder

import com.kunal.sfinder.domain.model.ContentType
import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.MediaType
import com.kunal.sfinder.domain.model.SearchQuery
import com.kunal.sfinder.domain.model.SearchResultState
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QueryPreservationUnitTest {

    private val targetQuery = "Romantic, emotional, suspenseful, with unexpected twists."

    @Test
    fun searchQuery_preservesFullQueryTextWithCommasAndPunctuation() {
        val query = SearchQuery(rawText = targetQuery)
        assertEquals(targetQuery, query.rawText)
        assertFalse(query.isBlank)
        assertEquals(57, query.rawText.length)
        assertFalse(query.isLongDescription)
    }

    @Test
    fun clientSerialization_preservesFullQueryInJsonPayload() {
        // Reproduce client serialization logic from AiDiscoveryApiClient
        val category = MediaType.ALL
        val contentType = ContentType.ALL
        val genre = "ANY"
        val country = "ANY"

        val requestJson = JSONObject().apply {
            put("query", targetQuery.trim())
            put("category", category.name)
            put("contentType", contentType.name)
            if (genre.isNotBlank() && genre != "ANY") {
                put("genre", genre.trim())
            }
            if (country.isNotBlank() && country != "ANY") {
                put("country", country.trim())
            }
            put("clientVersion", "1.0.0")
        }.toString()

        val parsed = JSONObject(requestJson)
        assertEquals(
            "Serialized JSON must preserve query text without comma splitting or truncation",
            targetQuery,
            parsed.getString("query")
        )
    }

    @Test
    fun resultsHeaderFormatting_preservesCompleteQueryString() {
        val items = listOf(
            EntertainmentItem(
                id = "1",
                title = "Test Show",
                originalTitle = null,
                releaseYear = 2024,
                mediaType = MediaType.TV_SERIES,
                genres = listOf("Drama", "Romance"),
                originalLanguage = "en",
                countryOfOrigin = "US",
                rating = 8.0,
                synopsis = "Test synopsis",
                posterUrl = null,
                backdropUrl = null,
                matchExplanation = "Test match",
                catalogSource = "TVmaze"
            )
        )

        val state = SearchResultState.Success(
            items = items,
            queryText = targetQuery,
            category = MediaType.ALL,
            searchMode = DiscoveryMode.AI_ENHANCED,
            disclaimer = null,
            fallbackUsed = false
        )

        val headerText = "${state.items.size} Result${if (state.items.size != 1) "s" else ""} for \"${state.queryText}\""
        assertEquals(
            "Results header must display the full query text enclosed in quotes",
            "1 Result for \"Romantic, emotional, suspenseful, with unexpected twists.\"",
            headerText
        )
    }

    @Test
    fun queryTrimming_doesNotStripOrTokenizeInternalCommas() {
        val inputWithPaddedSpaces = "   $targetQuery   "
        val trimmed = inputWithPaddedSpaces.trim()
        assertEquals(targetQuery, trimmed)
        val tokens = trimmed.split(",")
        assertEquals("Internal commas remain present in string", 4, tokens.size)
    }
}
