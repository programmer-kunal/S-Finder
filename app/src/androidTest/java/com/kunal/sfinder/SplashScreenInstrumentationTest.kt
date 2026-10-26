package com.kunal.sfinder

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.kunal.sfinder.ui.splash.SplashScreen
import com.kunal.sfinder.ui.theme.SFinderTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SplashScreenInstrumentationTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun testSplashScreenRendersAllBrandedElements() {
        composeTestRule.setContent {
            SFinderTheme {
                SplashScreen()
            }
        }

        // 1. Verify splash root is displayed
        composeTestRule.onNodeWithTag("splash_screen_root").assertIsDisplayed()

        // 2. Verify exact square logo is present and displayed
        composeTestRule.onNodeWithTag("splash_logo_image").assertIsDisplayed()

        // 3. Verify App Name 'S Finder' is displayed
        val appNameNode = composeTestRule.onNodeWithTag("splash_app_name")
        appNameNode.assertIsDisplayed()
        appNameNode.assertTextEquals("S Finder")

        // 4. Verify Tagline 'Discover What To Watch' is displayed
        val taglineNode = composeTestRule.onNodeWithTag("splash_tagline")
        taglineNode.assertIsDisplayed()
        taglineNode.assertTextEquals("Discover What To Watch")

        // 5. Verify Brand Credit 'From KAVTORS' is displayed
        val brandCreditNode = composeTestRule.onNodeWithTag("splash_brand_credit")
        brandCreditNode.assertIsDisplayed()
        brandCreditNode.assertTextEquals("From KAVTORS")
    }
}
