package com.kunal.sfinder

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.DiscoveryResult
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.MediaType
import com.kunal.sfinder.domain.model.SearchQuery
import com.kunal.sfinder.domain.repository.EntertainmentCatalogRepository
import com.kunal.sfinder.ui.home.HomeScreen
import com.kunal.sfinder.ui.theme.SFinderTheme
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PaginationLoadMoreInstrumentationTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    class PagedMockCatalogRepository : EntertainmentCatalogRepository {
        val receivedQueries = mutableListOf<SearchQuery>()

        override fun discoverEntertainment(query: SearchQuery): Flow<DiscoveryResult> {
            receivedQueries.add(query)
            val page = query.page
            val items = when (page) {
                1 -> listOf(
                    createItem("item-1", "Comedy Show 1", 2021),
                    createItem("item-2", "Comedy Show 2", 2022)
                )
                2 -> listOf(
                    createItem("item-3", "Comedy Show 3", 2023),
                    createItem("item-4", "Comedy Show 4", 2024)
                )
                3 -> listOf(
                    createItem("item-5", "Comedy Show 5", 2025)
                )
                else -> emptyList()
            }

            return flowOf(
                DiscoveryResult(
                    items = items,
                    mode = DiscoveryMode.AI_ENHANCED,
                    disclaimer = "Mock pagination",
                    fallbackUsed = false,
                    totalCount = 5,
                    page = page,
                    limit = 2,
                    hasMore = page < 3
                )
            )
        }

        override suspend fun getEntertainmentDetails(
            id: String,
            catalogSource: String?
        ): Result<EntertainmentItem> {
            return Result.failure(UnsupportedOperationException())
        }

        private fun createItem(id: String, title: String, year: Int) = EntertainmentItem(
            id = id,
            title = title,
            originalTitle = null,
            releaseYear = year,
            mediaType = MediaType.TV_SERIES,
            genres = listOf("Comedy"),
            originalLanguage = "English",
            countryOfOrigin = "United States",
            rating = 8.0,
            synopsis = "Synopsis for $title",
            posterUrl = null,
            backdropUrl = null,
            matchExplanation = "Context match for $title",
            catalogSource = "Data provided by TVmaze (CC BY-SA 4.0)"
        )
    }

    @Test
    fun testLoadMoreAppendsNewPagesAndTerminatesAtEnd() {
        val mockRepo = PagedMockCatalogRepository()

        composeTestRule.setContent {
            SFinderTheme {
                HomeScreen(repository = mockRepo)
            }
        }

        // 1. Enter query "comedy" and submit
        val textFieldNode = composeTestRule.onNode(hasTestTag("search_text_field"))
        textFieldNode.assertIsDisplayed()
        textFieldNode.performTextInput("comedy")

        val discoverButtonNode = composeTestRule.onNode(hasTestTag("discover_button"))
        discoverButtonNode.assertIsDisplayed()
        discoverButtonNode.performClick()

        composeTestRule.waitForIdle()

        // Verify page 1 items are displayed
        composeTestRule.onNodeWithText("Comedy Show 1").assertIsDisplayed()
        composeTestRule.onNodeWithText("Comedy Show 2").assertIsDisplayed()
        assertEquals(1, mockRepo.receivedQueries.size)
        assertEquals(1, mockRepo.receivedQueries[0].page)

        // 2. Scroll to and click "Load More Results"
        val lazyColumn = composeTestRule.onNodeWithTag("results_lazy_column")
        lazyColumn.performScrollToNode(hasTestTag("load_more_button"))

        val loadMoreNode = composeTestRule.onNodeWithTag("load_more_button")
        loadMoreNode.assertIsDisplayed()
        loadMoreNode.performClick()

        composeTestRule.waitForIdle()

        // Verify page 2 items are appended while page 1 items remain
        assertEquals(2, mockRepo.receivedQueries.size)
        assertEquals(2, mockRepo.receivedQueries[1].page)
        lazyColumn.performScrollToNode(hasText("Comedy Show 3"))
        composeTestRule.onNodeWithText("Comedy Show 3").assertIsDisplayed()

        // 3. Scroll to and click "Load More Results" for page 3 (last page)
        lazyColumn.performScrollToNode(hasTestTag("load_more_button"))
        val loadMoreNode2 = composeTestRule.onNodeWithTag("load_more_button")
        loadMoreNode2.assertIsDisplayed()
        loadMoreNode2.performClick()

        composeTestRule.waitForIdle()

        // Verify page 3 item is displayed
        assertEquals(3, mockRepo.receivedQueries.size)
        assertEquals(3, mockRepo.receivedQueries[2].page)
        lazyColumn.performScrollToNode(hasText("Comedy Show 5"))
        composeTestRule.onNodeWithText("Comedy Show 5").assertIsDisplayed()

        // Verify "Load More Results" button disappears at the end of the results (hasMore = false)
        composeTestRule.onNodeWithTag("load_more_button").assertDoesNotExist()
    }
}
