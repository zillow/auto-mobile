package dev.jasonpearson.automobile.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jasonpearson.automobile.design.system.theme.AutoMobileTheme

@Composable
fun LongPressScreen() {
  val scrollState = rememberScrollState()

  Column(
      modifier =
          Modifier.fillMaxSize().verticalScroll(scrollState).padding(16.dp).semantics {
            testTag = "long_press_screen_content"
          },
      verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Text(
        text = "LONG PRESS SCREEN",
        fontSize = 24.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.fillMaxWidth().semantics { testTag = "long_press_screen_title" },
    )

    Text(
        text = "Dedicated long press scenarios for testing gestures and timing",
        fontSize = 16.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().semantics { testTag = "long_press_screen_description" },
    )

    LongPressContent()
  }
}

@Preview(showBackground = true)
@Composable
fun PreviewLongPressScreen() {
  AutoMobileTheme { LongPressScreen() }
}
