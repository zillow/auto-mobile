package com.zillow.automobile.playground.initializers

import android.content.Context
import androidx.startup.Initializer

/**
 * Initializer for Coil image loading library using AndroidX Startup. Ensures Coil is ready for use
 * in the application. The actual Coil configuration is handled by the library's
 * auto-initialization.
 */
class CoilInitializer : Initializer<Unit> {

  override fun create(context: Context) {
    // Coil 3.x handles initialization automatically
    // This initializer serves as a placeholder for any future
    // custom Coil configuration that might be needed
  }

  override fun dependencies(): List<Class<out Initializer<*>>> {
    // No dependencies on other libraries
    return emptyList()
  }
}
