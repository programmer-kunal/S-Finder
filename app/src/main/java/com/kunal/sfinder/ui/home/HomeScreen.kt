package com.kunal.sfinder.ui.home

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kunal.sfinder.data.remote.ai.AiDiscoveryNetworkException
import com.kunal.sfinder.data.remote.ai.AiDiscoveryRateLimitException
import com.kunal.sfinder.data.remote.tvmaze.TvMazeNetworkException
import com.kunal.sfinder.data.remote.tvmaze.TvMazeRateLimitException
import com.kunal.sfinder.data.repository.AiCatalogRepository
import com.kunal.sfinder.domain.model.ContentType
import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.MediaType
import com.kunal.sfinder.domain.model.SearchQuery
import com.kunal.sfinder.domain.model.SearchResultState
import com.kunal.sfinder.domain.repository.EntertainmentCatalogRepository
import com.kunal.sfinder.ui.components.CategoryTabs
import com.kunal.sfinder.ui.components.ContentTypeSelector
import com.kunal.sfinder.ui.components.EmptyStateView
import com.kunal.sfinder.ui.components.EntertainmentCard
import com.kunal.sfinder.ui.components.ErrorStateView
import com.kunal.sfinder.ui.components.FilterDialog
import com.kunal.sfinder.ui.components.IdleWelcomeView
import com.kunal.sfinder.ui.components.LoadingStateView
import com.kunal.sfinder.ui.components.SearchInputBar
import com.kunal.sfinder.ui.components.SuggestionChipsSection
import com.kunal.sfinder.ui.theme.ChampagneGold
import com.kunal.sfinder.ui.theme.ChampagneGoldLight
import com.kunal.sfinder.ui.theme.ChampagneGoldMuted
import com.kunal.sfinder.ui.theme.CinemaBackground
import com.kunal.sfinder.ui.theme.CinemaBorder
import com.kunal.sfinder.ui.theme.CinemaSurface
import com.kunal.sfinder.ui.theme.CinemaSurfaceElevated
import com.kunal.sfinder.ui.theme.TextPrimary
import com.kunal.sfinder.ui.theme.TextSecondary
import com.kunal.sfinder.ui.theme.TextTertiary
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

/**
 * Main discovery screen for S Finder.
 * Phase 5: Gemini-assisted semantic discovery grounded in TVmaze with discreet badges & fallback.
 */
