package com.kunal.sfinder.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kunal.sfinder.domain.model.ContentType
import com.kunal.sfinder.domain.model.MediaType
import com.kunal.sfinder.ui.theme.ChampagneGold
import com.kunal.sfinder.ui.theme.ChampagneGoldLight
import com.kunal.sfinder.ui.theme.CinemaBackground
import com.kunal.sfinder.ui.theme.CinemaBorder
import com.kunal.sfinder.ui.theme.CinemaSurfaceElevated
import com.kunal.sfinder.ui.theme.TextSecondary

/**
 * Three primary content-type filters: All | Movies | Series.
 * Plus compact additional filters trigger (Genre & Country).
 */
@Composable
fun ContentTypeSelector(
    selectedContentType: ContentType,
    onContentTypeSelected: (ContentType) -> Unit,
    onOpenFilters: () -> Unit,
    activeFiltersCount: Int = 0,
    onClearFilters: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val hasActiveFilters = activeFiltersCount > 0

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Content type pills: All | Movies | Series
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ContentType.entries.forEach { type ->
                val isSelected = type == selectedContentType

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(
                            if (isSelected) ChampagneGold else CinemaSurfaceElevated
                        )
                        .border(
                            1.dp,
                            if (isSelected) ChampagneGold else CinemaBorder,
                            RoundedCornerShape(50)
                        )
                        .clickable { onContentTypeSelected(type) }
                        .padding(horizontal = 12.dp, vertical = 7.dp)
                ) {
                    Text(
                        text = type.displayName,
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = if (isSelected) CinemaBackground else TextSecondary,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            fontSize = 12.sp
                        )
                    )
                }
            }
        }

        // Action cluster on the right: [Clear filters ✕] [Filters (n)]
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (hasActiveFilters && onClearFilters != null) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .clickable { onClearFilters() }
                        .padding(horizontal = 4.dp, vertical = 7.dp)
                ) {
                    Text(
                        text = "Clear filters ✕",
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = ChampagneGold,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp
                        )
                    )
                }
            }

            // Existing Filters trigger pill (aligned at far right)
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(if (hasActiveFilters) ChampagneGold else CinemaSurfaceElevated)
                    .border(1.dp, if (hasActiveFilters) ChampagneGold else CinemaBorder, RoundedCornerShape(50))
                    .clickable { onOpenFilters() }
                    .padding(horizontal = 10.dp, vertical = 7.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.List,
                        contentDescription = "Filters",
                        tint = if (hasActiveFilters) CinemaBackground else ChampagneGoldLight,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = if (hasActiveFilters) "Filters ($activeFiltersCount)" else "Filters",
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = if (hasActiveFilters) CinemaBackground else TextSecondary,
                            fontWeight = if (hasActiveFilters) FontWeight.Bold else FontWeight.Medium,
                            fontSize = 12.sp
                        )
                    )
                }
            }
        }
    }
}

/**
 * Legacy category tabs row preserved for backward-compatibility and preview mode.
 */
@Composable
fun CategoryTabs(
    selectedCategory: MediaType,
    onCategorySelected: (MediaType) -> Unit,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(scrollState),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        MediaType.entries.forEach { category ->
            val isSelected = category == selectedCategory

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(
                        if (isSelected) ChampagneGold else CinemaSurfaceElevated
                    )
                    .border(
                        1.dp,
                        if (isSelected) ChampagneGold else CinemaBorder,
                        RoundedCornerShape(50)
                    )
                    .clickable { onCategorySelected(category) }
                    .padding(horizontal = 14.dp, vertical = 7.dp)
            ) {
                Text(
                    text = category.displayName,
                    style = MaterialTheme.typography.labelMedium.copy(
                        color = if (isSelected) CinemaBackground else TextSecondary,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        fontSize = 12.sp
                    )
                )
            }
        }
    }
}
