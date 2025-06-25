package com.zillow.automobile.login.ui

import android.content.res.Configuration
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.system.components.AutoMobileHeadline
import com.zillow.automobile.design.system.components.AutoMobileLogo
import com.zillow.automobile.design.system.theme.AutoMobileTheme

/** Header section of the login screen containing logo and title. */
@Composable
internal fun LoginHeader() {
  AutoMobileLogo()
  AutoMobileHeadline(text = "AutoMobile", color = MaterialTheme.colorScheme.primary)
}

@Preview(name = "Login Header", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(
    name = "Login Header - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun LoginHeaderPreview() {
  AutoMobileTheme { Column(horizontalAlignment = Alignment.CenterHorizontally) { LoginHeader() } }
}
