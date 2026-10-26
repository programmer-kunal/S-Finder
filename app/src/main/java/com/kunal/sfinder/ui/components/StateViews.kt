package com.kunal.sfinder.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kunal.sfinder.ui.theme.ChampagneGold
import com.kunal.sfinder.ui.theme.ChampagneGoldLight
import com.kunal.sfinder.ui.theme.ChampagneGoldMuted
import com.kunal.sfinder.ui.theme.CinemaBackground
import com.kunal.sfinder.ui.theme.CinemaBorder
import com.kunal.sfinder.ui.theme.CinemaSurface
import com.kunal.sfinder.ui.theme.CinemaSurfaceElevated
import com.kunal.sfinder.ui.theme.TextPrimary
import com.kunal.sfinder.ui.theme.TextSecondary
import com.kunal.sfinder.ui.theme.TextTertiary

/**
 * Loading state with progress indicator and context message.
 * Styled in Midnight Cinema gold.
 */
@Composable
fun LoadingStateView(
    message: String = "Analyzing your story description...",
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 40.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator(
                color = ChampagneGold,
                modifier = Modifier.size(42.dp),
                strokeWidth = 3.dp
            )
            Spacer(modifier = Modifier.height(18.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium.copy(
                    color = TextPrimary,
                    fontWeight = FontWeight.Medium,
                    fontSize = 14.sp
                ),
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Extracting themes, mood, relationships & matching catalog",
                style = MaterialTheme.typography.labelSmall.copy(
                    color = TextTertiary,
                    fontSize = 12.sp
                ),
                textAlign = TextAlign.Center
            )
        }
    }
}

/**
 * Empty state when a query returns no matching titles.
 */
@Composable
fun EmptyStateView(
    queryText: String,
    suggestions: List<String>,
    modifier: Modifier = Modifier,
    customMessage: String? = null
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(CinemaSurface, RoundedCornerShape(18.dp))
            .border(1.dp, CinemaBorder, RoundedCornerShape(18.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(ChampagneGoldMuted),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                tint = ChampagneGold,
                modifier = Modifier.size(24.dp)
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        Text(
            text = "No matches found yet",
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Bold,
                color = TextPrimary,
                fontSize = 16.sp
            )
        )

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = customMessage ?: "We couldn't identify verified entertainment matching: \"$queryText\"",
            style = MaterialTheme.typography.bodySmall.copy(
                color = TextSecondary,
                fontSize = 13.sp,
                lineHeight = 18.sp
            ),
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(16.dp))

        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = "Helpful tips:",
                style = MaterialTheme.typography.labelSmall.copy(
                    color = ChampagneGoldLight,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 11.sp
                )
            )
            suggestions.forEach { tip ->
                Row(verticalAlignment = Alignment.Top) {
                    Text(
                        text = "• ",
                        style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary)
                    )
                    Text(
                        text = tip,
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = TextSecondary,
                            fontSize = 12.sp,
                            lineHeight = 16.sp
                        )
                    )
                }
            }
        }
    }
}

/**
 * Error state view with retry trigger.
 */
@Composable
fun ErrorStateView(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    canRetry: Boolean = true
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(CinemaSurface, RoundedCornerShape(18.dp))
            .border(1.dp, Color(0xFFEF4444).copy(alpha = 0.35f), RoundedCornerShape(18.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Discovery Interrupted",
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Bold,
                color = Color(0xFFFCA5A5),
                fontSize = 16.sp
            )
        )

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall.copy(
                color = TextSecondary,
                fontSize = 13.sp
            ),
            textAlign = TextAlign.Center
        )

        if (canRetry) {
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = ChampagneGold,
                    contentColor = CinemaBackground
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = "Retry",
                    modifier = Modifier.size(16.dp),
                    tint = CinemaBackground
                )
                Spacer(modifier = Modifier.size(6.dp))
                Text(
                    text = "Try Again",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = CinemaBackground
                    )
                )
            }
        }
    }
}

/**
 * Structured guide item for the discovery guideline cards.
 */
data class DiscoveryGuideItem(
    val title: String,
    val description: String,
    val tagline: String,
    val example: String
)

