package com.kunal.sfinder.domain.repository

import com.kunal.sfinder.domain.model.DiscoveryResult
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.SearchQuery
import kotlinx.coroutines.flow.Flow

/**
 * Provider-agnostic contract for entertainment discovery and catalog retrieval.
 * Implementations can wrap TVMaze, Cloudflare Workers AI discovery, or future licensed providers.
 */
interface EntertainmentCatalogRepository {

    /**
     * Executes an intelligent search based on a user's [SearchQuery].
     */
    fun discoverEntertainment(query: SearchQuery): Flow<DiscoveryResult>

    /**
     * Retrieves detailed information for a specific entertainment item.
     */
    suspend fun getEntertainmentDetails(id: String, catalogSource: String?): Result<EntertainmentItem>
}
