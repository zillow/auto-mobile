package dev.jasonpearson.automobile.desktop.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
  primary = Color(0xFF1A73E8),
  onPrimary = Color.White,
  primaryContainer = Color(0xFFD3E3FD),
  onPrimaryContainer = Color(0xFF041E49),
  secondary = Color(0xFF5F6368),
  onSecondary = Color.White,
  secondaryContainer = Color(0xFFE8EAED),
  onSecondaryContainer = Color(0xFF202124),
  surface = Color(0xFFFAFAFA),
  onSurface = Color(0xFF202124),
  surfaceVariant = Color(0xFFF1F3F4),
  onSurfaceVariant = Color(0xFF5F6368),
  outline = Color(0xFFDADCE0),
  error = Color(0xFFD93025),
  onError = Color.White,
)

private val DarkColors = darkColorScheme(
  primary = Color(0xFF8AB4F8),
  onPrimary = Color(0xFF062E6F),
  primaryContainer = Color(0xFF0842A0),
  onPrimaryContainer = Color(0xFFD3E3FD),
  secondary = Color(0xFF9AA0A6),
  onSecondary = Color(0xFF303134),
  secondaryContainer = Color(0xFF3C4043),
  onSecondaryContainer = Color(0xFFE8EAED),
  tertiary = Color(0xFFFFA94D), // Warning/amber
  onTertiary = Color(0xFF3B2400),
  surface = Color(0xFF1E1E1E),
  onSurface = Color(0xFFE8EAED),
  surfaceVariant = Color(0xFF2D2D2D),
  onSurfaceVariant = Color(0xFF9AA0A6),
  outline = Color(0xFF5F6368),
  error = Color(0xFFF28B82),
  onError = Color(0xFF601410),
  background = Color(0xFF1E1E1E),
  onBackground = Color(0xFFE8EAED),
)

@Composable
fun AutoMobileTheme(
  darkTheme: Boolean = true, // Default to dark to match IDE plugin's Jewel dark theme
  content: @Composable () -> Unit,
) {
  MaterialTheme(
    colorScheme = if (darkTheme) DarkColors else LightColors,
    content = content,
  )
}
