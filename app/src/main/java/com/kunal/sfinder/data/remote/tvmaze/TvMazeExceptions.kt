package com.kunal.sfinder.data.remote.tvmaze

sealed class TvMazeException(message: String, cause: Throwable? = null) : Exception(message, cause)

class TvMazeRateLimitException(
    message: String = "TVmaze request limit reached (20 requests per 10s). Please wait a few seconds and try again."
) : TvMazeException(message)

class TvMazeNetworkException(
    message: String = "Network error. Please check your internet connection and try again.",
    cause: Throwable? = null
) : TvMazeException(message, cause)

class TvMazeServerException(
    val statusCode: Int,
    message: String = "TVmaze service returned HTTP $statusCode."
) : TvMazeException(message)
