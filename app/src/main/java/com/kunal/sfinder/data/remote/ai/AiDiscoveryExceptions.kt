package com.kunal.sfinder.data.remote.ai

/**
 * Base exception for AI discovery client operations.
 */
sealed class AiDiscoveryException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Thrown when network connectivity to the discovery backend fails or times out.
 */
class AiDiscoveryNetworkException(
    message: String = "Unable to connect to discovery service. Please check your internet connection.",
    cause: Throwable? = null
) : AiDiscoveryException(message, cause)

/**
 * Thrown when the backend or AI provider indicates rate limiting (HTTP 429).
 */
class AiDiscoveryRateLimitException(
    message: String = "Discovery request limit reached. Please wait a moment before searching again."
) : AiDiscoveryException(message)

/**
 * Thrown when the backend returns an HTTP 4xx or 5xx error.
 */
class AiDiscoveryServerException(
    val statusCode: Int,
    message: String = "Discovery service error ($statusCode)"
) : AiDiscoveryException(message)
