package com.kunal.sfinder.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kunal.sfinder.ui.theme.ChampagneGold
import com.kunal.sfinder.ui.theme.ChampagneGoldLight
import com.kunal.sfinder.ui.theme.CinemaBackground
import com.kunal.sfinder.ui.theme.CinemaBorder
import com.kunal.sfinder.ui.theme.CinemaSurface
import com.kunal.sfinder.ui.theme.CinemaSurfaceElevated
import com.kunal.sfinder.ui.theme.TextPrimary
import com.kunal.sfinder.ui.theme.TextSecondary
import com.kunal.sfinder.ui.theme.TextTertiary
import java.util.Locale

val AVAILABLE_GENRES = listOf(
    "Any genre",
    "Action",
    "Comedy",
    "Drama",
    "Thriller",
    "Romance",
    "Horror",
    "Sci-Fi & Fantasy",
    "Mystery & Crime",
    "Animation / Anime",
    "Documentary",
    "Adventure",
    "Family"
)

/**
 * Authoritative worldwide country provider using standard JVM/Android Locale.
 * Covers 240+ ISO 3166-1 standardized country names with zero third-party dependencies.
 */
object CountryCatalog {
    const val ANY_COUNTRY = "Any country — worldwide"

    val POPULAR_QUICK_PICKS = listOf(
        ANY_COUNTRY,
        "United States",
        "United Kingdom",
        "South Korea",
        "Japan",
        "India",
        "Turkey",
        "Canada",
        "Germany",
        "France",
        "Spain",
        "Australia",
        "Brazil",
        "Mexico",
        "China",
        "Italy"
    )

    val ALL_COUNTRIES: List<String> by lazy {
        val isoCodes = Locale.getISOCountries()
        val names = isoCodes.mapNotNull { code ->
            val name = Locale.Builder().setRegion(code).build().getDisplayCountry(Locale.US)
            if (name.isNotBlank()) name else null
        }.distinct().sorted()

        listOf(ANY_COUNTRY) + names
    }

    fun searchCountries(query: String): List<String> {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return ALL_COUNTRIES
        return ALL_COUNTRIES.filter { country ->
            country != ANY_COUNTRY && country.contains(trimmed, ignoreCase = true)
        }
    }
}

/**
 * Filter dialog enabling users to constrain discovery requests by Genre and Country/Region.
 * Includes real-time search across 240+ countries worldwide and popular quick-picks.
 * Selection of chips is committed only when the user presses 'Apply Filters'.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FilterDialog(
    initialGenre: String,
    initialCountry: String,
    onApply: (genre: String, country: String) -> Unit,
    onDismiss: () -> Unit
) {
    var tempGenre by remember {
        mutableStateOf(if (initialGenre.isBlank() || initialGenre == "ANY") "Any genre" else initialGenre)
    }
    var tempCountry by remember {
        mutableStateOf(if (initialCountry.isBlank() || initialCountry == "ANY") CountryCatalog.ANY_COUNTRY else initialCountry)
    }
    var countrySearchQuery by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = CinemaSurface,
        shape = RoundedCornerShape(20.dp),
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Discovery Filters",
                        style = MaterialTheme.typography.titleMedium.copy(
                            color = ChampagneGoldLight,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                    )
                    Text(
                        text = "Constrain AI & catalog search scope",
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = TextTertiary,
                            fontSize = 12.sp
                        )
                    )
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = TextSecondary,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        },
        text = {
            val scrollState = rememberScrollState()
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 440.dp)
                    .verticalScroll(scrollState)
            ) {
                // Genre Section
                Text(
                    text = "Genre / Tone",
                    style = MaterialTheme.typography.labelMedium.copy(
                        color = TextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp
                    )
                )
                Spacer(modifier = Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    AVAILABLE_GENRES.forEach { genre ->
                        val isSelected = genre == tempGenre
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(if (isSelected) ChampagneGold else CinemaSurfaceElevated)
                                .border(1.dp, if (isSelected) ChampagneGold else CinemaBorder, RoundedCornerShape(50))
                                .clickable { tempGenre = genre }
                                .padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text(
                                text = genre,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    color = if (isSelected) CinemaBackground else TextSecondary,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    fontSize = 11.sp
                                )
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                // Country / Origin Section
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Country / Origin",
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = TextPrimary,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp
                        )
                    )
                    if (tempCountry != CountryCatalog.ANY_COUNTRY) {
                        Text(
                            text = tempCountry,
                            style = MaterialTheme.typography.labelSmall.copy(
                                color = ChampagneGoldLight,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 11.sp
                            )
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Country Search Input
                OutlinedTextField(
                    value = countrySearchQuery,
                    onValueChange = { countrySearchQuery = it },
                    placeholder = {
                        Text(
                            "Search 240+ countries...",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = TextTertiary,
                                fontSize = 12.sp
                            )
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            tint = ChampagneGoldLight,
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    trailingIcon = {
                        if (countrySearchQuery.isNotBlank()) {
                            IconButton(
                                onClick = { countrySearchQuery = "" },
                                modifier = Modifier.size(24.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Clear search",
                                    tint = TextTertiary,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = CinemaSurfaceElevated,
                        unfocusedContainerColor = CinemaSurfaceElevated,
                        focusedBorderColor = ChampagneGold,
                        unfocusedBorderColor = CinemaBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        cursorColor = ChampagneGold
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                )

                Spacer(modifier = Modifier.height(10.dp))

                val isSearching = countrySearchQuery.isNotBlank()
                val visibleCountries = if (isSearching) {
                    CountryCatalog.searchCountries(countrySearchQuery)
                } else {
                    // Popular quick picks plus current selection if not already in quick picks
                    if (tempCountry !in CountryCatalog.POPULAR_QUICK_PICKS) {
                        listOf(tempCountry) + CountryCatalog.POPULAR_QUICK_PICKS
                    } else {
                        CountryCatalog.POPULAR_QUICK_PICKS
                    }
                }

                if (visibleCountries.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No countries match \"$countrySearchQuery\"",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = TextTertiary,
                                fontSize = 12.sp
                            )
                        )
                    }
                } else {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        visibleCountries.forEach { country ->
                            val isSelected = country == tempCountry
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(if (isSelected) ChampagneGold else CinemaSurfaceElevated)
                                    .border(1.dp, if (isSelected) ChampagneGold else CinemaBorder, RoundedCornerShape(50))
                                    .clickable {
                                        tempCountry = country
                                        if (isSearching) {
                                            countrySearchQuery = ""
                                        }
                                    }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = country,
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        color = if (isSelected) CinemaBackground else TextSecondary,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                        fontSize = 11.sp
                                    )
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val finalGenre = if (tempGenre == "Any genre") "ANY" else tempGenre
                    val finalCountry = if (tempCountry == CountryCatalog.ANY_COUNTRY) "ANY" else tempCountry
                    onApply(finalGenre, finalCountry)
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = ChampagneGold,
                    contentColor = CinemaBackground
                ),
                shape = RoundedCornerShape(20.dp)
            ) {
                Text(
                    text = "Apply Filters",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                )
            }
        },
        dismissButton = {
            OutlinedButton(
                onClick = {
                    tempGenre = "Any genre"
                    tempCountry = CountryCatalog.ANY_COUNTRY
                    countrySearchQuery = ""
                },
                shape = RoundedCornerShape(20.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, CinemaBorder)
            ) {
                Text(
                    text = "Reset",
                    style = MaterialTheme.typography.labelMedium.copy(
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                )
            }
        }
    )
}
