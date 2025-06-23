package com.zillow.automobile.design.system.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// AutoMobile Light Color Scheme
private val AutoMobileLightColorScheme = lightColorScheme(
  primary = AutoMobileBlack,
  onPrimary = AutoMobileWhite,
  primaryContainer = AutoMobileGray200,
  onPrimaryContainer = AutoMobileBlack,

  secondary = AutoMobileRed,
  onSecondary = AutoMobileWhite,
  secondaryContainer = AutoMobileRed,
  onSecondaryContainer = AutoMobileWhite,

  tertiary = AutoMobileGray600,
  onTertiary = AutoMobileWhite,
  tertiaryContainer = AutoMobileGray300,
  onTertiaryContainer = AutoMobileGray800,

  error = AutoMobileError,
  onError = AutoMobileWhite,
  errorContainer = Color(0xFFFFDAD6),
  onErrorContainer = Color(0xFF410002),

  background = AutoMobileEggshell,
  onBackground = AutoMobileBlack,

  surface = AutoMobileWhite,
  onSurface = AutoMobileBlack,
  surfaceVariant = AutoMobileSurfaceVariant,
  onSurfaceVariant = AutoMobileOnSurfaceVariant,

  outline = AutoMobileGray400,
  outlineVariant = AutoMobileGray300,

  scrim = AutoMobileBlack,
  inverseSurface = AutoMobileBlack,
  inverseOnSurface = AutoMobileWhite,
  inversePrimary = AutoMobileGray300,

  surfaceDim = AutoMobileGray200,
  surfaceBright = AutoMobileWhite,
  surfaceContainerLowest = AutoMobileWhite,
  surfaceContainerLow = AutoMobileGray200,
  surfaceContainer = AutoMobileGray200,
  surfaceContainerHigh = AutoMobileGray300,
  surfaceContainerHighest = AutoMobileGray400
)

// AutoMobile Dark Color Scheme
private val AutoMobileDarkColorScheme = darkColorScheme(
  primary = AutoMobileWhite,
  onPrimary = AutoMobileBlack,
  primaryContainer = AutoMobileGray800,
  onPrimaryContainer = AutoMobileWhite,

  secondary = AutoMobileRed,
  onSecondary = AutoMobileWhite,
  secondaryContainer = AutoMobileRed,
  onSecondaryContainer = AutoMobileWhite,

  tertiary = AutoMobileGray400,
  onTertiary = AutoMobileBlack,
  tertiaryContainer = AutoMobileGray700,
  onTertiaryContainer = AutoMobileGray300,

  error = Color(0xFFFFB4AB),
  onError = Color(0xFF690005),
  errorContainer = Color(0xFF93000A),
  onErrorContainer = Color(0xFFFFDAD6),

  background = AutoMobileBlack,
  onBackground = AutoMobileWhite,

  surface = AutoMobileGray900,
  onSurface = AutoMobileWhite,
  surfaceVariant = AutoMobileGray700,
  onSurfaceVariant = AutoMobileGray300,

  outline = AutoMobileGray600,
  outlineVariant = AutoMobileGray700,

  scrim = AutoMobileBlack,
  inverseSurface = AutoMobileWhite,
  inverseOnSurface = AutoMobileBlack,
  inversePrimary = AutoMobileBlack,

  surfaceDim = AutoMobileGray900,
  surfaceBright = AutoMobileGray700,
  surfaceContainerLowest = AutoMobileBlack,
  surfaceContainerLow = AutoMobileGray900,
  surfaceContainer = AutoMobileGray800,
  surfaceContainerHigh = AutoMobileGray700,
  surfaceContainerHighest = AutoMobileGray600
)

@Composable
fun AutoMobileTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  dynamicColor: Boolean = false, // Disabled by default to use design system colors
  content: @Composable () -> Unit
) {
  val colorScheme = when {
    dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
      val context = LocalContext.current
      if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    }

    darkTheme -> AutoMobileDarkColorScheme
    else -> AutoMobileLightColorScheme
    }

  MaterialTheme(
    colorScheme = colorScheme,
    typography = AutoMobileTypography,
    shapes = AutoMobileShapes,
    content = content
  )
}
