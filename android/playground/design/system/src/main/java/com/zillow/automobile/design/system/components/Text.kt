package com.zillow.automobile.design.system.components

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import com.zillow.automobile.design.system.theme.AutoMobileTheme

@Composable
fun AutoMobileText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    style: TextStyle = LocalTextStyle.current,
    textAlign: TextAlign? = null,
    overflow: TextOverflow = TextOverflow.Clip,
    softWrap: Boolean = true,
    maxLines: Int = Int.MAX_VALUE,
    minLines: Int = 1
) {
  Text(
      text = text,
      modifier = modifier,
      color = color,
      style = style,
      textAlign = textAlign,
      overflow = overflow,
      softWrap = softWrap,
      maxLines = maxLines,
      minLines = minLines)
}

@Composable
fun AutoMobileHeadline(
    text: String,
    modifier: Modifier = Modifier,
    textAlign: TextAlign? = null,
    overflow: TextOverflow = TextOverflow.Ellipsis,
    maxLines: Int = 2
) {
  AutoMobileText(
      text = text,
      modifier = modifier,
      color = MaterialTheme.colorScheme.onSurface,
      style = MaterialTheme.typography.headlineMedium,
      textAlign = textAlign,
      overflow = overflow,
      maxLines = maxLines)
}

@Composable
fun AutoMobileTitle(
    text: String,
    modifier: Modifier = Modifier,
    textAlign: TextAlign? = null,
    overflow: TextOverflow = TextOverflow.Ellipsis,
    maxLines: Int = 1
) {
  AutoMobileText(
      text = text,
      modifier = modifier,
      style = MaterialTheme.typography.titleLarge,
      color = MaterialTheme.colorScheme.onSurface,
      textAlign = textAlign,
      overflow = overflow,
      maxLines = maxLines)
}

@Composable
fun AutoMobileBodyText(
    text: String,
    modifier: Modifier = Modifier,
    textAlign: TextAlign? = null,
    overflow: TextOverflow = TextOverflow.Clip,
    maxLines: Int = Int.MAX_VALUE
) {
  AutoMobileText(
      text = text,
      modifier = modifier,
      style = MaterialTheme.typography.bodyMedium,
      color = MaterialTheme.colorScheme.onSurface,
      textAlign = textAlign,
      overflow = overflow,
      maxLines = maxLines)
}

@Composable
fun AutoMobileLabel(
    text: String,
    modifier: Modifier = Modifier,
    textAlign: TextAlign? = null,
    overflow: TextOverflow = TextOverflow.Ellipsis,
    maxLines: Int = 1
) {
  AutoMobileText(
      text = text,
      modifier = modifier,
      style = MaterialTheme.typography.labelMedium,
      color = MaterialTheme.colorScheme.onSurface,
      textAlign = textAlign,
      overflow = overflow,
      maxLines = maxLines)
}

@Preview(name = "Text", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(name = "Text - Dark", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun AutoMobileTextPreview() {
  val isDarkMode =
      when (LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        else -> false
      }

  AutoMobileTheme(darkTheme = isDarkMode) {
    Column(modifier = Modifier.background(MaterialTheme.colorScheme.background)) {
      AutoMobileHeadline("AutoMobile")
      AutoMobileTitle("Title Text")
      AutoMobileBodyText("Body text for longer content")
      AutoMobileLabel("Label Text")
    }
  }
}
