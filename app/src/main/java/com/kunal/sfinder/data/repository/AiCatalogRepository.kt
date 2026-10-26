package com.kunal.sfinder.data.repository

import com.kunal.sfinder.data.remote.ai.AiDiscoveryApiClient
import com.kunal.sfinder.data.remote.ai.PrivacyNotice
import com.kunal.sfinder.data.remote.tvmaze.TvMazeApiClient
import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.DiscoveryResult
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.MediaType
import com.kunal.sfinder.domain.model.SearchQuery
import com.kunal.sfinder.domain.repository.EntertainmentCatalogRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Hybrid entertainment repository combining Gemini-powered story discovery
 * via the Cloudflare Workers backend with direct TVmaze catalog fallback.
 */
class AiCatalogRepository(
    private val aiClient: AiDiscoveryApiClient = AiDiscoveryApiClient(),
    private val tvMazeClient: TvMazeApiClient = TvMazeApiClient()
) : EntertainmentCatalogRepository {

    override fun discoverEntertainment(query: SearchQuery): Flow<DiscoveryResult> = flow {
        if (query.isBlank) {
            emit(
                DiscoveryResult(
                    items = emptyList(),
                    mode = DiscoveryMode.EMPTY,
                    disclaimer = null,
                    fallbackUsed = false
                )
            )
            return@flow
        }

        try {
            // Primary pipeline: Gemini-assisted semantic discovery grounded in TVmaze & D1 catalog
            val response = aiClient.discover(
                query = query.rawText,
                category = query.category,
                contentType = query.contentType,
                genre = query.genre,
                country = query.country,
                page = query.page,
                limit = query.limit
            )

            when (response.mode) {
                DiscoveryMode.AI_ENHANCED -> {
                    emit(
                        DiscoveryResult(
                            items = response.items,
                            mode = DiscoveryMode.AI_ENHANCED,
                            disclaimer = response.disclaimer ?: "Context-matched using Gemini and verified with TVmaze.",
                            fallbackUsed = false,
                            totalCount = response.totalCount,
                            page = response.page,
                            limit = response.limit,
                            hasMore = response.hasMore
                        )
                    )
                }

                DiscoveryMode.CATALOG_SEARCH -> {
                    emit(
                        DiscoveryResult(
                            items = response.items,
                            mode = DiscoveryMode.CATALOG_SEARCH,
                            disclaimer = response.disclaimer ?: "Direct catalog search (AI semantic search was not applied).",
                            fallbackUsed = true,
                            totalCount = response.totalCount,
                            page = response.page,
                            limit = response.limit,
                            hasMore = response.hasMore
                        )
                    )
                }

                DiscoveryMode.EMPTY -> {
                    emit(
                        DiscoveryResult(
                            items = emptyList(),
                            mode = DiscoveryMode.EMPTY,
                            disclaimer = response.disclaimer,
                            fallbackUsed = response.fallbackUsed,
                            totalCount = 0,
                            page = response.page,
                            limit = response.limit,
                            hasMore = false
                        )
                    )
                }

                DiscoveryMode.ERROR -> {
                    // Backend returned an error payload; attempt local direct TVmaze keyword fallback
                    emit(fallbackToTvMaze(query, "Catalog Search (AI service temporarily unavailable). Data provided by TVmaze (CC BY-SA 4.0)"))
                }
            }
        } catch (e: Exception) {
            // Worker unreachable, timeout, or network exception:
            // Attempt emergency local TVmaze keyword search fallback
            try {
                emit(fallbackToTvMaze(query, "Catalog Search fallback (Remote AI service unreachable). Data provided by TVmaze (CC BY-SA 4.0)"))
            } catch (_: Exception) {
                // If TVmaze also fails (e.g. completely offline), propagate original exception
                throw e
            }
        }
    }

    private suspend fun fallbackToTvMaze(query: SearchQuery, disclaimer: String): DiscoveryResult {
        val allShows = tvMazeClient.searchShows(query.rawText)
        val filtered = if (query.category == MediaType.ALL) {
            allShows
        } else {
            allShows.filter { it.mediaType == query.category }
        }

        return DiscoveryResult(
            items = filtered,
            mode = if (filtered.isNotEmpty()) DiscoveryMode.CATALOG_SEARCH else DiscoveryMode.EMPTY,
            disclaimer = disclaimer,
            fallbackUsed = true
        )
    }

    override suspend fun getEntertainmentDetails(
        id: String,
        catalogSource: String?
    ): Result<EntertainmentItem> {
        val numericId = id.removePrefix("tvmaze-")
        val item = tvMazeClient.getShowById(numericId)
        return if (item != null) {
            Result.success(item)
        } else {
            Result.failure(NoSuchElementException("Show with id $id not found in TVmaze catalog"))
        }
    }

    suspend fun getPrivacyNotice(): PrivacyNotice {
        return aiClient.fetchPrivacyNotice()
    }
}
