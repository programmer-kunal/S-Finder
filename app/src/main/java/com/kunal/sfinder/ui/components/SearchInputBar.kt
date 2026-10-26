package com.kunal.sfinder.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kunal.sfinder.ui.theme.ChampagneGold
import com.kunal.sfinder.ui.theme.ChampagneGoldLight
import com.kunal.sfinder.ui.theme.ChampagneGoldMuted
import com.kunal.sfinder.ui.theme.CinemaBackground
import com.kunal.sfinder.ui.theme.CinemaBorder
import com.kunal.sfinder.ui.theme.CinemaSurface
import com.kunal.sfinder.ui.theme.MatchHighlightText
import com.kunal.sfinder.ui.theme.TextPrimary
import com.kunal.sfinder.ui.theme.TextSecondary
import com.kunal.sfinder.ui.theme.TextTertiary

/**
 * Expandable multiline search input designed for natural language entertainment discovery.
 * Styled in the Midnight Cinema palette with champagne gold accents.
 */
@Composable
fun SearchInputBar(
    queryText: String,
    onQueryChange: (String) -> Unit,
    onSearchSubmit: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Describe a plot, mood, relationship, or remembered scene..."
) {
    val focusManager = LocalFocusManager.current
    val isLongDescription = queryText.length > 80 || queryText.contains("\n")

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(CinemaSurface, RoundedCornerShape(18.dp))
            .border(1.dp, CinemaBorder, RoundedCornerShape(18.dp))
            .padding(horizontal = 12.dp, vertical = 9.dp)
    ) {
        // Text field container
        OutlinedTextField(
            value = queryText,
            onValueChange = onQueryChange,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("search_text_field"),
            placeholder = {
                Text(
                    text = placeholder,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = TextTertiary,
                        fontSize = 14.sp
                    )
                )
            },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = "Search Icon",
                    tint = ChampagneGold
                )
            },
            trailingIcon = {
                if (queryText.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Clear search",
                            tint = TextSecondary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
                focusedBorderColor = Color.Transparent,
                unfocusedBorderColor = Color.Transparent,
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary,
                cursorColor = ChampagneGold
            ),
            textStyle = MaterialTheme.typography.bodyMedium.copy(
                fontSize = 14.sp,
                lineHeight = 20.sp,
                color = TextPrimary
            ),
            minLines = 1,
            maxLines = 6, // Expands gracefully for long stories
            keyboardOptions = KeyboardOptions(
                imeAction = if (isLongDescription) ImeAction.Default else ImeAction.Search
            ),
            keyboardActions = KeyboardActions(
                onSearch = {
                    if (queryText.isNotBlank()) {
                        focusManager.clearFocus()
                        onSearchSubmit(queryText)
                    }
                }
            )
        )

        Spacer(modifier = Modifier.height(6.dp))

        // Action & Mode Indicator Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Mode / Length Badge
            if (isLongDescription) {
                Box(
                    modifier = Modifier
                        .background(ChampagneGoldMuted, RoundedCornerShape(6.dp))
                        .border(1.dp, ChampagneGold.copy(alpha = 0.3f), RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "✦ Story Context (${queryText.length} chars)",
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = ChampagneGoldLight,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 10.sp
                        )
                    )
                }
            } else {
                Text(
                    text = "Press Discover to search",
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = TextTertiary,
                        fontSize = 11.sp
                    )
                )
            }

            // Submit Button with Champagne Gold and dark readable text
            Button(
                onClick = {
                    if (queryText.isNotBlank()) {
                        focusManager.clearFocus()
                        onSearchSubmit(queryText)
                    }
                },
                modifier = Modifier.testTag("discover_button"),
                enabled = queryText.isNotBlank(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ChampagneGold,
                    disabledContainerColor = CinemaBorder.copy(alpha = 0.5f),
                    contentColor = CinemaBackground,
                    disabledContentColor = TextTertiary
                ),
                shape = RoundedCornerShape(10.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 7.dp)
            ) {
                Text(
                    text = "Discover",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = if (queryText.isNotBlank()) CinemaBackground else TextTertiary,
                        fontSize = 13.sp
                    )
                )
            }
        }
    }
}
