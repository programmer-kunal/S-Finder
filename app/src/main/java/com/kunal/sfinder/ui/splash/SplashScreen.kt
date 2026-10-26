package com.kunal.sfinder.ui.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kunal.sfinder.R
import com.kunal.sfinder.ui.theme.BurgundyAccent
import com.kunal.sfinder.ui.theme.ChampagneGoldLight
import com.kunal.sfinder.ui.theme.CinemaBackground
import com.kunal.sfinder.ui.theme.CinemaSurface
import com.kunal.sfinder.ui.theme.TextPrimary
import com.kunal.sfinder.ui.theme.TextTertiary

@Composable
fun SplashScreen(
    modifier: Modifier = Modifier
) {
    // Subtle cinematic entrance animation
    val contentAlpha = remember { Animatable(0f) }
    val contentScale = remember { Animatable(0.94f) }

    LaunchedEffect(Unit) {
        contentAlpha.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 600, easing = FastOutSlowInEasing)
        )
    }
    LaunchedEffect(Unit) {
        contentScale.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 650, easing = FastOutSlowInEasing)
        )
    }

    // Midnight Cinema background with restrained, subtle ambient depth
    val ambientGradient = Brush.verticalGradient(
        colors = listOf(
            CinemaBackground,
            CinemaSurface.copy(alpha = 0.5f),
            BurgundyAccent.copy(alpha = 0.08f),
            CinemaBackground
        )
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(CinemaBackground)
            .background(ambientGradient)
            .statusBarsPadding()
            .navigationBarsPadding()
            .testTag("splash_screen_root")
    ) {
        // Centered branded cluster: Logo + App Name + Tagline
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .padding(horizontal = 32.dp)
                .alpha(contentAlpha.value)
                .scale(contentScale.value),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // 1. Centered square logo - uncropped and proportionally scaled
            Image(
                painter = painterResource(id = R.drawable.sfinder_splash_logo),
                contentDescription = stringResource(R.string.app_name),
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .sizeIn(maxWidth = 200.dp, maxHeight = 200.dp)
                    .fillMaxWidth(0.52f)
                    .aspectRatio(1f)
                    .testTag("splash_logo_image")
            )

            Spacer(modifier = Modifier.height(24.dp))

            // 2. App Name: S Finder
            Text(
                text = stringResource(R.string.app_name),
                fontFamily = FontFamily.Default,
                fontWeight = FontWeight.Bold,
                fontSize = 28.sp,
                letterSpacing = 1.2.sp,
                color = TextPrimary,
                modifier = Modifier.testTag("splash_app_name")
            )

            Spacer(modifier = Modifier.height(8.dp))

            // 3. Tagline: Discover What To Watch
            Text(
                text = stringResource(R.string.splash_tagline),
                fontFamily = FontFamily.Default,
                fontWeight = FontWeight.Medium,
                fontSize = 14.sp,
                letterSpacing = 1.6.sp,
                color = ChampagneGoldLight,
                modifier = Modifier.testTag("splash_tagline")
            )
        }

        // 4. Brand credit near bottom: From KAVTORS
        Text(
            text = stringResource(R.string.splash_brand_credit),
            fontFamily = FontFamily.Default,
            fontWeight = FontWeight.Normal,
            fontSize = 12.sp,
            letterSpacing = 2.0.sp,
            color = TextTertiary,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 28.dp)
                .alpha(contentAlpha.value)
                .testTag("splash_brand_credit")
        )
    }
}