@Composable
fun HomeScreen(
    modifier: Modifier = Modifier,
    initialQuery: String? = null,
    initialGenre: String = "ANY",
    initialCountry: String = "ANY",
    initialContentType: ContentType = ContentType.ALL,
    repository: EntertainmentCatalogRepository = remember { AiCatalogRepository() }
) {
    val coroutineScope = rememberCoroutineScope()

    var searchQuery by remember { mutableStateOf(initialQuery ?: "") }
    var selectedCategory by remember {
        mutableStateOf(
            when (initialContentType) {
                ContentType.ALL -> MediaType.ALL
                ContentType.MOVIES -> MediaType.MOVIES
                ContentType.SERIES -> MediaType.TV_SERIES
            }
        )
    }
    var selectedContentType by remember { mutableStateOf(initialContentType) }
    var selectedGenre by remember { mutableStateOf(initialGenre) }
    var selectedCountry by remember { mutableStateOf(initialCountry) }
    var showFilterDialog by remember { mutableStateOf(false) }
    var resultState by remember { mutableStateOf<SearchResultState>(SearchResultState.Idle) }
    var showPrivacyDialog by remember { mutableStateOf(false) }
    var showStatusDialog by remember { mutableStateOf(false) }
    var statusDialogInfo by remember { mutableStateOf<Pair<String, String>?>(null) }

    // Active search coroutine reference & request ID tracking to cancel prior in-flight searches and discard stale responses
    var searchJob by remember { mutableStateOf<Job?>(null) }
    var currentRequestId by remember { mutableStateOf(0) }
    var lastSubmittedQuery by remember { mutableStateOf<String?>(null) }
    var lastSubmittedContentType by remember { mutableStateOf<ContentType?>(null) }
    var lastSubmittedGenre by remember { mutableStateOf<String?>(null) }
    var lastSubmittedCountry by remember { mutableStateOf<String?>(null) }

    fun executeSearch(
        query: String,
        contentType: ContentType = selectedContentType,
        genre: String = selectedGenre,
        country: String = selectedCountry,
        force: Boolean = false,
        page: Int = 1,
        isLoadMore: Boolean = false
    ) {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            searchJob?.cancel()
            resultState = SearchResultState.Idle
            lastSubmittedQuery = null
            lastSubmittedContentType = null
            lastSubmittedGenre = null
            lastSubmittedCountry = null
            return
        }

        // Prevent duplicate submissions from rapid repeated taps or identical re-evaluations
        if (!force &&
            !isLoadMore &&
            trimmed == lastSubmittedQuery &&
            contentType == lastSubmittedContentType &&
            genre == lastSubmittedGenre &&
            country == lastSubmittedCountry &&
            resultState !is SearchResultState.Error
        ) {
            return
        }

        // Cancel any existing in-flight search coroutine
        searchJob?.cancel()
        val requestId = ++currentRequestId
        lastSubmittedQuery = trimmed
        lastSubmittedContentType = contentType
        lastSubmittedGenre = genre
        lastSubmittedCountry = country

        searchJob = coroutineScope.launch {
            if (isLoadMore) {
                val current = resultState
                if (current is SearchResultState.Success) {
                    resultState = current.copy(isLoadingMore = true)
                }
            } else {
                resultState = SearchResultState.Loading("Finding matches with Gemini AI & TVmaze...")
            }

            try {
                val mappedCategory = when (contentType) {
                    ContentType.ALL -> MediaType.ALL
                    ContentType.MOVIES -> MediaType.MOVIES
                    ContentType.SERIES -> MediaType.TV_SERIES
                }
                repository.discoverEntertainment(
                    SearchQuery(
                        rawText = trimmed,
                        category = mappedCategory,
                        contentType = contentType,
                        genre = genre,
                        country = country,
                        page = page,
                        limit = 20
                    )
                )
                    .catch { error ->
                        if (requestId == currentRequestId) {
                            if (isLoadMore) {
                                val current = resultState
                                if (current is SearchResultState.Success) {
                                    resultState = current.copy(isLoadingMore = false)
                                }
                            } else {
                                val errorMsg = when (error) {
                                    is AiDiscoveryRateLimitException, is TvMazeRateLimitException ->
                                        "Request limit reached. Please wait a moment before searching again."
                                    is AiDiscoveryNetworkException, is TvMazeNetworkException ->
                                        "Network error: Unable to reach discovery service. Please check your internet connection."
                                    else -> error.message ?: "Failed to retrieve discovery results."
                                }
                                resultState = SearchResultState.Error(message = errorMsg, canRetry = true)
                            }
                        }
                    }
                    .collect { discoveryResult ->
                        if (requestId == currentRequestId) {
                            if (isLoadMore) {
                                val current = resultState
                                if (current is SearchResultState.Success) {
                                    val existingIds = current.items.map { it.id }.toSet()
                                    val newUnique = discoveryResult.items.filter { it.id !in existingIds }
                                    resultState = current.copy(
                                        items = current.items + newUnique,
                                        page = page,
                                        totalCount = discoveryResult.totalCount.coerceAtLeast(current.items.size + newUnique.size),
                                        hasMore = discoveryResult.hasMore,
                                        isLoadingMore = false
                                    )
                                }
                            } else {
                                if (discoveryResult.items.isNotEmpty()) {
                                    resultState = SearchResultState.Success(
                                        items = discoveryResult.items,
                                        queryText = trimmed,
                                        category = mappedCategory,
                                        searchMode = discoveryResult.mode,
                                        disclaimer = discoveryResult.disclaimer,
                                        fallbackUsed = discoveryResult.fallbackUsed,
                                        totalCount = discoveryResult.totalCount,
                                        page = discoveryResult.page,
                                        hasMore = discoveryResult.hasMore,
                                        isLoadingMore = false
                                    )
                                } else {
                                    val emptyTips = if (discoveryResult.fallbackUsed) {
                                        listOf(
                                            "Search with an exact or partial TV show title",
                                            "Try resetting the genre or country filters to 'Any'",
                                            "Try setting content filter to 'All' or 'Series'"
                                        )
                                    } else {
                                        listOf(
                                            "Try describing the core conflict or character dynamics (e.g. 'enemies to lovers bodyguard')",
                                            "Try resetting genre/country filters if too restrictive",
                                            "Mention key remembered scenes, settings, or narrative tropes"
                                        )
                                    }
                                    resultState = SearchResultState.Empty(
                                        queryText = trimmed,
                                        suggestions = emptyTips,
                                        searchMode = discoveryResult.mode,
                                        disclaimer = discoveryResult.disclaimer,
                                        fallbackUsed = discoveryResult.fallbackUsed
                                    )
                                }
                            }
                        }
                    }
            } catch (e: Exception) {
                if (requestId == currentRequestId) {
                    if (isLoadMore) {
                        val current = resultState
                        if (current is SearchResultState.Success) {
                            resultState = current.copy(isLoadingMore = false)
                        }
                    } else {
                        val errorMsg = when (e) {
                            is AiDiscoveryRateLimitException, is TvMazeRateLimitException ->
                                "Request limit reached. Please wait a moment before searching again."
                            is AiDiscoveryNetworkException, is TvMazeNetworkException ->
                                "Network error: Unable to reach discovery service. Please check your internet connection."
                            else -> e.message ?: "Failed to complete discovery."
                        }
                        resultState = SearchResultState.Error(message = errorMsg, canRetry = true)
                    }
                }
            }
        }
    }

    LaunchedEffect(initialQuery) {
        if (!initialQuery.isNullOrBlank()) {
            executeSearch(initialQuery, selectedContentType, selectedGenre, selectedCountry)
        }
    }

    if (showPrivacyDialog) {
        PrivacyNoticeDialog(onDismiss = { showPrivacyDialog = false })
    }

    if (showStatusDialog && statusDialogInfo != null) {
        StatusExplanationDialog(
            title = statusDialogInfo!!.first,
            explanation = statusDialogInfo!!.second,
            onDismiss = { showStatusDialog = false }
        )
    }

    if (showFilterDialog) {
        FilterDialog(
            initialGenre = selectedGenre,
            initialCountry = selectedCountry,
            onApply = { newGenre, newCountry ->
                selectedGenre = newGenre
                selectedCountry = newCountry
                showFilterDialog = false
                if (searchQuery.isNotBlank() && resultState !is SearchResultState.Idle) {
                    executeSearch(searchQuery, selectedContentType, newGenre, newCountry, force = true)
                }
            },
            onDismiss = { showFilterDialog = false }
        )
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = CinemaBackground
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp)
        ) {
            Spacer(modifier = Modifier.height(6.dp))

            // Brand Header: App Name + Tagline + Live Status Pill & Privacy Trigger
            HeaderSection(
                resultState = resultState,
                onStatusClick = { title, explanation ->
                    statusDialogInfo = Pair(title, explanation)
                    showStatusDialog = true
                },
                onPrivacyClick = { showPrivacyDialog = true }
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Expandable Multiline Search Input
            SearchInputBar(
                queryText = searchQuery,
                onQueryChange = { newText ->
                    searchQuery = newText
                    if (newText.isBlank() && resultState !is SearchResultState.Idle) {
                        searchJob?.cancel()
                        resultState = SearchResultState.Idle
                        lastSubmittedQuery = null
                        lastSubmittedContentType = null
                        lastSubmittedGenre = null
                        lastSubmittedCountry = null
                    }
                },
                onSearchSubmit = { query ->
                    executeSearch(query, selectedContentType, selectedGenre, selectedCountry)
                }
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Primary Content-Type Selector: All | Movies | Series & Secondary Filters Pill
            ContentTypeSelector(
                selectedContentType = selectedContentType,
                onContentTypeSelected = { newType ->
                    selectedContentType = newType
                    if (searchQuery.isNotBlank() && resultState !is SearchResultState.Idle) {
                        executeSearch(searchQuery, contentType = newType, force = true)
                    }
                },
                onOpenFilters = { showFilterDialog = true },
                onClearFilters = {
                    val hadActiveFilters = selectedGenre != "ANY" || selectedCountry != "ANY"
                    if (hadActiveFilters) {
                        selectedGenre = "ANY"
                        selectedCountry = "ANY"
                        if (searchQuery.isNotBlank() && resultState !is SearchResultState.Idle) {
                            executeSearch(searchQuery, selectedContentType, genre = "ANY", country = "ANY", force = true)
                        }
                    }
                },
                activeFiltersCount = (if (selectedGenre != "ANY") 1 else 0) + (if (selectedCountry != "ANY") 1 else 0)
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Suggestion Inspiration Chips
            SuggestionChipsSection(
                onChipClick = { chip ->
                    searchQuery = chip.promptText
                    executeSearch(
                        chip.promptText,
                        contentType = selectedContentType,
                        genre = selectedGenre,
                        country = selectedCountry,
                        force = true
                    )
                }
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Dynamic Content Area (Animated between Idle, Loading, Success, Empty, Error, Unsupported)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                AnimatedContent(
                    targetState = resultState,
                    transitionSpec = { fadeIn() togetherWith fadeOut() },
                    label = "search_results_transition"
                ) { state ->
                    when (state) {
                        is SearchResultState.Idle -> {
                            IdleWelcomeView(
                                onExampleSelect = { exampleText ->
                                    searchQuery = exampleText
                                    executeSearch(exampleText, selectedContentType, selectedGenre, selectedCountry, force = true)
                                }
                            )
                        }

                        is SearchResultState.Loading -> {
                            Column(
                                modifier = Modifier.fillMaxSize(),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                LoadingStateView(message = state.message)
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    text = "Tap to cancel",
                                    style = MaterialTheme.typography.labelMedium.copy(
                                        color = ChampagneGoldLight,
                                        fontWeight = FontWeight.SemiBold
                                    ),
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable {
                                            searchJob?.cancel()
                                            resultState = SearchResultState.Idle
                                        }
                                        .padding(horizontal = 12.dp, vertical = 6.dp)
                                    )
                            }
                        }

                        is SearchResultState.Unsupported -> {
                            EmptyStateView(
                                queryText = searchQuery,
                                suggestions = listOf("Try searching with Content Type 'All' or 'Series'"),
                                customMessage = state.message
                            )
                        }

                        is SearchResultState.Success -> {
                            SearchResultsList(
                                items = state.items,
                                category = state.category,
                                queryText = state.queryText,
                                searchMode = state.searchMode,
                                disclaimer = state.disclaimer,
                                fallbackUsed = state.fallbackUsed,
                                totalCount = state.totalCount,
                                hasMore = state.hasMore,
                                isLoadingMore = state.isLoadingMore,
                                onLoadMore = {
                                    if (!state.isLoadingMore && state.hasMore) {
                                        executeSearch(
                                            query = state.queryText,
                                            contentType = selectedContentType,
                                            genre = selectedGenre,
                                            country = selectedCountry,
                                            force = true,
                                            page = state.page + 1,
                                            isLoadMore = true
                                        )
                                    }
                                },
                                onCloseResults = {
                                    searchJob?.cancel()
                                    resultState = SearchResultState.Idle
                                    searchQuery = ""
                                    lastSubmittedQuery = null
                                    lastSubmittedContentType = null
                                    lastSubmittedGenre = null
                                    lastSubmittedCountry = null
                                },
                                onPrivacyClick = { showPrivacyDialog = true }
                            )
                        }

                        is SearchResultState.Empty -> {
                            Column(
                                modifier = Modifier.fillMaxSize()
                            ) {
                                ModeStatusBadgeRow(
                                    mode = state.searchMode,
                                    fallbackUsed = state.fallbackUsed,
                                    onPrivacyClick = { showPrivacyDialog = true }
                                )
                                if (!state.disclaimer.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(10.dp))
                                    Text(
                                        text = state.disclaimer,
                                        style = MaterialTheme.typography.bodySmall.copy(
                                            color = TextSecondary,
                                            fontSize = 12.sp
                                        ),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .background(CinemaSurfaceElevated, RoundedCornerShape(8.dp))
                                            .border(1.dp, CinemaBorder, RoundedCornerShape(8.dp))
                                            .padding(horizontal = 12.dp, vertical = 8.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.height(10.dp))
                                EmptyStateView(
                                    queryText = state.queryText,
                                    suggestions = state.suggestions,
                                    customMessage = state.disclaimer
                                )
                            }
                        }

                        is SearchResultState.Error -> {
                            ErrorStateView(
                                message = state.message,
                                onRetry = {
                                    if (searchQuery.isNotBlank()) {
                                        executeSearch(
                                            searchQuery,
                                            selectedContentType,
                                            selectedGenre,
                                            selectedCountry,
                                            force = true
                                        )
                                    } else {
                                        resultState = SearchResultState.Idle
                                    }
                                },
                                canRetry = state.canRetry
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HeaderSection(
    resultState: SearchResultState,
    onStatusClick: (title: String, explanation: String) -> Unit = { _, _ -> },
    onPrivacyClick: () -> Unit = {}
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(
                text = "S Finder",
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.ExtraBold,
                    color = TextPrimary,
                    fontSize = 24.sp,
                    letterSpacing = (-0.5).sp
                )
            )

            Spacer(modifier = Modifier.height(2.dp))

            Text(
                text = "Discover What To Watch",
                style = MaterialTheme.typography.bodySmall.copy(
                    color = TextSecondary,
                    fontSize = 12.sp
                )
            )
        }

        // Status & Privacy Actions
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            // Privacy Info Icon Button
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(CinemaSurface)
                    .border(1.dp, CinemaBorder, CircleShape)
                    .clickable(onClick = onPrivacyClick)
                    .padding(6.dp)
            ) {
                Icon(
                    imageVector = Icons.Outlined.Info,
                    contentDescription = "Privacy & AI Notice",
                    tint = TextSecondary,
                    modifier = Modifier.size(16.dp)
                )
            }

            // Status Indicator — Informational pill (taping displays status info dialog without changing search state)
            val (statusText, dotColor, statusExplanation) = when {
                resultState is SearchResultState.Success -> {
                    when {
                        resultState.searchMode == DiscoveryMode.AI_ENHANCED && !resultState.fallbackUsed ->
                            Triple(
                                "AI Enhanced",
                                ChampagneGold,
                                "This search was semantically analyzed by Google Gemini AI and grounded in verified live catalog records."
                            )
                        resultState.fallbackUsed || resultState.searchMode == DiscoveryMode.CATALOG_SEARCH ->
                            Triple(
                                "Catalog Search",
                                Color(0xFFF59E0B),
                                "Direct title match from connected catalogs (TVmaze for TV series, Wikidata for movies)."
                            )
                        else -> Triple(
                            "Catalog Ready",
                            Color(0xFF4ADE80),
                            "Discovery backend is active. Connected to TVmaze (series) and Wikidata (movies)."
                        )
                    }
                }
                resultState is SearchResultState.Empty -> {
                    Triple(
                        "Catalog Ready",
                        Color(0xFF4ADE80),
                        "Discovery backend is active. No matches were found for the last query in connected catalogs."
                    )
                }
                resultState is SearchResultState.Error -> {
                    Triple(
                        "Interrupted",
                        Color(0xFFEF4444),
                        "The last request could not be completed. Check your internet connection and tap 'Try Again'."
                    )
                }
                resultState is SearchResultState.Loading -> {
                    Triple(
                        "Searching...",
                        ChampagneGoldLight,
                        "Query is being analyzed by Gemini AI and verified against catalog records."
                    )
                }
                else -> Triple(
                    "Catalog Ready",
                    Color(0xFF4ADE80),
                    "S Finder is connected to Google Gemini AI and live entertainment catalogs. Ready for discovery."
                )
            }

            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(CinemaSurface)
                    .border(1.dp, CinemaBorder, CircleShape)
                    .clickable { onStatusClick(statusText, statusExplanation) }
                    .padding(horizontal = 10.dp, vertical = 5.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(dotColor)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = statusText,
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = TextSecondary,
                            fontSize = 11.sp
                        )
                    )
                }
            }
        }
    }
}

@Composable
private fun ModeStatusBadgeRow(
    mode: DiscoveryMode,
    fallbackUsed: Boolean,
    onPrivacyClick: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        DiscreetModeBadge(mode = mode, fallbackUsed = fallbackUsed)

        Text(
            text = "AI Notice",
            style = MaterialTheme.typography.labelSmall.copy(
                color = ChampagneGoldLight,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold
            ),
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .clickable(onClick = onPrivacyClick)
                .padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}

@Composable
private fun DiscreetModeBadge(
    mode: DiscoveryMode,
    fallbackUsed: Boolean
) {
    val isAi = mode == DiscoveryMode.AI_ENHANCED && !fallbackUsed
    Box(
        modifier = Modifier
            .background(
                if (isAi) ChampagneGoldMuted else CinemaSurfaceElevated,
                RoundedCornerShape(6.dp)
            )
            .border(
                1.dp,
                if (isAi) ChampagneGold.copy(alpha = 0.35f) else CinemaBorder,
                RoundedCornerShape(6.dp)
            )
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(5.dp)
                    .clip(CircleShape)
                    .background(if (isAi) ChampagneGold else Color(0xFFF59E0B))
            )
            Spacer(modifier = Modifier.width(5.dp))
            Text(
                text = if (isAi) "AI Enhanced" else "Catalog Search",
                style = MaterialTheme.typography.labelSmall.copy(
                    color = if (isAi) ChampagneGoldLight else TextSecondary,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 11.sp
                )
            )
        }
    }
}

