package com.zillow.automobile.design.system.components

import android.content.res.Configuration
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.assets.R
import com.zillow.automobile.design.system.theme.AutoMobileTheme
import com.zillow.automobile.design.system.theme.getExperiment
import com.zillow.automobile.experimentation.experiments.MoodExperiment
import com.zillow.automobile.experimentation.experiments.MoodTreatment

@Composable
fun AutoMobileLogo() {
  val mood = getExperiment<MoodExperiment>(MoodExperiment.EXPERIMENT_NAME)
  when (mood?.currentTreatment) {
    MoodTreatment.PARTY ->
        Image(
            painter = painterResource(R.drawable.auto_mobile_holo),
            contentDescription = "AutoMobile Party Logo",
        )
    else ->
        Image(
            painter = painterResource(R.drawable.auto_mobile_sticker),
            contentDescription = "AutoMobile Logo",
        )
  }
}

@Preview(name = "Logo", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(name = "Logo - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun AutoMobileLogoPreview() {
  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    Column(modifier = Modifier.background(MaterialTheme.colorScheme.background)) {
      AutoMobileLogo()
    }
  }
}
