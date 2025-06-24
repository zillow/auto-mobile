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
private val AutoMobileLightColorScheme =
    lightColorScheme(
        primary = AutoMobileLalala,
        onPrimary = AutoMobileWhite,
        primaryContainer = AutoMobileWhite,
        onPrimaryContainer = AutoMobileLalala,
        secondary = AutoMobileRed,
        onSecondary = AutoMobileWhite,
        secondaryContainer = AutoMobileRed,
        onSecondaryContainer = AutoMobileWhite,
        tertiary = AutoMobileLalala,
        onTertiary = AutoMobileWhite,
        tertiaryContainer = AutoMobileWhite,
        onTertiaryContainer = AutoMobileDarkGrey,
        error = AutoMobileError,
        onError = AutoMobileWhite,
        errorContainer = Color(0xFFFFDAD6),
        onErrorContainer = Color(0xFF410002),
        background = AutoMobileEggshell,
        onBackground = AutoMobileLalala,
        surface = AutoMobileWhite,
        onSurface = AutoMobileBlack,
        surfaceVariant = AutoMobileEggshell,
        onSurfaceVariant = AutoMobileLalala,
        outline = AutoMobileDarkGrey,
        outlineVariant = AutoMobileDarkGrey,
        scrim = AutoMobileBlack,
        inverseSurface = AutoMobileLalala,
        inverseOnSurface = AutoMobileWhite,
        inversePrimary = AutoMobileLalala,
        surfaceDim = AutoMobileEggshell,
        surfaceBright = AutoMobileWhite,
        surfaceContainerLowest = AutoMobileEggshell,
        surfaceContainerLow = AutoMobileEggshell,
        surfaceContainer = AutoMobileEggshell,
        surfaceContainerHigh = AutoMobileEggshell,
        surfaceContainerHighest = AutoMobileEggshell)

// AutoMobile Dark Color Scheme
private val AutoMobileDarkColorScheme =
    darkColorScheme(
        primary = AutoMobileWhite,
        onPrimary = AutoMobileLalala,
        primaryContainer = AutoMobileDarkGrey,
        onPrimaryContainer = AutoMobileWhite,
        secondary = AutoMobileRed,
        onSecondary = AutoMobileWhite,
        secondaryContainer = AutoMobileRed,
        onSecondaryContainer = AutoMobileWhite,
        tertiary = AutoMobileLightGrey,
        onTertiary = AutoMobileLalala,
        tertiaryContainer = AutoMobileDarkGrey,
        onTertiaryContainer = AutoMobileLightGrey,
        error = Color(0xFFFFB4AB),
        onError = Color(0xFF690005),
        errorContainer = Color(0xFF93000A),
        onErrorContainer = Color(0xFFFFDAD6),
        background = AutoMobileBlack,
        onBackground = AutoMobileWhite,
        surface = AutoMobileLalala,
        onSurface = AutoMobileWhite,
        surfaceVariant = AutoMobileLalala,
        onSurfaceVariant = AutoMobileWhite,
        outline = AutoMobileEggshell,
        outlineVariant = AutoMobileLalala,
        scrim = AutoMobileLalala,
        inverseSurface = AutoMobileWhite,
        inverseOnSurface = AutoMobileLalala,
        inversePrimary = AutoMobileLalala,
        surfaceDim = AutoMobileLalala,
        surfaceBright = AutoMobileEggshell,
        surfaceContainerLowest = AutoMobileLalala,
        surfaceContainerLow = AutoMobileLalala,
        surfaceContainer = AutoMobileLalala,
        surfaceContainerHigh = AutoMobileLalala,
        surfaceContainerHighest = AutoMobileBlack)

@Composable
fun AutoMobileTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false, // Disabled by default to use design system colors
    content: @Composable () -> Unit
) {
  val colorScheme =
      when {
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
      content = content)
}
