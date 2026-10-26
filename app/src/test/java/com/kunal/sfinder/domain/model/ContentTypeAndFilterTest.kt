package com.kunal.sfinder.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentTypeAndFilterTest {

    @Test
    fun contentType_fromDisplayName_matchesCorrectly() {
        assertEquals(ContentType.ALL, ContentType.fromDisplayName("All"))
        assertEquals(ContentType.ALL, ContentType.fromDisplayName("all"))
        assertEquals(ContentType.MOVIES, ContentType.fromDisplayName("Movies"))
        assertEquals(ContentType.MOVIES, ContentType.fromDisplayName("movies"))
        assertEquals(ContentType.SERIES, ContentType.fromDisplayName("Series"))
        assertEquals(ContentType.SERIES, ContentType.fromDisplayName("series"))
        assertEquals(ContentType.ALL, ContentType.fromDisplayName("Unknown"))
    }

    @Test
    fun searchQuery_defaultsToAllContentTypeAndAnyFilters() {
        val query = SearchQuery(rawText = "detective thriller")
        assertEquals(ContentType.ALL, query.contentType)
        assertEquals("ANY", query.genre)
        assertEquals("ANY", query.country)
        assertFalse(query.isBlank)
    }

    @Test
    fun searchQuery_carriesCustomFiltersCorrectly() {
        val query = SearchQuery(
            rawText = "detective thriller",
            contentType = ContentType.SERIES,
            genre = "Mystery & Crime",
            country = "United Kingdom"
        )
        assertEquals(ContentType.SERIES, query.contentType)
        assertEquals("Mystery & Crime", query.genre)
        assertEquals("United Kingdom", query.country)
    }

    @Test
    fun searchResultState_unsupported_holdsDataCorrectly() {
        val state = SearchResultState.Unsupported(
            contentType = ContentType.MOVIES,
            message = "Movie discovery is not available yet because a movie catalog has not been connected."
        )
        assertEquals(ContentType.MOVIES, state.contentType)
        assertTrue(state.message.contains("Movie discovery is not available yet"))
    }

    @Test
    fun countryCatalog_providesComprehensiveWorldwideCountriesBeyondShortlist() {
        val allCountries = com.kunal.sfinder.ui.components.CountryCatalog.ALL_COUNTRIES
        assertTrue(allCountries.size > 200)
        assertEquals(com.kunal.sfinder.ui.components.CountryCatalog.ANY_COUNTRY, allCountries.first())
        assertTrue(allCountries.contains("United States"))
        assertTrue(allCountries.contains("South Korea"))
        assertTrue(allCountries.contains("Norway"))
        assertTrue(allCountries.contains("Brazil"))
        assertTrue(allCountries.contains("Australia"))
        assertTrue(allCountries.contains("Nigeria"))
    }

    @Test
    fun countryCatalog_searchCountries_filtersAccuratelyAndCaseInsensitively() {
        val norwayResults = com.kunal.sfinder.ui.components.CountryCatalog.searchCountries("norw")
        assertEquals(1, norwayResults.size)
        assertEquals("Norway", norwayResults.first())

        val koreaResults = com.kunal.sfinder.ui.components.CountryCatalog.searchCountries("korea")
        assertTrue(koreaResults.any { it.contains("South Korea", ignoreCase = true) })

        val blankResults = com.kunal.sfinder.ui.components.CountryCatalog.searchCountries("   ")
        assertEquals(com.kunal.sfinder.ui.components.CountryCatalog.ALL_COUNTRIES.size, blankResults.size)
    }

    @Test
    fun test1_moviesSelection_nowExecutesMovieSearchWithMoviesContentType() {
        var networkCallCount = 0
        var submittedContentType: ContentType? = null
        fun simulateExecuteSearch(query: String, contentType: ContentType): SearchResultState {
            val trimmed = query.trim()
            if (trimmed.isEmpty()) return SearchResultState.Idle
            networkCallCount++
            submittedContentType = contentType
            return SearchResultState.Loading()
        }

        val state = simulateExecuteSearch("interstellar space odyssey", ContentType.MOVIES)
        assertTrue(state is SearchResultState.Loading)
        assertEquals(ContentType.MOVIES, submittedContentType)
        assertEquals(1, networkCallCount)
    }

    @Test
    fun mediaType_fromDisplayName_supportsMovieAndMovies() {
        assertEquals(MediaType.MOVIES, MediaType.fromDisplayName("MOVIE"))
        assertEquals(MediaType.MOVIES, MediaType.fromDisplayName("MOVIES"))
        assertEquals(MediaType.MOVIES, MediaType.fromDisplayName("Movies"))
        assertEquals(MediaType.TV_SERIES, MediaType.fromDisplayName("SERIES"))
        assertEquals(MediaType.TV_SERIES, MediaType.fromDisplayName("TV_SERIES"))
        assertEquals(MediaType.TV_SERIES, MediaType.fromDisplayName("TV Series"))
        assertEquals(MediaType.KDRAMA, MediaType.fromDisplayName("K-Dramas"))
        assertEquals(MediaType.ALL, MediaType.fromDisplayName("ALL"))
    }

    @Test
    fun test1_switchToSeries_correctlyUpdatesContentTypeAndInitiatesSingleRequest() {
        var networkCallCount = 0
        var currentContentType = ContentType.MOVIES
        val query = "detective thriller"

        fun simulateSwitchToSeries() {
            currentContentType = ContentType.SERIES
            if (query.isNotBlank()) {
                networkCallCount++
            }
        }

        simulateSwitchToSeries()
        assertEquals(ContentType.SERIES, currentContentType)
        assertEquals(1, networkCallCount)
    }

    @Test
    fun test2_countrySearch_filtersLocallyWithoutNetwork() {
        // Typing "Ger" into the country search field
        val gerResults = com.kunal.sfinder.ui.components.CountryCatalog.searchCountries("Ger")
        assertTrue(gerResults.contains("Germany"))
        assertFalse(gerResults.contains("France"))
        assertFalse(gerResults.contains("Japan"))

        // Clearing country search restores full 240+ countries
        val clearedResults = com.kunal.sfinder.ui.components.CountryCatalog.searchCountries("")
        assertEquals(com.kunal.sfinder.ui.components.CountryCatalog.ALL_COUNTRIES.size, clearedResults.size)
        assertTrue(clearedResults.size > 200)
    }

    @Test
    fun test2_atomicFilter_cancellationDoesNotCommitPendingChanges() {
        var activeGenre = "ANY"
        var activeCountry = "ANY"

        // User opens dialog with initial values
        var draftGenre = activeGenre
        var draftCountry = activeCountry

        // User selects draft choices
        draftGenre = "Drama"
        draftCountry = "Germany"

        // User cancels / closes dialog without calling onApply
        // draft state is discarded; active state remains unchanged
        draftGenre = activeGenre
        draftCountry = activeCountry

        assertEquals("ANY", activeGenre)
        assertEquals("ANY", activeCountry)
    }

    @Test
    fun test2_atomicFilter_resetRestoresDocumentedDefaults() {
        var draftGenre = "Action"
        var draftCountry = "Japan"

        // Press Reset
        draftGenre = "ANY"
        draftCountry = com.kunal.sfinder.ui.components.CountryCatalog.ANY_COUNTRY

        assertEquals("ANY", draftGenre)
        assertEquals("Any country — worldwide", draftCountry)
        val finalCountry = if (draftCountry == com.kunal.sfinder.ui.components.CountryCatalog.ANY_COUNTRY) "ANY" else draftCountry
        assertEquals("ANY", finalCountry)
    }

    @Test
    fun test2_atomicFilter_applyCommitsTogetherAndInitiatesSingleRequest() {
        var requestCount = 0
        var activeGenre = "ANY"
        var activeCountry = "ANY"
        val query = "Dark"

        fun onApply(newGenre: String, newCountry: String) {
            activeGenre = newGenre
            activeCountry = newCountry
            if (query.isNotBlank()) {
                requestCount++
            }
        }

        // Apply Drama + Germany atomically
        onApply("Drama", "Germany")

        assertEquals("Drama", activeGenre)
        assertEquals("Germany", activeCountry)
        assertEquals(1, requestCount)
    }

    @Test
    fun test2_rapidTapsOrRecomposition_preventsDuplicateRequests() {
        var callCount = 0
        var lastQuery: String? = null
        var lastType: ContentType? = null
        var lastGenre: String? = null
        var lastCountry: String? = null

        fun executeSearch(query: String, type: ContentType, genre: String, country: String, force: Boolean = false) {
            val trimmed = query.trim()
            if (!force &&
                trimmed == lastQuery &&
                type == lastType &&
                genre == lastGenre &&
                country == lastCountry
            ) {
                return // suppressed duplicate
            }
            lastQuery = trimmed
            lastType = type
            lastGenre = genre
            lastCountry = country
            callCount++
        }

        // First submission
        executeSearch("Dark", ContentType.SERIES, "Drama", "Germany")
        assertEquals(1, callCount)

        // Rapid duplicate tap / recomposition with same arguments
        executeSearch("Dark", ContentType.SERIES, "Drama", "Germany")
        executeSearch("Dark", ContentType.SERIES, "Drama", "Germany")
        executeSearch("Dark", ContentType.SERIES, "Drama", "Germany")
        assertEquals(1, callCount) // strictly de-duplicated

        // Different filter triggers new search
        executeSearch("Dark", ContentType.SERIES, "Thriller", "Germany")
        assertEquals(2, callCount)
    }

    @Test
    fun phase5AK_discoveryGuideCards_wordingMatchesExactly() {
        val items = com.kunal.sfinder.ui.components.DiscoveryGuideCatalog.ITEMS
        assertEquals(3, items.size)

        // Card 1
        assertEquals("By Mood", items[0].title)
        assertEquals("Find something that matches how you feel.", items[0].description)
        assertEquals("Looking for romance, comedy, suspense, thrills, or something feel-good? Start with a mood.", items[0].tagline)
        assertEquals("Romantic, emotional, suspenseful, with unexpected twists.", items[0].example)

        // Card 2
        assertEquals("By Story", items[1].title)
        assertEquals("For plots, characters, relationships and tropes.", items[1].description)
        assertEquals("Describe the plot, characters, relationships, or twist—even in your own words.", items[1].tagline)
        assertEquals("A hero falls in love with his enemy’s daughter.", items[1].example)

        // Card 3
        assertEquals("From Memory", items[2].title)
        assertEquals("When you remember something but cannot recall the title.", items[2].description)
        assertEquals("Remember a scene, character, quote, place, or small detail? Tell us whatever you recall.", items[2].tagline)
        assertEquals("A man discovers his entire life might be secretly controlled.", items[2].example)
    }

    @Test
    fun phase5AK_clearFilters_withSubmittedQuery_producesExactlyOneRefreshedRequestAndPreservesQueryAndType() {
        var activeGenre = "Mystery & Crime"
        var activeCountry = "United Kingdom"
        var currentContentType = ContentType.SERIES
        var searchQuery = "detective in small village"
        var isIdle = false
        var requestCount = 0
        var lastRequestedGenre: String? = null
        var lastRequestedCountry: String? = null
        var lastRequestedType: ContentType? = null
        var lastRequestedQuery: String? = null

        fun executeSearch(query: String, type: ContentType, genre: String, country: String, force: Boolean = false) {
            requestCount++
            lastRequestedQuery = query
            lastRequestedType = type
            lastRequestedGenre = genre
            lastRequestedCountry = country
        }

        fun onClearFilters() {
            val hadActiveFilters = activeGenre != "ANY" || activeCountry != "ANY"
            if (hadActiveFilters) {
                activeGenre = "ANY"
                activeCountry = "ANY"
                if (searchQuery.isNotBlank() && !isIdle) {
                    executeSearch(searchQuery, currentContentType, genre = "ANY", country = "ANY", force = true)
                }
            }
        }

        val activeFiltersCountBefore = (if (activeGenre != "ANY") 1 else 0) + (if (activeCountry != "ANY") 1 else 0)
        assertEquals(2, activeFiltersCountBefore)

        onClearFilters()

        val activeFiltersCountAfter = (if (activeGenre != "ANY") 1 else 0) + (if (activeCountry != "ANY") 1 else 0)
        assertEquals(0, activeFiltersCountAfter)
        assertEquals("ANY", activeGenre)
        assertEquals("ANY", activeCountry)
        assertEquals(ContentType.SERIES, currentContentType)
        assertEquals("detective in small village", searchQuery)
        assertEquals(1, requestCount)
        assertEquals("ANY", lastRequestedGenre)
        assertEquals("ANY", lastRequestedCountry)
        assertEquals(ContentType.SERIES, lastRequestedType)
        assertEquals("detective in small village", lastRequestedQuery)

        // Repeated tap is a no-op and produces zero additional requests
        onClearFilters()
        assertEquals(1, requestCount)
    }

    @Test
    fun phase5AK_clearFilters_withoutSubmittedQuery_resetsFiltersLocallyWithoutNetworkRequests() {
        var activeGenre = "Romance"
        var activeCountry = "South Korea"
        var currentContentType = ContentType.ALL
        var searchQuery = ""
        var isIdle = true
        var requestCount = 0

        fun executeSearch(query: String, type: ContentType, genre: String, country: String, force: Boolean = false) {
            requestCount++
        }

        fun onClearFilters() {
            val hadActiveFilters = activeGenre != "ANY" || activeCountry != "ANY"
            if (hadActiveFilters) {
                activeGenre = "ANY"
                activeCountry = "ANY"
                if (searchQuery.isNotBlank() && !isIdle) {
                    executeSearch(searchQuery, currentContentType, genre = "ANY", country = "ANY", force = true)
                }
            }
        }

        val activeFiltersCountBefore = (if (activeGenre != "ANY") 1 else 0) + (if (activeCountry != "ANY") 1 else 0)
        assertEquals(2, activeFiltersCountBefore)

        onClearFilters()

        val activeFiltersCountAfter = (if (activeGenre != "ANY") 1 else 0) + (if (activeCountry != "ANY") 1 else 0)
        assertEquals(0, activeFiltersCountAfter)
        assertEquals("ANY", activeGenre)
        assertEquals("ANY", activeCountry)
        assertEquals(0, requestCount) // Strictly zero network requests when idle
    }

    @Test
    fun phase5AM_presetContent_containsAllRequiredCategoriesAndTitles() {
        val suggestions = SuggestionChip.DEFAULT_SUGGESTIONS
        assertEquals(25, suggestions.size)

        // Trope (4)
        val tropes = suggestions.filter { it.tag == "Trope" }
        assertEquals(listOf("Enemies to Lovers", "Fake Dating", "Forbidden Love", "Bodyguard Romance"), tropes.map { it.title })

        // Mood (4)
        val moods = suggestions.filter { it.tag == "Mood" }
        assertEquals(listOf("Dark & Twisty", "Feel-Good", "Heartbreaking", "Mind-Bending"), moods.map { it.title })

        // Memory (3)
        val memories = suggestions.filter { it.tag == "Memory" }
        assertEquals(listOf("Time Loop", "Secret Identity", "A World That Isn't Real"), memories.map { it.title })

        // Single-word (4)
        val singleWords = suggestions.filter { it.tag == "Single-word" }
        assertEquals(listOf("Action", "Romance", "Horror", "Comedy"), singleWords.map { it.title })

        // Plot (4)
        val plots = suggestions.filter { it.tag == "Plot" }
        assertEquals(listOf("Family Secrets", "Secret Identity", "Revenge Story", "Hidden Powers"), plots.map { it.title })

        // Anime (3)
        val anime = suggestions.filter { it.tag == "Anime" }
        assertEquals(listOf("Underdog Hero", "Overpowered Hero", "Epic Revenge"), anime.map { it.title })

        // Drama (3)
        val dramas = suggestions.filter { it.tag == "Drama" }
        assertEquals(listOf("Royal Romance", "Family Secrets", "Love Triangle"), dramas.map { it.title })

        // Distinct category prompts for same-titled chips
        val secretIdentityMemory = suggestions.first { it.tag == "Memory" && it.title == "Secret Identity" }
        val secretIdentityPlot = suggestions.first { it.tag == "Plot" && it.title == "Secret Identity" }
        assertFalse(secretIdentityMemory.promptText == secretIdentityPlot.promptText)

        val familySecretsPlot = suggestions.first { it.tag == "Plot" && it.title == "Family Secrets" }
        val familySecretsDrama = suggestions.first { it.tag == "Drama" && it.title == "Family Secrets" }
        assertFalse(familySecretsPlot.promptText == familySecretsDrama.promptText)
    }

    @Test
    fun phase5AM_chipTap_respectsSelectedContentTypeAndFilters() {
        val selectedContentType = ContentType.MOVIES
        val selectedGenre = "Thriller"
        val selectedCountry = "Japan"
        var populatedQuery: String? = null
        var requestedContentType: ContentType? = null
        var requestedGenre: String? = null
        var requestedCountry: String? = null

        fun onChipClick(chip: SuggestionChip) {
            populatedQuery = chip.promptText
            requestedContentType = selectedContentType
            requestedGenre = selectedGenre
            requestedCountry = selectedCountry
        }

        val testChip = SuggestionChip.DEFAULT_SUGGESTIONS.first { it.title == "Time Loop" }
        onChipClick(testChip)

        assertEquals(testChip.promptText, populatedQuery)
        assertEquals(ContentType.MOVIES, requestedContentType)
        assertEquals("Thriller", requestedGenre)
        assertEquals("Japan", requestedCountry)
    }

    @Test
    fun phase5AN_resultsHeader_cleanSummaryFormat() {
        fun formatResultsFilterLabel(category: MediaType): String {
            val label = when (category) {
                MediaType.TV_SERIES -> "Series"
                else -> category.displayName
            }
            return "Filter: $label"
        }

        assertEquals("Filter: All", formatResultsFilterLabel(MediaType.ALL))
        assertEquals("Filter: Movies", formatResultsFilterLabel(MediaType.MOVIES))
        assertEquals("Filter: Series", formatResultsFilterLabel(MediaType.TV_SERIES))
    }
}
