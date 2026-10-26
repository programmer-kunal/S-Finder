package com.kunal.sfinder.data.remote.tvmaze

import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.MediaType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Client for interacting with the public TVmaze REST API.
 * Uses standard Android HTTP connections with zero third-party dependencies.
 *
 * Attribution: TVmaze data is licensed under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0).
 */
class TvMazeApiClient {

    companion object {
        private const val BASE_URL = "https://api.tvmaze.com"
        private const val CONNECT_TIMEOUT_MS = 10_000
        private const val READ_TIMEOUT_MS = 10_000
        private const val ATTRIBUTION_LABEL = "TVmaze (CC BY-SA 4.0)"
    }

    /**
     * Searches TV shows by keyword using TVmaze's `/search/shows?q={query}` endpoint.
     */
    suspend fun searchShows(query: String): List<EntertainmentItem> = withContext(Dispatchers.IO) {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return@withContext emptyList()

        val encodedQuery = URLEncoder.encode(trimmed, "UTF-8")
        val endpointUrl = "$BASE_URL/search/shows?q=$encodedQuery"

        val responseJson = executeGet(endpointUrl)
        parseSearchResults(responseJson)
    }

    /**
     * Looks up single show details by TVmaze ID using `/shows/{id}`.
     */
    suspend fun getShowById(id: String): EntertainmentItem? = withContext(Dispatchers.IO) {
        val endpointUrl = "$BASE_URL/shows/$id"
        return@withContext try {
            val responseJson = executeGet(endpointUrl)
            val showObj = JSONObject(responseJson)
            mapShowObjectToItem(showObj)
        } catch (e: Exception) {
            null
        }
    }

    private fun executeGet(urlString: String): String {
        val url = URL(urlString)
        val connection = url.openConnection() as HttpURLConnection

        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "SFinder-Android/1.0")

            val statusCode = connection.responseCode

            when (statusCode) {
                HttpURLConnection.HTTP_OK -> {
                    val reader = BufferedReader(InputStreamReader(connection.inputStream))
                    val response = StringBuilder()
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        response.append(line)
                    }
                    reader.close()
                    return response.toString()
                }

                429 -> {
                    throw TvMazeRateLimitException()
                }

                else -> {
                    throw TvMazeServerException(statusCode)
                }
            }
        } catch (e: TvMazeException) {
            throw e
        } catch (e: Exception) {
            throw TvMazeNetworkException(cause = e)
        } finally {
            connection.disconnect()
        }
    }

    private fun parseSearchResults(jsonString: String): List<EntertainmentItem> {
        val results = mutableListOf<EntertainmentItem>()
        val jsonArray = JSONArray(jsonString)

        for (i in 0 until jsonArray.length()) {
            val itemObj = jsonArray.getJSONObject(i)
            val showObj = itemObj.optJSONObject("show") ?: continue
            val entertainmentItem = mapShowObjectToItem(showObj)
            results.add(entertainmentItem)
        }

        return results
    }

    private fun mapShowObjectToItem(showObj: JSONObject): EntertainmentItem {
        val id = showObj.optInt("id").toString()
        val name = showObj.optString("name", "Untitled Show")
        val premiered = showObj.optString("premiered", "")
        val releaseYear = parseYear(premiered)

        // Genres
        val genresList = mutableListOf<String>()
        val genresArray = showObj.optJSONArray("genres")
        if (genresArray != null) {
            for (j in 0 until genresArray.length()) {
                genresList.add(genresArray.getString(j))
            }
        }

        // Language & Country
        val language = showObj.optString("language").takeIf { it.isNotBlank() }
        val networkObj = showObj.optJSONObject("network")
        val countryObj = networkObj?.optJSONObject("country")
        val countryName = countryObj?.optString("name")?.takeIf { it.isNotBlank() }
        val countryCode = countryObj?.optString("code")?.takeIf { it.isNotBlank() }

        // Rating
        val ratingObj = showObj.optJSONObject("rating")
        val ratingValue = ratingObj?.optDouble("average")?.takeIf { !it.isNaN() && it > 0.0 }

        // Poster Image URLs
        val imageObj = showObj.optJSONObject("image")
        val posterUrl = imageObj?.optString("medium")?.takeIf { it.isNotBlank() }
            ?: imageObj?.optString("original")?.takeIf { it.isNotBlank() }

        // Clean HTML summary
        val rawSummary = showObj.optString("summary", "")
        val cleanSummary = stripHtml(rawSummary)

        // WebChannel
        val webChannelObj = showObj.optJSONObject("webChannel")

        // Intelligent category classification based on broadcast metadata
        val type = showObj.optString("type", "")
        val mediaType = classifyMediaType(
            language = language,
            countryCode = countryCode,
            genres = genresList,
            type = type,
            hasWebChannel = webChannelObj != null
        )

        return EntertainmentItem(
            id = "tvmaze-$id",
            title = name,
            originalTitle = null,
            releaseYear = releaseYear,
            mediaType = mediaType,
            genres = genresList,
            originalLanguage = language,
            countryOfOrigin = countryName ?: countryCode,
            rating = ratingValue,
            voteCount = null,
            synopsis = cleanSummary,
            posterUrl = posterUrl,
            backdropUrl = null,
            matchExplanation = "Catalog search match from TVmaze based on title and broadcast metadata.",
            catalogSource = ATTRIBUTION_LABEL
        )
    }

    private fun classifyMediaType(
        language: String?,
        countryCode: String?,
        genres: List<String>,
        type: String,
        hasWebChannel: Boolean
    ): MediaType {
        val isKorean = language?.equals("Korean", ignoreCase = true) == true ||
            countryCode?.equals("KR", ignoreCase = true) == true
        val isTurkish = language?.equals("Turkish", ignoreCase = true) == true ||
            countryCode?.equals("TR", ignoreCase = true) == true
        val isAnime = genres.any { it.equals("Anime", ignoreCase = true) } ||
            (language?.equals("Japanese", ignoreCase = true) == true && type.equals("Animation", ignoreCase = true))

        return when {
            isKorean -> MediaType.KDRAMA
            isTurkish -> MediaType.TURKISH_DRAMA
            isAnime -> MediaType.ANIME
            hasWebChannel -> MediaType.WEB_SERIES
            else -> MediaType.TV_SERIES
        }
    }

    private fun parseYear(premieredDate: String): Int? {
        if (premieredDate.length >= 4) {
            return premieredDate.substring(0, 4).toIntOrNull()
        }
        return null
    }

    private fun stripHtml(html: String): String {
        return html
            .replace(Regex("<.*?>"), "")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .trim()
    }
}
