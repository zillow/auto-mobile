package com.zillow.automobile.slides.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zillow.automobile.slides.model.BulletPoint

/**
 * Bullet point slide component that displays hierarchical lists.
 * Supports both main points and sub-points with proper indentation.
 */
@Composable
fun BulletPointSlideItem(
  title: String?,
  points: List<BulletPoint>,
  modifier: Modifier = Modifier,
  titleColor: Color = MaterialTheme.colorScheme.onBackground,
  bulletColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
  subBulletColor: Color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
) {
  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(32.dp)
      .verticalScroll(rememberScrollState()),
    horizontalAlignment = Alignment.Start,
    verticalArrangement = Arrangement.spacedBy(24.dp)
  ) {
    // Title
    if (title != null) {
      Text(
        text = title,
        style = MaterialTheme.typography.displaySmall.copy(
          fontWeight = FontWeight.Bold,
          textAlign = TextAlign.Center,
          color = titleColor
        ),
        modifier = Modifier.padding(bottom = 16.dp)
      )
    }

    // Bullet points
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .wrapContentWidth(Alignment.CenterHorizontally),
      horizontalAlignment = Alignment.Start,
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      points.forEach { bulletPoint ->
        BulletPointItem(
          bulletPoint = bulletPoint,
          bulletColor = bulletColor,
          subBulletColor = subBulletColor
        )
      }
    }
  }
}

/**
 * Individual bullet point item with support for sub-points.
 */
@Composable
private fun BulletPointItem(
  bulletPoint: BulletPoint,
  bulletColor: Color,
  subBulletColor: Color,
  modifier: Modifier = Modifier
) {
  Column(
    modifier = modifier,
    verticalArrangement = Arrangement.spacedBy(8.dp)
  ) {
    // Main bullet point
    Row(
      horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Text(
        text = "•",
        style = MaterialTheme.typography.headlineMedium,
        color = bulletColor,
        modifier = Modifier.padding(top = 2.dp)
      )
      Text(
        text = bulletPoint.text,
        style = MaterialTheme.typography.headlineSmall.copy(
          color = bulletColor,
          lineHeight = 28.sp
        )
      )
    }

    // Sub-points
    if (bulletPoint.subPoints.isNotEmpty()) {
      Column(
        modifier = Modifier.padding(start = 32.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
      ) {
        bulletPoint.subPoints.forEach { subPoint ->
          Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            Text(
              text = "◦",
              style = MaterialTheme.typography.bodyLarge,
              color = subBulletColor,
              modifier = Modifier.padding(top = 2.dp)
            )
            Text(
              text = subPoint,
              style = MaterialTheme.typography.bodyLarge.copy(
                color = subBulletColor,
                lineHeight = 24.sp
              )
            )
          }
        }
      }
    }
  }
}

@Preview(showBackground = true)
@Composable
fun BulletPointSlideItemPreview() {
  MaterialTheme {
    BulletPointSlideItem(
      title = "AutoMobile Features",
      points = listOf(
        BulletPoint(
          text = "Source Intelligence",
          subPoints = listOf(
            "Analyzes Android app source code",
            "Generates intelligent test selectors"
          )
        ),
        BulletPoint(
          text = "Cross-Platform Testing",
          subPoints = listOf(
            "Supports Android and iOS",
            "Unified API for both platforms"
          )
        ),
        BulletPoint(
          text = "JUnit Integration",
          subPoints = listOf(
            "Drop-in replacement for Espresso",
            "Compatible with existing test infrastructure"
          )
        )
      )
    )
  }
}

@Preview(
  showBackground = true,
  widthDp = 800,
  heightDp = 480,
  name = "Landscape"
)
@Composable
fun BulletPointSlideItemLandscapePreview() {
  MaterialTheme {
    BulletPointSlideItem(
      title = "AutoMobile Features",
      points = listOf(
        BulletPoint(
          text = "Source Intelligence",
          subPoints = listOf(
            "Analyzes Android app source code",
            "Generates intelligent test selectors"
          )
        ),
        BulletPoint(
          text = "Cross-Platform Testing",
          subPoints = listOf(
            "Supports Android and iOS",
            "Unified API for both platforms"
          )
        ),
        BulletPoint(
          text = "JUnit Integration",
          subPoints = listOf(
            "Drop-in replacement for Espresso",
            "Compatible with existing test infrastructure"
          )
        )
      )
    )
  }
}
