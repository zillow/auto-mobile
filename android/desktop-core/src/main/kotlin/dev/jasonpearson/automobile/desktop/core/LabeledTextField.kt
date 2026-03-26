package dev.jasonpearson.automobile.desktop.core

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField

@Composable
fun LabeledTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
  Column(
      modifier = modifier,
      verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    Text(
        label,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
        fontSize = 11.sp,
    )
    TextField(value = value, onValueChange = onValueChange, modifier = Modifier.fillMaxWidth())
  }
}
