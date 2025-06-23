package com.zillow.automobile.design.system.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.zillow.automobile.design.assets.R
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.experimentation.ExperimentResolver

enum class LogoSize(val size: Dp) {
  Small(AutoMobileDimensions.iconSize),
  Medium(AutoMobileDimensions.iconSizeLarge),
  Large(48.dp),
  ExtraLarge(64.dp)
}

@Composable
fun AutoMobileLogo(
  experimentResolver: ExperimentResolver,
  modifier: Modifier = Modifier,
  size: LogoSize = LogoSize.Medium
) {
  val partyModeEnabled = experimentResolver.isPartyModeEnabled()

  if (partyModeEnabled) {
    // Use holographic version for party mode
    AsyncImage(
      model = R.drawable.auto_mobile_holo,
      contentDescription = "AutoMobile Party Logo",
      modifier = modifier.size(size.size),
      fallback = painterResource(R.drawable.automobile_logo)
    )
  } else {
    // Use standard logo for control
    Image(
      painter = painterResource(R.drawable.automobile_logo),
      contentDescription = "AutoMobile Logo",
      modifier = modifier.size(size.size)
    )
  }
}

@Composable
fun AutoMobileLogo(
  modifier: Modifier = Modifier,
  size: LogoSize = LogoSize.Medium,
  forcePartyMode: Boolean = false
) {
  if (forcePartyMode) {
    // Use holographic version for party mode
    AsyncImage(
      model = R.drawable.auto_mobile_holo,
      contentDescription = "AutoMobile Party Logo",
      modifier = modifier.size(size.size),
      fallback = painterResource(R.drawable.automobile_logo)
    )
  } else {
    // Use standard logo for control
    Image(
      painter = painterResource(R.drawable.automobile_logo),
      contentDescription = "AutoMobile Logo",
      modifier = modifier.size(size.size)
    )
  }
}

@Preview(showBackground = true)
@Composable
private fun AutoMobileLogoPreview() {
  AutoMobileTheme {
    Column(
      verticalArrangement = Arrangement.spacedBy(AutoMobileDimensions.spacing4),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      AutoMobileLogo(size = LogoSize.Small)
      AutoMobileLogo(size = LogoSize.Medium)
      AutoMobileLogo(size = LogoSize.Large)
      AutoMobileLogo(size = LogoSize.ExtraLarge)

      // Party mode previews
      AutoMobileLogo(size = LogoSize.Medium, forcePartyMode = true)
    }
  }
}
