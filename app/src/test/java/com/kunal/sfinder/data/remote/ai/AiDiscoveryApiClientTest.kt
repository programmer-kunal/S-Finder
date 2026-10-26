package com.kunal.sfinder.data.remote.ai

import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.MediaType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AiDiscoveryApiClientTest {

    private val client = AiDiscoveryApiClient()

    @Test
    fun parseDiscoveryResponse_aiEnhancedMode() {
        val sampleJson = """
            {
              "mode": "AI_ENHANCED",
              "query": "A bodyguard protects a politician's daughter",
              "resolvedCount": 1,
              "items": [
                {
                  "id": "tvmaze-19721",
                  "title": "The K2",
                  "originalTitle": "더 케이투",
                  "releaseYear": 2016,
                  "mediaType": "KDRAMA",
                  "genres": ["Drama", "Action", "Thriller"],
                  "originalLanguage": "Korean",
                  "countryOfOrigin": "Korea, Republic of • Korean",
                  "rating": 6.5,
                  "voteCount": 150,
                  "synopsis": "A former soldier is hired as a bodyguard.",
                  "posterUrl": "https://static.tvmaze.com/uploads/images/medium_portrait/76/190578.jpg",
                  "backdropUrl": null,
                  "matchExplanation": "Strong match for bodyguard protecting a high-profile target.",
                  "catalogSource": "Data provided by TVmaze (CC BY-SA 4.0)"
                }
              ],
              "disclaimer": "Context-matched using Gemini and verified with TVmaze.",
              "fallbackUsed": false
            }
        """.trimIndent()

        val response = client.parseDiscoveryResponse(sampleJson)

        assertEquals(DiscoveryMode.AI_ENHANCED, response.mode)
        assertEquals("A bodyguard protects a politician's daughter", response.query)
        assertEquals(1, response.resolvedCount)
        assertFalse(response.fallbackUsed)
        assertEquals("Context-matched using Gemini and verified with TVmaze.", response.disclaimer)
        assertNull(response.error)

        assertEquals(1, response.items.size)
        val item = response.items.first()
        assertEquals("tvmaze-19721", item.id)
        assertEquals("The K2", item.title)
        assertEquals("더 케이투", item.originalTitle)
        assertEquals(2016, item.releaseYear)
        assertEquals(MediaType.KDRAMA, item.mediaType)
        assertEquals(listOf("Drama", "Action", "Thriller"), item.genres)
        assertEquals("Korean", item.originalLanguage)
        assertEquals(6.5, item.rating!!, 0.01)
        assertEquals("Strong match for bodyguard protecting a high-profile target.", item.matchExplanation)
    }

    @Test
    fun parseDiscoveryResponse_catalogSearchMode() {
        val sampleJson = """
            {
              "mode": "CATALOG_SEARCH",
              "query": "Chernobyl",
              "resolvedCount": 1,
              "items": [
                {
                  "id": "tvmaze-30776",
                  "title": "Chernobyl",
                  "originalTitle": null,
                  "releaseYear": 2019,
                  "mediaType": "TV_SERIES",
                  "genres": ["Drama", "History"],
                  "originalLanguage": "English",
                  "countryOfOrigin": "United States",
                  "rating": 9.4,
                  "synopsis": "Dramatization of the 1986 nuclear accident.",
                  "posterUrl": "https://static.tvmaze.com/uploads/images/medium_portrait/192/482424.jpg",
                  "matchExplanation": null,
                  "catalogSource": "Data provided by TVmaze (CC BY-SA 4.0)"
                }
              ],
              "disclaimer": "Catalog Search: Data provided by TVmaze (CC BY-SA 4.0)",
              "fallbackUsed": true
            }
        """.trimIndent()

        val response = client.parseDiscoveryResponse(sampleJson)

        assertEquals(DiscoveryMode.CATALOG_SEARCH, response.mode)
        assertTrue(response.fallbackUsed)
        assertEquals(1, response.items.size)
        assertEquals("Chernobyl", response.items.first().title)
        assertNull(response.items.first().matchExplanation)
    }

    @Test
    fun parseDiscoveryResponse_emptyMode() {
        val sampleJson = """
            {
              "mode": "EMPTY",
              "query": "xyz123nonexistentfilmquery9999",
              "resolvedCount": 0,
              "items": [],
              "disclaimer": "No catalog matches identified for this query.",
              "fallbackUsed": false
            }
        """.trimIndent()

        val response = client.parseDiscoveryResponse(sampleJson)

        assertEquals(DiscoveryMode.EMPTY, response.mode)
        assertEquals(0, response.resolvedCount)
        assertTrue(response.items.isEmpty())
        assertFalse(response.fallbackUsed)
    }

    @Test
    fun parseDiscoveryResponse_handlesMissingAndNullFieldsDefensively() {
        val sampleJson = """
            {
              "mode": "AI_ENHANCED",
              "query": "minimal record",
              "resolvedCount": 1,
              "items": [
                {
                  "id": "tvmaze-1",
                  "title": "Minimal Show",
                  "originalTitle": "null",
                  "releaseYear": 0,
                  "mediaType": "UNKNOWN_FORMAT",
                  "synopsis": ""
                }
              ],
              "fallbackUsed": false
            }
        """.trimIndent()

        val response = client.parseDiscoveryResponse(sampleJson)

        assertEquals(1, response.items.size)
        val item = response.items.first()
        assertEquals("tvmaze-1", item.id)
        assertEquals("Minimal Show", item.title)
        assertNull(item.originalTitle)
        assertNull(item.releaseYear)
        assertEquals(MediaType.ALL, item.mediaType)
        assertNull(item.rating)
        assertNull(item.posterUrl)
        assertNull(item.matchExplanation)
    }

    @Test
    fun parseDiscoveryResponse_paginationFields() {
        val sampleJson = """
            {
              "mode": "CATALOG_SEARCH",
              "query": "small town mystery",
              "resolvedCount": 20,
              "totalCount": 114,
              "page": 2,
              "limit": 20,
              "hasMore": true,
              "items": [
                {
                  "id": "tvmaze-1",
                  "title": "Under the Dome",
                  "mediaType": "TV_SERIES",
                  "synopsis": "A small town is sealed off."
                }
              ],
              "disclaimer": "Verified catalog records matched via S Finder Catalog Index.",
              "fallbackUsed": false
            }
        """.trimIndent()

        val response = client.parseDiscoveryResponse(sampleJson)

        assertEquals(DiscoveryMode.CATALOG_SEARCH, response.mode)
        assertEquals(20, response.resolvedCount)
        assertEquals(114, response.totalCount)
        assertEquals(2, response.page)
        assertEquals(20, response.limit)
        assertTrue(response.hasMore)
        assertEquals(1, response.items.size)
    }

    @Test
    fun parsePrivacyNotice_parsesCorrectly() {
        val sampleJson = """
            {
              "service": "S Finder Discovery Service",
              "aiProvider": "Google Gemini API",
              "dataProcessingNotice": "Search queries are processed using Google Gemini models.",
              "catalogSource": "TVmaze REST API",
              "catalogAttribution": "Data provided by TVmaze (CC BY-SA 4.0)"
            }
        """.trimIndent()

        val notice = client.parsePrivacyNotice(sampleJson)

        assertEquals("S Finder Discovery Service", notice.service)
        assertEquals("Google Gemini API", notice.aiProvider)
        assertEquals("Search queries are processed using Google Gemini models.", notice.dataProcessingNotice)
        assertEquals("TVmaze REST API", notice.catalogSource)
        assertEquals("Data provided by TVmaze (CC BY-SA 4.0)", notice.catalogAttribution)
    }
}
