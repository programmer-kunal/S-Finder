package com.kunal.sfinder.data.preview

import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.DiscoveryResult
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.SearchQuery
import com.kunal.sfinder.domain.repository.EntertainmentCatalogRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Isolated preview implementation of [EntertainmentCatalogRepository]
 * for local testing, layout verification, and offline demonstration.
 */
class PreviewCatalogRepository : EntertainmentCatalogRepository {

    override fun discoverEntertainment(query: SearchQuery): Flow<DiscoveryResult> = flow {
        val filtered = PreviewEntertainmentData.filterSampleItems(
            category = query.category,
            query = query.rawText
        )
        emit(
            DiscoveryResult(
                items = filtered,
                mode = DiscoveryMode.CATALOG_SEARCH,
                disclaimer = "Preview dataset (isolated sample records for UI testing).",
                fallbackUsed = false
            )
        )
    }

    override suspend fun getEntertainmentDetails(
        id: String,
        catalogSource: String?
    ): Result<EntertainmentItem> {
        val item = PreviewEntertainmentData.SAMPLE_ITEMS.firstOrNull { it.id == id }
        return if (item != null) {
            Result.success(item)
        } else {
            Result.failure(NoSuchElementException("Preview item with id $id not found"))
        }
    }
}
