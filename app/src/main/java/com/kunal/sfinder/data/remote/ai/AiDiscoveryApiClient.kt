package com.kunal.sfinder.data.remote.ai

import com.kunal.sfinder.domain.model.ContentType
import com.kunal.sfinder.domain.model.DiscoveryMode
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.domain.model.MediaType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Client for interacting with the S Finder Cloudflare Workers backend.
 * Provides Gemini-assisted semantic context discovery and live catalog grounding.
 * Uses standard Android HTTP connections with zero third-party dependencies.
 */
class AiDiscoveryApiClient(
    private val baseUrl: String = DEFAULT_BASE_URL
) {
    companion object {
        const val DEFAULT_BASE_URL = "https://sfinder-backend.kunalbhai137.workers.dev"
        private const val CONNECT_TIMEOUT_MS = 10_000
        private const val READ_TIMEOUT_MS = 30_000
        private const val CLIENT_HEADER_VALUE = "Android-1.0"
        private const val USER_AGENT_VALUE = "SFinder-Android/1.0"
    }

    /**
     * Sends a natural language story description or title query to the discovery backend.
     */
    suspend fun discover(
        query: String,
        category: MediaType = MediaType.ALL,
        contentType: ContentType = ContentType.ALL,
        genre: String = "ANY",
        country: String = "ANY",
        page: Int = 1,
        limit: Int = 20
    ): AiDiscoveryResponse = withContext(Dispatchers.IO) {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            return@withContext AiDiscoveryResponse(
                mode = DiscoveryMode.EMPTY,
                query = "",
                resolvedCount = 0,
                items = emptyList(),
                disclaimer = null,
                fallbackUsed = false,
                totalCount = 0,
                page = page,
                limit = limit,
                hasMore = false
            )
        }

        val endpoint = "$baseUrl/api/v1/discover"
        val requestJson = JSONObject().apply {
            put("query", trimmed)
            put("category", category.name)
            put("contentType", contentType.name)
            if (genre.isNotBlank() && genre != "ANY") {
                put("genre", genre.trim())
            }
            if (country.isNotBlank() && country != "ANY") {
                put("country", country.trim())
            }
            put("page", page)
            put("limit", limit)
            put("clientVersion", "1.0.0")
        }.toString()

        val responseBody = executePost(endpoint, requestJson)
        parseDiscoveryResponse(responseBody)
    }

    /**
     * Retrieves the third-party AI processing and data privacy notice.
     */
    suspend fun fetchPrivacyNotice(): PrivacyNotice = withContext(Dispatchers.IO) {
        val endpoint = "$baseUrl/privacy"
        val responseBody = executeGet(endpoint)
        parsePrivacyNotice(responseBody)
    }

    private fun executePost(urlString: String, jsonBody: String): String {
        val url = URL(urlString)
        val connection = url.openConnection() as HttpURLConnection

        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.doOutput = true
            connection.doInput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("X-SFinder-Client", CLIENT_HEADER_VALUE)
            connection.setRequestProperty("User-Agent", USER_AGENT_VALUE)

            OutputStreamWriter(connection.outputStream, "UTF-8").use { writer ->
                writer.write(jsonBody)
                writer.flush()
            }

            val statusCode = connection.responseCode
            return readResponse(connection, statusCode)
        } catch (e: AiDiscoveryException) {
            throw e
        } catch (e: Exception) {
            throw AiDiscoveryNetworkException(cause = e)
        } finally {
            connection.disconnect()
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
            connection.setRequestProperty("X-SFinder-Client", CLIENT_HEADER_VALUE)
            connection.setRequestProperty("User-Agent", USER_AGENT_VALUE)

            val statusCode = connection.responseCode
            return readResponse(connection, statusCode)
        } catch (e: AiDiscoveryException) {
            throw e
        } catch (e: Exception) {
            throw AiDiscoveryNetworkException(cause = e)
        } finally {
            connection.disconnect()
        }
    }

    private fun readResponse(connection: HttpURLConnection, statusCode: Int): String {
        val isSuccess = statusCode in 200..299
        val inputStream = if (isSuccess) connection.inputStream else connection.errorStream
            ?: connection.inputStream

        val content = inputStream?.let { stream ->
            BufferedReader(InputStreamReader(stream, "UTF-8")).use { reader ->
                val sb = StringBuilder()
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    sb.append(line)
                }
                sb.toString()
            }
        } ?: ""

        when {
            statusCode in 200..299 -> return content
            statusCode == 429 -> throw AiDiscoveryRateLimitException()
            else -> {
                val errorDetail = try {
                    JSONObject(content).optString("error", "HTTP $statusCode")
                } catch (_: Exception) {
                    "HTTP $statusCode"
                }
                throw AiDiscoveryServerException(statusCode, errorDetail)
            }
        }
    }

    fun parseDiscoveryResponse(jsonString: String): AiDiscoveryResponse {
        val root = JSONObject(jsonString)
        val modeStr = root.optString("mode", "CATALOG_SEARCH")
        val mode = DiscoveryMode.fromString(modeStr)
        val query = root.optString("query", "")
        val resolvedCount = root.optInt("resolvedCount", 0)
        val totalCount = root.optInt("totalCount", resolvedCount)
        val page = root.optInt("page", 1)
        val limit = root.optInt("limit", 20)
        val hasMore = root.optBoolean("hasMore", false)
        val disclaimer = root.optString("disclaimer").takeIf { it.isNotBlank() && it != "null" }
        val fallbackUsed = root.optBoolean("fallbackUsed", false)
        val error = root.optString("error").takeIf { it.isNotBlank() && it != "null" }

        val items = mutableListOf<EntertainmentItem>()
        val itemsArray = root.optJSONArray("items")
        if (itemsArray != null) {
            for (i in 0 until itemsArray.length()) {
                val itemObj = itemsArray.getJSONObject(i)
                items.add(mapJsonToEntertainmentItem(itemObj))
            }
        }

        return AiDiscoveryResponse(
            mode = mode,
            query = query,
            resolvedCount = resolvedCount,
            items = items,
            disclaimer = disclaimer,
            fallbackUsed = fallbackUsed,
            totalCount = totalCount,
            page = page,
            limit = limit,
            hasMore = hasMore,
            error = error
        )
    }

    private fun mapJsonToEntertainmentItem(itemObj: JSONObject): EntertainmentItem {
        val id = itemObj.optString("id")
        val title = itemObj.optString("title", "Untitled")
        val originalTitle = itemObj.optString("originalTitle").takeIf { it.isNotBlank() && it != "null" }
        val releaseYear = itemObj.optInt("releaseYear").takeIf { it > 0 }

        val mediaTypeStr = itemObj.optString("mediaType", "MOVIES")
        val mediaType = try {
            MediaType.valueOf(mediaTypeStr)
        } catch (_: Exception) {
            MediaType.fromDisplayName(mediaTypeStr)
        }

        val genresList = mutableListOf<String>()
        val genresArray = itemObj.optJSONArray("genres")
        if (genresArray != null) {
            for (j in 0 until genresArray.length()) {
                genresList.add(genresArray.getString(j))
            }
        }

        val originalLanguage = itemObj.optString("originalLanguage").takeIf { it.isNotBlank() && it != "null" }
        val countryOfOrigin = itemObj.optString("countryOfOrigin").takeIf { it.isNotBlank() && it != "null" }

        val countriesList = mutableListOf<String>()
        val countriesArray = itemObj.optJSONArray("countriesOfOrigin")
        if (countriesArray != null) {
            for (j in 0 until countriesArray.length()) {
                countriesList.add(countriesArray.getString(j))
            }
        }

        val rating = itemObj.optDouble("rating").takeIf { !it.isNaN() && it > 0.0 }
        val voteCount = itemObj.optInt("voteCount").takeIf { it > 0 }
        val synopsis = itemObj.optString("synopsis", "")
        val posterUrl = itemObj.optString("posterUrl").takeIf { it.isNotBlank() && it != "null" }
        val backdropUrl = itemObj.optString("backdropUrl").takeIf { it.isNotBlank() && it != "null" }
        val matchExplanation = itemObj.optString("matchExplanation").takeIf { it.isNotBlank() && it != "null" }
        val catalogSource = itemObj.optString("catalogSource").takeIf { it.isNotBlank() && it != "null" }

        return EntertainmentItem(
            id = id,
            title = title,
            originalTitle = originalTitle,
            releaseYear = releaseYear,
            mediaType = mediaType,
            genres = genresList,
            originalLanguage = originalLanguage,
            countryOfOrigin = countryOfOrigin,
            countriesOfOrigin = countriesList.ifEmpty { listOfNotNull(countryOfOrigin) },
            rating = rating,
            voteCount = voteCount,
            synopsis = synopsis,
            posterUrl = posterUrl,
            backdropUrl = backdropUrl,
            matchExplanation = matchExplanation,
            catalogSource = catalogSource
        )
    }

    fun parsePrivacyNotice(jsonString: String): PrivacyNotice {
        val root = JSONObject(jsonString)
        return PrivacyNotice(
            service = root.optString("service", "S Finder Discovery Service"),
            aiProvider = root.optString("aiProvider", "Google Gemini API"),
            dataProcessingNotice = root.optString("dataProcessingNotice", ""),
            catalogSource = root.optString("catalogSource", "TVmaze REST API"),
            catalogAttribution = root.optString("catalogAttribution", "Data provided by TVmaze (CC BY-SA 4.0)")
        )
    }
}
