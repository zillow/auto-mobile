package dev.jasonpearson.automobile.desktop.core.components

import androidx.compose.foundation.clickable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Clickable text styled as a hyperlink, matching Jewel's Link component API. */
@Composable
fun Link(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
  Text(
      text = text,
      color = MaterialTheme.colorScheme.primary,
      style = MaterialTheme.typography.bodyMedium,
      modifier = modifier.clickable(onClick = onClick),
  )
}