@Composable
private fun SearchResultsList(
    items: List<EntertainmentItem>,
    category: MediaType,
    queryText: String,
    searchMode: DiscoveryMode = DiscoveryMode.AI_ENHANCED,
    disclaimer: String? = null,
    fallbackUsed: Boolean = false,
    isPreview: Boolean = false,
    totalCount: Int = items.size,
    hasMore: Boolean = false,
    isLoadingMore: Boolean = false,
    onLoadMore: () -> Unit = {},
    onCloseResults: () -> Unit = {},
    onPrivacyClick: () -> Unit = {}
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("results_lazy_column"),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (isPreview) {
                            "${items.size} Sample Preview Result${if (items.size != 1) "s" else ""}"
                        } else if (totalCount > items.size) {
                            "${items.size} of $totalCount Results for \"$queryText\""
                        } else {
                            "${items.size} Result${if (items.size != 1) "s" else ""} for \"$queryText\""
                        },
                        modifier = Modifier.testTag("results_header_text"),
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary,
                            fontSize = 14.sp
                        )
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    val filterLabel = when (category) {
                        MediaType.TV_SERIES -> "Series"
                        else -> category.displayName
                    }
                    Text(
                        text = "Filter: $filterLabel",
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = TextTertiary,
                            fontSize = 11.sp
                        )
                    )
                }

                // Return to welcome screen button
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(CinemaSurfaceElevated)
                        .border(1.dp, CinemaBorder, RoundedCornerShape(8.dp))
                        .clickable(onClick = onCloseResults)
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = "Close Results",
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = ChampagneGoldLight,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 11.sp
                        )
                    )
                }
            }
        }

        if (items.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No shows found in category ${category.displayName}",
                        style = MaterialTheme.typography.bodyMedium.copy(color = TextSecondary)
                    )
                }
            }
        } else {
            // First 6 items: Prominent Hero Cards (EntertainmentCard)
            val heroItems = items.take(6)
            items(
                items = heroItems,
                key = { it.id }
            ) { item ->
                EntertainmentCard(item = item)
            }

            // Items 7+: Compact Result Rows (CompactResultRow)
            if (items.size > 6) {
                val compactItems = items.drop(6)
                items(
                    items = compactItems,
                    key = { it.id }
                ) { item ->
                    CompactResultRow(item = item)
                }
            }

            // Load More button when additional pages exist in catalog
            if (hasMore) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .testTag("load_more_button")
                                .clip(RoundedCornerShape(10.dp))
                                .background(CinemaSurfaceElevated)
                                .border(1.dp, ChampagneGoldMuted, RoundedCornerShape(10.dp))
                                .clickable(enabled = !isLoadingMore, onClick = onLoadMore)
                                .padding(horizontal = 24.dp, vertical = 10.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                if (isLoadingMore) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        color = ChampagneGold,
                                        strokeWidth = 2.dp
                                    )
                                    Text(
                                        text = "Loading more...",
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            color = ChampagneGoldLight,
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 12.sp
                                        )
                                    )
                                } else {
                                    Text(
                                        text = "Load More Results",
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            color = ChampagneGoldLight,
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 12.sp
                                        )
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

/**
 * Compact result row for broad discovery lists (items 7+).
 * Midnight Cinema styling: CinemaSurfaceElevated, ChampagneGold highlights, clean typography.
 */
@Composable
fun CompactResultRow(
    item: EntertainmentItem,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(CinemaSurfaceElevated)
            .border(1.dp, CinemaBorder, RoundedCornerShape(10.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.titleSmall.copy(
                        color = TextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    ),
                    maxLines = 1,
                    modifier = Modifier.weight(1f)
                )

                // Type badge (Movie / Series)
                val typeLabel = when (item.mediaType) {
                    MediaType.MOVIES -> "Movie"
                    MediaType.TV_SERIES -> "Series"
                    else -> item.mediaType.displayName
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(CinemaSurface)
                        .border(0.5.dp, ChampagneGoldMuted, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = typeLabel,
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = ChampagneGoldLight,
                            fontWeight = FontWeight.Medium,
                            fontSize = 10.sp
                        )
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Year • Genres • Country
                val metadataParts = buildList {
                    item.releaseYear?.let { add(it.toString()) }
                    if (item.genres.isNotEmpty()) {
                        add(item.genres.take(2).joinToString(", "))
                    }
                    item.countryOfOrigin?.takeIf { it.isNotBlank() }?.let {
                        add(it.split("•").first().trim())
                    }
                }
                Text(
                    text = metadataParts.joinToString(" • ").ifEmpty { "Entertainment" },
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = TextSecondary,
                        fontSize = 11.sp
                    ),
                    maxLines = 1,
                    modifier = Modifier.weight(1f)
                )

                // Rating
                item.rating?.let { rating ->
                    Text(
                        text = "★ ${"%.1f".format(rating)}",
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = ChampagneGold,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    )
                }
            }
        }
    }
}

