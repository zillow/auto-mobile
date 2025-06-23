package com.zillow.automobile.design.system.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import com.zillow.automobile.design.system.theme.AutoMobileDimensions
import com.zillow.automobile.design.system.theme.AutoMobileTheme

@Composable
fun AutoMobileCard(
    modifier: Modifier = Modifier,
    shape: Shape = MaterialTheme.shapes.medium,
    containerColor: Color = MaterialTheme.colorScheme.surface,
    contentColor: Color = MaterialTheme.colorScheme.onSurface,
    elevation: Dp = AutoMobileDimensions.elevationSmall,
    content: @Composable ColumnScope.() -> Unit
) {
  Card(
      modifier = modifier,
      shape = shape,
      colors =
          CardDefaults.cardColors(containerColor = containerColor, contentColor = contentColor),
      elevation = CardDefaults.cardElevation(defaultElevation = elevation)) {
        Column(modifier = Modifier.padding(AutoMobileDimensions.spacing4)) { content() }
      }
}

@Composable
fun AutoMobileOutlinedCard(
    modifier: Modifier = Modifier,
    shape: Shape = MaterialTheme.shapes.medium,
    containerColor: Color = MaterialTheme.colorScheme.surface,
    contentColor: Color = MaterialTheme.colorScheme.onSurface,
    borderColor: Color = MaterialTheme.colorScheme.outline,
    borderWidth: Dp = AutoMobileDimensions.borderThin,
    content: @Composable ColumnScope.() -> Unit
) {
  OutlinedCard(
      modifier = modifier,
      shape = shape,
      colors =
          CardDefaults.outlinedCardColors(
              containerColor = containerColor, contentColor = contentColor),
      border = BorderStroke(width = borderWidth, color = borderColor)) {
        Column(modifier = Modifier.padding(AutoMobileDimensions.spacing4)) { content() }
      }
}

@Preview(showBackground = true)
@Composable
private fun AutoMobileCardPreview() {
  AutoMobileTheme {
    AutoMobileCard {
      AutoMobileText(text = "Card Content", style = MaterialTheme.typography.bodyMedium)
    }
  }
}
