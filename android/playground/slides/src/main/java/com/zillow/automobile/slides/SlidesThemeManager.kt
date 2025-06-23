package com.zillow.automobile.slides

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Manages theme preferences for the slides module using SharedPreferences.
 * Provides persistent storage for dark/light mode settings.
 */
class SlidesThemeManager(context: Context) {
  private val sharedPrefs: SharedPreferences = context.getSharedPreferences(
    PREFS_NAME, Context.MODE_PRIVATE
  )

  var isDarkMode by mutableStateOf(getStoredTheme())
    private set

  /**
   * Toggle between dark and light mode and persist the change.
   */
  fun toggleTheme() {
    updateTheme(!isDarkMode)
  }

  /**
   * Set specific theme mode and persist the change.
   */
  fun setTheme(enabled: Boolean) {
    updateTheme(enabled)
  }

  /**
   * Update theme state and persist the change.
   */
  private fun updateTheme(enabled: Boolean) {
    isDarkMode = enabled
    saveTheme(enabled)
  }

  /**
   * Get the currently stored theme preference.
   */
  private fun getStoredTheme(): Boolean {
    return sharedPrefs.getBoolean(KEY_DARK_MODE, false) // Default to light mode
  }

  /**
   * Save theme preference to SharedPreferences.
   */
  private fun saveTheme(isDark: Boolean) {
    sharedPrefs.edit()
      .putBoolean(KEY_DARK_MODE, isDark)
      .apply()
  }

  companion object {
    private const val PREFS_NAME = "slides_theme_prefs"
    private const val KEY_DARK_MODE = "is_dark_mode"
  }
}
