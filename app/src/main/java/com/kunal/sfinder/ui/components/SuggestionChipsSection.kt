package com.kunal.sfinder.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kunal.sfinder.domain.model.SuggestionChip
import com.kunal.sfinder.ui.theme.BurgundyAccent
import com.kunal.sfinder.ui.theme.BurgundyMuted
import com.kunal.sfinder.ui.theme.ChampagneGold
import com.kunal.sfinder.ui.theme.ChampagneGoldLight
import com.kunal.sfinder.ui.theme.ChampagneGoldMuted
import com.kunal.sfinder.ui.theme.CinemaBorder
import com.kunal.sfinder.ui.theme.CinemaSurfaceElevated
import com.kunal.sfinder.ui.theme.TextPrimary
import com.kunal.sfinder.ui.theme.TextSecondary
import com.kunal.sfinder.ui.theme.TextTertiary

/**
 * Interactive mood, story trope, and memory suggestion chips that guide users on how to search.
 * Styled with subtle, restrained Midnight Cinema accents.
 */
@Composable
fun SuggestionChipsSection(
    onChipClick: (SuggestionChip) -> Unit,
    modifier: Modifier = Modifier,
    suggestions: List<SuggestionChip> = SuggestionChip.DEFAULT_SUGGESTIONS
) {
    val scrollState = rememberScrollState()

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Not sure what to watch? Start here",
            style = MaterialTheme.typography.labelMedium.copy(
                color = TextPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 12.5.sp
            )
        )
        Spacer(modifier = Modifier.height(1.dp))
        Text(
            text = "Tap an idea to discover movies and series.",
            style = MaterialTheme.typography.labelSmall.copy(
                color = TextSecondary,
                fontSize = 10.5.sp,
                lineHeight = 13.sp
            )
        )

        Spacer(modifier = Modifier.height(6.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            suggestions.forEach { chip ->
                SuggestionPill(
                    chip = chip,
                    onClick = { onChipClick(chip) }
                )
            }
        }
    }
}

@Composable
private fun SuggestionPill(
    chip: SuggestionChip,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(CinemaSurfaceElevated)
            .border(1.dp, CinemaBorder, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 7.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Subtle tag prefix (Trope, Mood, Memory, Single-word, Plot, Anime, Drama)
            Box(
                modifier = Modifier
                    .background(
                        when (chip.tag) {
                            "Mood" -> ChampagneGoldMuted
                            "Trope" -> BurgundyMuted
                            "Memory" -> ChampagneGoldMuted
                            "Single-word" -> CinemaBorder.copy(alpha = 0.6f)
                            "Plot" -> BurgundyMuted
                            "Anime" -> ChampagneGoldMuted
                            "Drama" -> BurgundyMuted
                            else -> CinemaBorder.copy(alpha = 0.5f)
                        },
                        RoundedCornerShape(4.dp)
                    )
                    .padding(horizontal = 5.dp, vertical = 2.dp)
            ) {
                Text(
                    text = chip.tag,
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = when (chip.tag) {
                            "Mood" -> ChampagneGoldLight
                            "Trope" -> Color(0xFFD98894) // Soft rose-burgundy for high contrast
                            "Memory" -> ChampagneGold
                            "Single-word" -> ChampagneGoldLight
                            "Plot" -> Color(0xFFE5A3AD)
                            "Anime" -> ChampagneGoldLight
                            "Drama" -> Color(0xFFD98894)
                            else -> TextSecondary
                        },
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold
                    )
                )
            }

            Spacer(modifier = Modifier.width(7.dp))

            Text(
                text = chip.title,
                style = MaterialTheme.typography.bodySmall.copy(
                    color = TextPrimary,
                    fontWeight = FontWeight.Medium,
                    fontSize = 12.sp
                )
            )
        }
    }
}
