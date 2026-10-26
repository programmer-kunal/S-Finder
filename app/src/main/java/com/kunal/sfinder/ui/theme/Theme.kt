package com.kunal.sfinder.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = ChampagneGold,
    onPrimary = Color(0xFF0B0B0D),
    primaryContainer = ChampagneGoldMuted,
    onPrimaryContainer = ChampagneGoldLight,
    secondary = BurgundyAccent,
    onSecondary = Color.White,
    secondaryContainer = BurgundySurface,
    onSecondaryContainer = TextPrimary,
    tertiary = ChampagneGoldLight,
    background = CinemaBackground,
    onBackground = TextPrimary,
    surface = CinemaSurface,
    onSurface = TextPrimary,
    surfaceVariant = CinemaSurfaceElevated,
    onSurfaceVariant = TextSecondary,
    outline = CinemaBorder
)

private val LightColorScheme = lightColorScheme(
    primary = ChampagneGold,
    onPrimary = Color.Black,
    secondary = BurgundyAccent,
    onSecondary = Color.White,
    background = Color(0xFFF9F7F4),
    onBackground = Color(0xFF19191C),
    surface = Color.White,
    onSurface = Color(0xFF19191C),
    surfaceVariant = Color(0xFFECE7DF),
    onSurfaceVariant = Color(0xFF5A5752),
    outline = Color(0xFFD6D0C5)
)

@Composable
fun SFinderTheme(
    darkTheme: Boolean = true, // Default to Midnight Cinema dark theme
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