object DiscoveryGuideCatalog {
    val ITEMS = listOf(
        DiscoveryGuideItem(
            title = "By Mood",
            description = "Find something that matches how you feel.",
            tagline = "Looking for romance, comedy, suspense, thrills, or something feel-good? Start with a mood.",
            example = "Romantic, emotional, suspenseful, with unexpected twists."
        ),
        DiscoveryGuideItem(
            title = "By Story",
            description = "For plots, characters, relationships and tropes.",
            tagline = "Describe the plot, characters, relationships, or twist—even in your own words.",
            example = "A hero falls in love with his enemy’s daughter."
        ),
        DiscoveryGuideItem(
            title = "From Memory",
            description = "When you remember something but cannot recall the title.",
            tagline = "Remember a scene, character, quote, place, or small detail? Tell us whatever you recall.",
            example = "A man discovers his entire life might be secretly controlled."
        )
    )
}

/**
 * Idle / Welcome view displaying helpful guidelines.
 * Compact and scrollable to ensure viewport adaptation across screen sizes.
 */
@Composable
fun IdleWelcomeView(
    onExampleSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(scrollState)
            .padding(vertical = 2.dp)
    ) {
        Text(
            text = "How to discover:",
            style = MaterialTheme.typography.titleSmall.copy(
                color = TextPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp
            )
        )

        Spacer(modifier = Modifier.height(6.dp))

        DiscoveryGuideCatalog.ITEMS.forEachIndexed { index, item ->
            if (index > 0) {
                Spacer(modifier = Modifier.height(6.dp))
            }
            val icon = when (index) {
                0 -> Icons.Default.Favorite
                1 -> Icons.AutoMirrored.Filled.List
                else -> Icons.Default.Refresh
            }
            DiscoveryTipCard(
                title = item.title,
                tagline = item.tagline,
                example = item.example,
                icon = icon,
                onClick = { onExampleSelect(item.example) }
            )
        }
    }
}

/**
 * View displayed when an unsupported catalog capability is selected (e.g., Movies).
 * Clearly explains that movie discovery is not connected, with zero fake data,
 * and provides a one-click action to switch back to Series.
 */
@Composable
fun UnsupportedContentView(
    contentType: com.kunal.sfinder.domain.model.ContentType,
    message: String,
    onSwitchToSeries: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp, horizontal = 16.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(CinemaSurface)
                .border(1.dp, CinemaBorder, RoundedCornerShape(16.dp))
                .padding(24.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(CinemaSurfaceElevated)
                    .border(1.dp, ChampagneGoldMuted, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = ChampagneGold,
                    modifier = Modifier.size(28.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Movie Discovery Not Available",
                style = MaterialTheme.typography.titleMedium.copy(
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                ),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium.copy(
                    color = TextSecondary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                ),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "S Finder is currently connected to TVmaze, which provides verified television series, web series, K-Dramas, and anime. A movie catalog has not been connected yet.",
                style = MaterialTheme.typography.bodySmall.copy(
                    color = TextTertiary,
                    fontSize = 12.sp,
                    lineHeight = 16.sp
                ),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(20.dp))

            Button(
                onClick = onSwitchToSeries,
                colors = ButtonDefaults.buttonColors(
                    containerColor = ChampagneGold,
                    contentColor = CinemaBackground
                ),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier.height(40.dp)
            ) {
                Text(
                    text = "Switch to Series Discovery",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                )
            }
        }
    }
}

@Composable
private fun DiscoveryTipCard(
    title: String,
    tagline: String,
    example: String,
    icon: ImageVector? = null,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(CinemaSurfaceElevated)
            .border(1.dp, CinemaBorder, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp)
    ) {
        Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = ChampagneGold,
                        modifier = Modifier.size(13.dp)
                    )
                }
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall.copy(
                        color = ChampagneGoldLight,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                )
            }

            Spacer(modifier = Modifier.height(2.dp))

            Text(
                text = tagline,
                style = MaterialTheme.typography.bodySmall.copy(
                    color = TextSecondary,
                    fontSize = 11.5.sp,
                    lineHeight = 15.sp
                )
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = buildAnnotatedString {
                    withStyle(
                        SpanStyle(
                            color = ChampagneGoldLight,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 11.sp
                        )
                    ) {
                        append("Example: ")
                    }
                    withStyle(
                        SpanStyle(
                            color = TextPrimary,
                            fontStyle = FontStyle.Italic,
                            fontSize = 11.sp
                        )
                    ) {
                        append("\"$example\"")
                    }
                },
                lineHeight = 14.sp
            )
        }
    }
}
