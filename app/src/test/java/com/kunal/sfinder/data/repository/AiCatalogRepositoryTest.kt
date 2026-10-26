package com.kunal.sfinder.data.repository

import com.kunal.sfinder.data.remote.ai.AiDiscoveryApiClient
import com.kunal.sfinder.data.remote.ai.AiDiscoveryNetworkException
import com.kunal.sfinder.data.remote.ai.AiDiscoveryResponse
import com.kunal.sfinder.data.remote.tvmaze.TvMazeApiClient
import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.MediaType
import com.kunal.sfinder.domain.model.SearchQuery
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AiCatalogRepositoryTest {

    @Test
    fun blankQuery_returnsEmptyModeImmediately() = runBlocking {
        val repo = AiCatalogRepository()
        val result = repo.discoverEntertainment(SearchQuery(rawText = "   ")).first()

        assertEquals(DiscoveryMode.EMPTY, result.mode)
        assertTrue(result.items.isEmpty())
        assertFalse(result.fallbackUsed)
    }

    @Test
    fun parseModeEnum_safelyHandlesUnexpectedStrings() {
        assertEquals(DiscoveryMode.AI_ENHANCED, DiscoveryMode.fromString("AI_ENHANCED"))
        assertEquals(DiscoveryMode.CATALOG_SEARCH, DiscoveryMode.fromString("CATALOG_SEARCH"))
        assertEquals(DiscoveryMode.EMPTY, DiscoveryMode.fromString("EMPTY"))
        assertEquals(DiscoveryMode.ERROR, DiscoveryMode.fromString("ERROR"))
        assertEquals(DiscoveryMode.CATALOG_SEARCH, DiscoveryMode.fromString("SOMETHING_ELSE"))
        assertEquals(DiscoveryMode.CATALOG_SEARCH, DiscoveryMode.fromString(null))
    }
}
