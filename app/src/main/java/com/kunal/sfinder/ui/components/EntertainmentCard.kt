package com.kunal.sfinder.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kunal.sfinder.domain.model.EntertainmentItem
import com.kunal.sfinder.ui.theme.ChampagneGold
import com.kunal.sfinder.ui.theme.ChampagneGoldLight
import com.kunal.sfinder.ui.theme.ChampagneGoldMuted
import com.kunal.sfinder.ui.theme.CinemaBorder
import com.kunal.sfinder.ui.theme.CinemaSurface
import com.kunal.sfinder.ui.theme.CinemaSurfaceElevated
import com.kunal.sfinder.ui.theme.MatchBadgeBg
import com.kunal.sfinder.ui.theme.MatchHighlightText
import com.kunal.sfinder.ui.theme.TextPrimary
import com.kunal.sfinder.ui.theme.TextSecondary
import com.kunal.sfinder.ui.theme.TextTertiary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * In-memory bitmap cache for genuine poster thumbnails.
 */
object ImageBitmapCache {
    private val cache = android.util.LruCache<String, ImageBitmap>(100)
    fun get(url: String): ImageBitmap? = cache.get(url)
    fun put(url: String, bitmap: ImageBitmap) {
        cache.put(url, bitmap)
    }
}

/**
 * Premium entertainment card displaying verified title metadata,
 * genre pills, rating, synopsis, and the AI match explanation.
 * Styled in the Midnight Cinema palette.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EntertainmentCard(
    item: EntertainmentItem,
    modifier: Modifier = Modifier,
    onClick: () -> Unit = {}
) {
    Card(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, CinemaBorder, RoundedCornerShape(16.dp)),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CinemaSurface)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Top Row: Poster placeholder / monogram + Title + Metadata
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                // Poster Image Container (genuine poster or graceful fallback monogram)
                AsyncPosterImage(
                    url = item.posterUrl,
                    title = item.title,
                    mediaType = item.mediaType.displayName,
                    modifier = Modifier
                        .size(width = 80.dp, height = 112.dp)
                        .clip(RoundedCornerShape(10.dp))
                )

                Spacer(modifier = Modifier.width(14.dp))

                // Title & Key Badges
                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    // Category & Year Badges Row
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        CategoryBadge(text = item.mediaType.displayName)

                        item.releaseYear?.let { year ->
                            YearBadge(year = year.toString())
                        }

                        Spacer(modifier = Modifier.weight(1f))

                        // Rating badge if available
                        item.rating?.let { ratingValue ->
                            RatingBadge(rating = ratingValue)
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // Title in warm ivory
                    Text(
                        text = item.title,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            color = TextPrimary
                        ),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Original title (e.g. Hangul, Japanese, Turkish) if distinct
                    if (!item.originalTitle.isNullOrBlank() && item.originalTitle != item.title) {
                        Text(
                            text = item.originalTitle,
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = TextTertiary,
                                fontSize = 12.sp
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // Country or Language tag if present
                    if (!item.countryOfOrigin.isNullOrBlank() || !item.originalLanguage.isNullOrBlank()) {
                        val originInfo = listOfNotNull(item.countryOfOrigin, item.originalLanguage).joinToString(" • ")
                        Text(
                            text = originInfo,
                            style = MaterialTheme.typography.labelSmall.copy(
                                color = TextSecondary,
                                fontSize = 11.sp
                            )
                        )
                    }
                }
            }

            // Genre Chips
            if (item.genres.isNotEmpty()) {
                Spacer(modifier = Modifier.height(10.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    item.genres.take(4).forEach { genre ->
                        GenrePill(genre = genre)
                    }
                }
            }

            // Match Explanation Container (Crucial AI differentiator)
            if (!item.matchExplanation.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(12.dp))
                MatchExplanationBox(explanation = item.matchExplanation)
            }

            // Synopsis
            if (item.synopsis.isNotBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = item.synopsis,
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = TextSecondary,
                        lineHeight = 18.sp
                    ),
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Catalog Attribution
            if (!item.catalogSource.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "Catalog: ${item.catalogSource}",
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = TextTertiary,
                        fontSize = 10.sp
                    )
                )
            }
        }
    }
}

@Composable
fun AsyncPosterImage(
    url: String?,
    title: String,
    mediaType: String,
    modifier: Modifier = Modifier
) {
    if (url.isNullOrBlank()) {
        PosterPlaceholder(title = title, mediaType = mediaType, modifier = modifier)
        return
    }

    var bitmap by remember(url) { mutableStateOf(ImageBitmapCache.get(url)) }

    LaunchedEffect(url) {
        if (bitmap == null) {
            withContext(Dispatchers.IO) {
                try {
                    val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                    connection.connectTimeout = 8000
                    connection.readTimeout = 8000
                    connection.instanceFollowRedirects = true
                    connection.setRequestProperty("User-Agent", "SFinder-Android/1.0")
                    connection.doInput = true
                    connection.connect()

                    if (connection.responseCode in 200..299) {
                        connection.inputStream.use { stream ->
                            val decoded = android.graphics.BitmapFactory.decodeStream(stream)
                            if (decoded != null) {
                                val imageBitmap = decoded.asImageBitmap()
                                ImageBitmapCache.put(url, imageBitmap)
                                withContext(Dispatchers.Main) {
                                    bitmap = imageBitmap
                                }
                            }
                        }
                    }
                } catch (_: Exception) {
                    // Fall back to monogram placeholder
                }
            }
        }
    }

    val currentBitmap = bitmap
    if (currentBitmap != null) {
        Image(
            bitmap = currentBitmap,
            contentDescription = "$title poster",
            contentScale = ContentScale.Crop,
            modifier = modifier
                .background(CinemaSurfaceElevated)
                .border(1.dp, CinemaBorder, RoundedCornerShape(10.dp))
        )
    } else {
        PosterPlaceholder(title = title, mediaType = mediaType, modifier = modifier)
    }
}

@Composable
private fun PosterPlaceholder(
    title: String,
    mediaType: String,
    modifier: Modifier = Modifier
) {
    val initial = title.firstOrNull()?.uppercaseChar() ?: 'S'
    Box(
        modifier = modifier
            .background(CinemaSurfaceElevated)
            .border(1.dp, CinemaBorder, RoundedCornerShape(10.dp)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = initial.toString(),
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.Bold,
                    color = ChampagneGold
                )
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = mediaType.take(6),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 9.sp,
                    color = TextTertiary
                )
            )
        }
    }
}

@Composable
private fun CategoryBadge(text: String) {
    Box(
        modifier = Modifier
            .background(ChampagneGoldMuted, RoundedCornerShape(6.dp))
            .border(1.dp, ChampagneGold.copy(alpha = 0.3f), RoundedCornerShape(6.dp))
            .padding(horizontal = 7.dp, vertical = 2.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall.copy(
                color = ChampagneGoldLight,
                fontWeight = FontWeight.SemiBold,
                fontSize = 10.sp
            )
        )
    }
}

@Composable
private fun YearBadge(year: String) {
    Box(
        modifier = Modifier
            .background(CinemaSurfaceElevated, RoundedCornerShape(6.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = year,
            style = MaterialTheme.typography.labelSmall.copy(
                color = TextSecondary,
                fontSize = 10.sp
            )
        )
    }
}

@Composable
private fun RatingBadge(rating: Double) {
    Row(
        modifier = Modifier
            .background(ChampagneGoldMuted, RoundedCornerShape(6.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.Star,
            contentDescription = "Rating",
            tint = ChampagneGold,
            modifier = Modifier.size(12.dp)
        )
        Spacer(modifier = Modifier.width(3.dp))
        Text(
            text = String.format("%.1f", rating),
            style = MaterialTheme.typography.labelSmall.copy(
                color = ChampagneGoldLight,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp
            )
        )
    }
}

@Composable
private fun GenrePill(genre: String) {
    Box(
        modifier = Modifier
            .background(CinemaSurfaceElevated, RoundedCornerShape(50))
            .border(1.dp, CinemaBorder.copy(alpha = 0.7f), RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Text(
            text = genre,
            style = MaterialTheme.typography.labelSmall.copy(
                color = TextSecondary,
                fontSize = 10.sp
            )
        )
    }
}

@Composable
private fun MatchExplanationBox(explanation: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(MatchBadgeBg, RoundedCornerShape(10.dp))
            .border(1.dp, ChampagneGold.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
            .padding(10.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                text = "✦",
                style = MaterialTheme.typography.bodySmall.copy(
                    color = MatchHighlightText,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                ),
                modifier = Modifier.padding(top = 1.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Column {
                Text(
                    text = "Why this matches your description:",
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = MatchHighlightText,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 10.sp
                    )
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = explanation,
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = TextPrimary,
                        fontSize = 12.sp,
                        lineHeight = 16.sp
                    )
                )
            }
        }
    }
}
