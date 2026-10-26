package com.kunal.sfinder.domain.model

/**
 * Result of an entertainment discovery operation containing resolved items,
 * the active search mode, and user-facing attribution or fallback disclaimers.
 */
data class DiscoveryResult(
    val items: List<EntertainmentItem>,
    val mode: DiscoveryMode = DiscoveryMode.AI_ENHANCED,
    val disclaimer: String? = null,
    val fallbackUsed: Boolean = false,
    val error: String? = null,
    val totalCount: Int = items.size,
    val page: Int = 1,
    val limit: Int = 20,
    val hasMore: Boolean = false
)
