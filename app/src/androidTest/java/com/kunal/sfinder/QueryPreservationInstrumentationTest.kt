package com.kunal.sfinder

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
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
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class QueryPreservationInstrumentationTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    class MockCatalogRepository : EntertainmentCatalogRepository {
        var lastCapturedQuery: SearchQuery? = null

        override fun discoverEntertainment(query: SearchQuery): Flow<DiscoveryResult> {
            lastCapturedQuery = query
            val mockItem = EntertainmentItem(
                id = "tvmaze-1",
                title = "Mock Thriller Romance",
                originalTitle = null,
                releaseYear = 2024,
                mediaType = MediaType.TV_SERIES,
                genres = listOf("Drama", "Romance", "Thriller"),
                originalLanguage = "English",
                countryOfOrigin = "United States",
                rating = 8.5,
                synopsis = "A dramatic story with twists and emotional stakes.",
                posterUrl = null,
                backdropUrl = null,
                matchExplanation = "Exact match for romantic, suspenseful drama.",
                catalogSource = "Data provided by TVmaze (CC BY-SA 4.0)"
            )
            return flowOf(
                DiscoveryResult(
                    items = listOf(mockItem),
                    mode = DiscoveryMode.AI_ENHANCED,
                    disclaimer = "Mock verification",
                    fallbackUsed = false
                )
            )
        }

        override suspend fun getEntertainmentDetails(
            id: String,
            catalogSource: String?
        ): Result<EntertainmentItem> {
            return Result.failure(UnsupportedOperationException())
        }
    }

    @Test
    fun testFullQueryPreservedThroughInputSubmissionAndHeaderDisplay() {
        val targetQuery = "Romantic, emotional, suspenseful, with unexpected twists."
        val mockRepo = MockCatalogRepository()

        composeTestRule.setContent {
            SFinderTheme {
                HomeScreen(repository = mockRepo)
            }
        }

        // 1. Enter text into actual search field
        val textFieldNode = composeTestRule.onNode(hasTestTag("search_text_field"))
        textFieldNode.assertIsDisplayed()
        textFieldNode.performTextInput(targetQuery)

        // 2. Click the Discover button to submit
        val discoverButtonNode = composeTestRule.onNode(hasTestTag("discover_button"))
        discoverButtonNode.assertIsDisplayed()
        discoverButtonNode.performClick()

        // Wait for UI to idle and coroutines to finish
        composeTestRule.waitForIdle()

        // 3. Verify repository received EXACT un-truncated query (no splitting on commas)
        assertNotNull("Repository must have received query", mockRepo.lastCapturedQuery)
        assertEquals(
            "Query submitted to repository must exactly match input string without comma splitting or truncation",
            targetQuery,
            mockRepo.lastCapturedQuery?.rawText
        )

        // 4. Verify search text field still contains complete query
        textFieldNode.assertTextContains(targetQuery)

        // 5. Verify results header displays the complete query inside quotes
        val headerNode = composeTestRule.onNode(hasTestTag("results_header_text"))
        headerNode.assertIsDisplayed()
        headerNode.assertTextEquals("1 Result for \"$targetQuery\"")
    }
}
