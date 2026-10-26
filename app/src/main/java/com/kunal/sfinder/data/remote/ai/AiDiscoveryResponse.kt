package com.kunal.sfinder.data.remote.ai

import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.EntertainmentItem

/**
 * Parsed payload returned by POST /api/v1/discover.
 */
data class AiDiscoveryResponse(
    val mode: DiscoveryMode,
    val query: String,
    val resolvedCount: Int,
    val items: List<EntertainmentItem>,
    val disclaimer: String?,
    val fallbackUsed: Boolean,
    val totalCount: Int = items.size,
    val page: Int = 1,
    val limit: Int = 20,
    val hasMore: Boolean = false,
    val error: String? = null
)

/**
 * Parsed payload returned by GET /privacy.
 */
data class PrivacyNotice(
    val service: String,
    val aiProvider: String,
    val dataProcessingNotice: String,
    val catalogSource: String,
    val catalogAttribution: String
)
