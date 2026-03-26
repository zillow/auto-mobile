package dev.jasonpearson.automobile.desktop

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import dev.jasonpearson.automobile.desktop.core.AutoMobileContent
import dev.jasonpearson.automobile.desktop.core.platform.NoOpNotificationHandler
import dev.jasonpearson.automobile.desktop.core.platform.SourceFileOpener
import dev.jasonpearson.automobile.desktop.core.settings.FakeSettingsProvider
import dev.jasonpearson.automobile.desktop.theme.AutoMobileTheme

@Composable
fun AutoMobileDesktopApp() {
  val settings = remember { FakeSettingsProvider() }

  AutoMobileTheme {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
      AutoMobileContent(
          settingsProvider = settings,
          notificationHandler = NoOpNotificationHandler,
          onOpenSource = { fileName, lineNumber, className ->
            SourceFileOpener.open(fileName, lineNumber, className, settings.androidIde, settings.iosIde)
          },
      )
    }
  }
}
