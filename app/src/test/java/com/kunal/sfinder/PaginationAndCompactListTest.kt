package com.kunal.sfinder

import com.kunal.sfinder.data.remote.ai.AiDiscoveryApiClient
import com.kunal.sfinder.data.remote.ai.AiDiscoveryResponse
import com.kunal.sfinder.domain.model.ContentType
import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.MediaType
import com.kunal.sfinder.domain.model.SearchResultState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PaginationAndCompactListTest {

    private fun createSampleItem(id: String, title: String, rating: Double = 8.0): EntertainmentItem {
        return EntertainmentItem(
            id = id,
            title = title,
            releaseYear = 2020,
            mediaType = MediaType.TV_SERIES,
            genres = listOf("Drama", "Mystery"),
            rating = rating,
            synopsis = "A mysterious occurrence in a town.",
            catalogSource = "Data provided by TVmaze (CC BY-SA 4.0)"
        )
    }

    @Test
    fun successState_handlesPaginationAndLoadingMore() {
        val page1Items = (1..6).map { createSampleItem("item-$it", "Show $it") }
        val state = SearchResultState.Success(
            items = page1Items,
            queryText = "mystery",
            category = MediaType.ALL,
            searchMode = DiscoveryMode.CATALOG_SEARCH,
            totalCount = 25,
            page = 1,
            hasMore = true,
            isLoadingMore = false
        )

        assertEquals(6, state.items.size)
        assertEquals(25, state.totalCount)
        assertEquals(1, state.page)
        assertTrue(state.hasMore)
        assertFalse(state.isLoadingMore)

        // Simulate Load More triggered
        val loadingMoreState = state.copy(isLoadingMore = true)
        assertTrue(loadingMoreState.isLoadingMore)

        // Simulate Page 2 loaded (items 7 to 12)
        val page2Items = (7..12).map { createSampleItem("item-$it", "Show $it") }
        val existingIds = loadingMoreState.items.map { it.id }.toSet()
        val uniqueNewItems = page2Items.filter { it.id !in existingIds }

        val page2State = loadingMoreState.copy(
            items = loadingMoreState.items + uniqueNewItems,
            page = 2,
            hasMore = true,
            isLoadingMore = false
        )

        assertEquals(12, page2State.items.size)
        assertEquals(2, page2State.page)
        assertFalse(page2State.isLoadingMore)
        assertEquals("Show 1", page2State.items[0].title)
        assertEquals("Show 7", page2State.items[6].title)
    }

    @Test
    fun deduplication_preservesOrderAndPreventsDuplicateKeys() {
        val page1Items = listOf(
            createSampleItem("id-1", "Show 1"),
            createSampleItem("id-2", "Show 2")
        )
        val page2Items = listOf(
            createSampleItem("id-2", "Show 2 Duplicate"),
            createSampleItem("id-3", "Show 3")
        )

        val existingIds = page1Items.map { it.id }.toSet()
        val uniqueNew = page2Items.filter { it.id !in existingIds }
        val combined = page1Items + uniqueNew

        assertEquals(3, combined.size)
        assertEquals("id-1", combined[0].id)
        assertEquals("id-2", combined[1].id)
        assertEquals("id-3", combined[2].id)
    }
}
