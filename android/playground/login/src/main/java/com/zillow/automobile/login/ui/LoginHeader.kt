package com.zillow.automobile.login.ui

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.system.components.AutoMobileHeadline
import com.zillow.automobile.design.system.components.AutoMobileLogo
import com.zillow.automobile.design.system.theme.AutoMobileTheme

/** Header section of the login screen containing logo and title. */
@Composable
internal fun LoginHeader() {
  Column(
      horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    AutoMobileLogo()
    AutoMobileHeadline(text = "AutoMobile")
  }
}

@Preview(name = "Login Header", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Login Header - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun LoginHeaderPreview() {
  // Explicitly check if we're in dark mode based on the configuration
  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    Column(modifier = Modifier.background(MaterialTheme.colorScheme.background)) { LoginHeader() }
  }
}
