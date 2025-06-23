package com.zillow.automobile.storage

import android.app.Activity
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import kotlin.math.abs

/** Universal analytics tracking system that automatically captures user interactions */
class AnalyticsTracker private constructor() {

  companion object {
    @Volatile private var INSTANCE: AnalyticsTracker? = null

    fun getInstance(): AnalyticsTracker {
      return INSTANCE
          ?: synchronized(this) { INSTANCE ?: AnalyticsTracker().also { INSTANCE = it } }
    }
  }

  private var analyticsRepository: AnalyticsRepository? = null
  private var isInitialized = false

  fun initialize(context: Context) {
    if (isInitialized) return

    analyticsRepository = AnalyticsRepository(context)
    isInitialized = true
  }

  private fun getRepository(): AnalyticsRepository? {
    return analyticsRepository
  }

  /** Track tap events with detailed information */
  fun trackTap(
      elementId: String? = null,
      elementType: String? = null,
      coordinates: Pair<Float, Float>? = null,
      properties: Map<String, Any> = emptyMap()
  ) {
    getRepository()
        ?.incrementTaps(elementId = elementId, elementType = elementType, coordinates = coordinates)
  }

  /** Track swipe events with detailed information */
  fun trackSwipe(
      elementId: String? = null,
      elementType: String? = null,
      direction: String? = null,
      coordinates: Pair<Float, Float>? = null,
      properties: Map<String, Any> = emptyMap()
  ) {
    getRepository()
        ?.incrementSwipes(
            elementId = elementId,
            elementType = elementType,
            direction = direction,
            coordinates = coordinates)
  }

  /** Track screen navigation events */
  fun trackScreenView(screenName: String) {
    getRepository()?.incrementScreensNavigated(screenName = screenName)
  }

  /** Track generic events */
  fun trackEvent(eventName: String, properties: Map<String, Any> = emptyMap()) {
    getRepository()?.trackEvent(eventName, properties)
  }

  /** Get current analytics repository for direct access */
  fun getAnalyticsRepository(): AnalyticsRepository? = analyticsRepository
}

/** Activity extension to automatically track user interactions */
fun Activity.enableAnalyticsTracking() {
  val tracker = AnalyticsTracker.getInstance()
  tracker.initialize(this)

  // Track when activity starts
  tracker.trackScreenView(this.javaClass.simpleName)

  // Add touch interceptor to the root view
  val rootView = findViewById<ViewGroup>(android.R.id.content)
  rootView?.let { root ->
    root.setOnTouchListener { view, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          tracker.trackTap(
              elementId = view.id.toString(),
              elementType = view.javaClass.simpleName,
              coordinates = event.x to event.y)
        }

        MotionEvent.ACTION_MOVE -> {
          // Track swipe gestures
          if (event.historySize > 0) {
            val deltaX = event.x - event.getHistoricalX(0)
            val deltaY = event.y - event.getHistoricalY(0)

            if (abs(deltaX) > 50f || abs(deltaY) > 50f) {
              val direction =
                  when {
                    abs(deltaX) > abs(deltaY) && deltaX > 0 -> "right"
                    abs(deltaX) > abs(deltaY) && deltaX < 0 -> "left"
                    abs(deltaY) > abs(deltaX) && deltaY > 0 -> "down"
                    abs(deltaY) > abs(deltaX) && deltaY < 0 -> "up"
                    else -> "unknown"
                  }

              tracker.trackSwipe(
                  elementId = view.id.toString(),
                  elementType = view.javaClass.simpleName,
                  direction = direction,
                  coordinates = event.x to event.y)
            }
          }
        }
      }
      false // Don't consume the event
    }
  }
}

/** Extension function to track specific UI element interactions */
fun View.trackInteraction(
    elementId: String? = null,
    elementType: String? = null,
    action: String = "tap"
) {
  val tracker = AnalyticsTracker.getInstance()

  this.setOnClickListener {
    tracker.trackTap(
        elementId = elementId ?: this.id.toString(),
        elementType = elementType ?: this.javaClass.simpleName,
        coordinates = null)
  }

  this.setOnTouchListener { _, event ->
    when (event.action) {
      MotionEvent.ACTION_DOWN -> {
        tracker.trackTap(
            elementId = elementId ?: this.id.toString(),
            elementType = elementType ?: this.javaClass.simpleName,
            coordinates = event.x to event.y)
      }
    }
    false
  }
}

/** Navigation tracking utility */
object NavigationTracker {
  fun trackNavigation(from: String, to: String, method: String = "navigation") {
    val tracker = AnalyticsTracker.getInstance()
    tracker.trackEvent("navigation", mapOf("from" to from, "to" to to, "method" to method))
    tracker.trackScreenView(to)
  }
}

/** ExoPlayer tracking utility */
object MediaPlayerTracker {
  fun trackPlayerInteraction(
      action: String,
      videoId: String? = null,
      position: Long? = null,
      duration: Long? = null
  ) {
    val tracker = AnalyticsTracker.getInstance()
    val properties = mutableMapOf<String, Any>("action" to action)

    videoId?.let { properties["videoId"] = it }
    position?.let { properties["position"] = it }
    duration?.let { properties["duration"] = it }

    when (action) {
      "play",
      "pause",
      "stop",
      "seek" -> {
        tracker.trackTap(
            elementType = "media_control", elementId = "player_$action", coordinates = null)
      }

      "fullscreen",
      "exit_fullscreen" -> {
        tracker.trackTap(
            elementType = "media_control", elementId = "player_fullscreen", coordinates = null)
      }
    }

    tracker.trackEvent("media_player_$action", properties)
  }
}
