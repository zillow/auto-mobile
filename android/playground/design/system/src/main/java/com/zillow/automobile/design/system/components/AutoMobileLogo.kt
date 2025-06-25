package com.zillow.automobile.design.system.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.assets.R
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.design.system.theme.getExperiment
import com.zillow.automobile.experimentation.experiments.MoodExperiment
import com.zillow.automobile.experimentation.experiments.MoodTreatment

@Composable
fun AutoMobileLogo(modifier: Modifier = Modifier) {
  val mood = getExperiment<MoodExperiment>(MoodExperiment.EXPERIMENT_NAME)
  when (mood?.currentTreatment) {
    MoodTreatment.PARTY -> {
      // Use holographic version for party mode
      Image(
        painter = painterResource(R.drawable.auto_mobile_holo),
        contentDescription = "AutoMobile Party Logo",
        modifier = modifier
      )
    }

    else -> {
      // Use standard logo for control
      Image(
        painter = painterResource(R.drawable.automobile_logo),
        contentDescription = "AutoMobile Logo",
        modifier = modifier
      )
    }
  }
}

@Preview(showBackground = true)
@Composable
private fun AutoMobileLogoPreview() {
  AutoMobileTheme {
    AutoMobileLogo()
  }
}
