package com.zillow.automobile.playground.initializers

import android.content.Context
import androidx.startup.Initializer

/**
 * Initializer for ExoPlayer using AndroidX Startup.
 * Sets up any global configurations for ExoPlayer if needed.
 * Currently, ExoPlayer doesn't require complex global initialization,
 * so this serves as a placeholder for future configuration needs.
 */
class ExoPlayerInitializer : Initializer<Unit> {

  override fun create(context: Context) {
    // ExoPlayer typically doesn't need global initialization
    // This could be used for setting up global configurations in the future
    // such as default audio attributes, network timeouts, etc.
  }

  override fun dependencies(): List<Class<out Initializer<*>>> {
    // No dependencies on other libraries
    return emptyList()
  }
}
