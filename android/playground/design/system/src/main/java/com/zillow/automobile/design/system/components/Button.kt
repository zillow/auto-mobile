package com.zillow.automobile.design.system.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme

@Composable
fun AutoMobileButton(
  text: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  enabled: Boolean = true,
  contentPadding: PaddingValues = ButtonDefaults.ContentPadding
) {
  Button(
    onClick = onClick,
    modifier = modifier.height(AutoMobileDimensions.buttonHeight),
    enabled = enabled,
    colors = ButtonDefaults.buttonColors(
      containerColor = MaterialTheme.colorScheme.primary,
      contentColor = MaterialTheme.colorScheme.onPrimary,
      disabledContainerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
      disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
    ),
    contentPadding = contentPadding
  ) {
    Text(
      text = text,
      style = MaterialTheme.typography.labelLarge,
      textAlign = TextAlign.Center
    )
  }
}

@Composable
fun AutoMobileSecondaryButton(
  text: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  enabled: Boolean = true,
  contentPadding: PaddingValues = ButtonDefaults.ContentPadding
) {
  FilledTonalButton(
    onClick = onClick,
    modifier = modifier.height(AutoMobileDimensions.buttonHeight),
    enabled = enabled,
    colors = ButtonDefaults.filledTonalButtonColors(
      containerColor = MaterialTheme.colorScheme.secondary,
      contentColor = MaterialTheme.colorScheme.onSecondary
    ),
    contentPadding = contentPadding
  ) {
    Text(
      text = text,
      style = MaterialTheme.typography.labelLarge,
      textAlign = TextAlign.Center
    )
  }
}

@Composable
fun AutoMobileOutlinedButton(
  text: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  enabled: Boolean = true,
  contentPadding: PaddingValues = ButtonDefaults.ContentPadding
) {
  OutlinedButton(
    onClick = onClick,
    modifier = modifier.height(AutoMobileDimensions.buttonHeight),
    enabled = enabled,
    colors = ButtonDefaults.outlinedButtonColors(
      contentColor = MaterialTheme.colorScheme.primary
    ),
    contentPadding = contentPadding
  ) {
    Text(
      text = text,
      style = MaterialTheme.typography.labelLarge,
      textAlign = TextAlign.Center
    )
  }
}

@Composable
fun AutoMobileTextButton(
  text: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  enabled: Boolean = true,
  contentPadding: PaddingValues = ButtonDefaults.TextButtonContentPadding
) {
  TextButton(
    onClick = onClick,
    modifier = modifier,
    enabled = enabled,
    colors = ButtonDefaults.textButtonColors(
      contentColor = MaterialTheme.colorScheme.primary
    ),
    contentPadding = contentPadding
  ) {
    Text(
      text = text,
      style = MaterialTheme.typography.labelLarge,
      textAlign = TextAlign.Center
    )
  }
}

@Preview(showBackground = true)
@Composable
private fun AutoMobileButtonPreview() {
  AutoMobileTheme {
    AutoMobileButton(
      text = "Primary Button",
      onClick = { }
    )
  }
}
