package com.kunal.sfinder

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.tooling.preview.Preview
import com.kunal.sfinder.ui.home.HomeScreen
import com.kunal.sfinder.ui.splash.SplashScreen
import com.kunal.sfinder.ui.theme.SFinderTheme
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val initialQuery = intent?.getStringExtra("initial_query")
        val initialGenre = intent?.getStringExtra("initial_genre") ?: "ANY"
        val initialCountry = intent?.getStringExtra("initial_country") ?: "ANY"
        val initialContentType = intent?.getStringExtra("initial_content_type")?.let {
            com.kunal.sfinder.domain.model.ContentType.fromDisplayName(it)
        } ?: com.kunal.sfinder.domain.model.ContentType.ALL

        setContent {
            SFinderTheme {
                var showSplash by rememberSaveable { mutableStateOf(savedInstanceState == null) }

                LaunchedEffect(Unit) {
                    if (showSplash) {
                        delay(1200L)
                        showSplash = false
                    }
                }

                Crossfade(
                    targetState = showSplash,
                    animationSpec = tween(durationMillis = 350),
                    label = "SplashToHomeTransition"
                ) { isSplashing ->
                    if (isSplashing) {
                        SplashScreen()
                    } else {
                        HomeScreen(
                            initialQuery = initialQuery,
                            initialGenre = initialGenre,
                            initialCountry = initialCountry,
                            initialContentType = initialContentType
                        )
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun SplashScreenPreview() {
    SFinderTheme {
        SplashScreen()
    }
}

@Preview(showBackground = true)
@Composable
fun HomeScreenPreview() {
    SFinderTheme {
        HomeScreen()
    }
}
