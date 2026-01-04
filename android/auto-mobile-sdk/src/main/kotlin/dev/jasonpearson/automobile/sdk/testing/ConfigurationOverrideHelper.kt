package dev.jasonpearson.automobile.sdk.testing

import android.app.Activity
import android.content.res.Configuration

object ConfigurationOverrideHelper {
    /**
     * Apply a configuration override in tests and trigger configuration change callbacks.
     * Uses deprecated APIs intentionally for test-only overrides.
     */
    fun applyConfigurationOverride(
        activity: Activity,
        update: (Configuration) -> Unit
    ) {
        val config = Configuration(activity.resources.configuration)
        update(config)

        activity.runOnUiThread {
            @Suppress("DEPRECATION")
            activity.resources.updateConfiguration(config, activity.resources.displayMetrics)
            activity.onConfigurationChanged(config)
        }
    }
}