/**
 * Clean Midnight Cinema dialog explaining third-party AI processing and data privacy.
 */
@Composable
private fun PrivacyNoticeDialog(
    onDismiss: () -> Unit
) {
    val scrollState = rememberScrollState()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = CinemaSurface,
        titleContentColor = TextPrimary,
        textContentColor = TextSecondary,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "✦",
                    style = MaterialTheme.typography.titleMedium.copy(
                        color = ChampagneGold,
                        fontWeight = FontWeight.Bold
                    )
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "AI Discovery & Privacy",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary,
                        fontSize = 16.sp
                    )
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(scrollState),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "How S Finder searches entertainment:",
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = ChampagneGoldLight,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                )

                Text(
                    text = "• AI Processing: Natural language story descriptions are processed using Google Gemini models hosted via Google AI Studio.",
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = TextSecondary,
                        fontSize = 12.sp,
                        lineHeight = 16.sp
                    )
                )

                Text(
                    text = "• Catalog Verification: AI candidate suggestions are strictly verified against live catalogs (TVmaze for TV series and Wikidata for movies). Unverified suggestions are discarded.",
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = TextSecondary,
                        fontSize = 12.sp,
                        lineHeight = 16.sp
                    )
                )

                Text(
                    text = "• Privacy & Data Protection: S Finder does not collect user accounts, names, or personal identities. Under Google AI Studio free tier terms, query texts may be reviewed to improve product services. Never enter passwords, personal, financial, or sensitive information.",
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = TextSecondary,
                        fontSize = 12.sp,
                        lineHeight = 16.sp
                    )
                )

                Text(
                    text = "• Catalog Attribution: Show metadata and images are provided by TVmaze under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0).",
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = TextTertiary,
                        fontSize = 11.sp,
                        lineHeight = 15.sp
                    )
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(
                    containerColor = ChampagneGold,
                    contentColor = CinemaBackground
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text(
                    text = "Understood",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = CinemaBackground
                    )
                )
            }
        }
    )
}

/**
 * Clean informational dialog explaining the current connection or discovery status.
 * Non-destructive: dismisses without modifying any active search state.
 */
@Composable
private fun StatusExplanationDialog(
    title: String,
    explanation: String,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = CinemaSurface,
        titleContentColor = TextPrimary,
        textContentColor = TextSecondary,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(ChampagneGold)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary,
                        fontSize = 16.sp
                    )
                )
            }
        },
        text = {
            Text(
                text = explanation,
                style = MaterialTheme.typography.bodyMedium.copy(
                    color = TextSecondary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
            )
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(
                    containerColor = ChampagneGold,
                    contentColor = CinemaBackground
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text(
                    text = "Close",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = CinemaBackground
                    )
                )
            }
        }
    )
}
