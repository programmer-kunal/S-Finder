package com.kunal.sfinder.data.repository

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
 * TVmaze-backed implementation of [EntertainmentCatalogRepository].
 * Provides live catalog search for TV series, web series, Korean dramas, and Turkish dramas.
 *
 * Attribution: TVmaze data is licensed under CC BY-SA 4.0.
 */
class TvMazeCatalogRepository(
    private val apiClient: TvMazeApiClient = TvMazeApiClient()
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

        val allResults = apiClient.searchShows(query.rawText)

        // Filter by user's chosen category tab if not 'ALL'
        val filteredResults = if (query.category == MediaType.ALL) {
            allResults
        } else {
            allResults.filter { it.mediaType == query.category }
        }

        emit(
            DiscoveryResult(
                items = filteredResults,
                mode = if (filteredResults.isNotEmpty()) DiscoveryMode.CATALOG_SEARCH else DiscoveryMode.EMPTY,
                disclaimer = "Data provided by TVmaze (CC BY-SA 4.0)",
                fallbackUsed = true
            )
        )
    }

    override suspend fun getEntertainmentDetails(
        id: String,
        catalogSource: String?
    ): Result<EntertainmentItem> {
        val numericId = id.removePrefix("tvmaze-")
        val item = apiClient.getShowById(numericId)
        return if (item != null) {
            Result.success(item)
        } else {
            Result.failure(NoSuchElementException("TVmaze show with id $id not found"))
        }
    }
}
