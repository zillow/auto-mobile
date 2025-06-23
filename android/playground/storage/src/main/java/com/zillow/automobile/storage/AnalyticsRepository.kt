package com.zillow.automobile.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

data class UserStats(
  val taps: Int = 0,
  val swipes: Int = 0,
  val screensNavigated: Int = 0,
  val lastUpdated: Long = System.currentTimeMillis(),
  val sessionStartTime: Long = System.currentTimeMillis(),
  val totalSessions: Int = 1,
  val averageSessionDuration: Long = 0,
  val tapBreakdown: Map<String, Int> = emptyMap(),
  val swipeBreakdown: Map<String, Int> = emptyMap(),
  val screenBreakdown: Map<String, Int> = emptyMap(),
  val todayStats: DailyStats = DailyStats(),
  val weeklyStats: List<DailyStats> = emptyList()
)

data class DailyStats(
  val date: String = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()),
  val taps: Int = 0,
  val swipes: Int = 0,
  val screens: Int = 0,
  val sessionCount: Int = 0,
  val totalDuration: Long = 0
)

data class AnalyticsEvent(
  val eventName: String,
  val timestamp: Long,
  val properties: Map<String, Any> = emptyMap(),
  val elementId: String? = null,
  val elementType: String? = null,
  val screenName: String? = null,
  val coordinates: Pair<Float, Float>? = null
)

data class DetailedEventStats(
  val totalEvents: Int,
  val recentEvents: List<AnalyticsEvent>,
  val topElements: Map<String, Int>,
  val topScreens: Map<String, Int>,
  val hourlyDistribution: Map<Int, Int>
)

class AnalyticsRepository(context: Context) {
  private val sharedPreferences: SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private val _currentScreen = MutableStateFlow<String?>(null)
  val currentScreen: StateFlow<String?> = _currentScreen.asStateFlow()

  private val _userStats = MutableStateFlow(UserStats())
  val userStats: StateFlow<UserStats> = _userStats.asStateFlow()

  private var sessionStartTime = System.currentTimeMillis()
  private val eventHistory = mutableListOf<AnalyticsEvent>()

  // Performance monitoring
  private var lastEventTime = 0L
  private val performanceMetrics = mutableMapOf<String, MutableList<Long>>()

  var isTrackingEnabled: Boolean
    get() = sharedPreferences.getBoolean(KEY_TRACKING_ENABLED, true)
    set(value) = sharedPreferences.edit { putBoolean(KEY_TRACKING_ENABLED, value) }

  init {
    // Initialize session
    initializeSession()
    // Initialize the StateFlow with current stats
    _userStats.value = loadUserStats()
  }

  private fun initializeSession() {
    sessionStartTime = System.currentTimeMillis()
    val sessionCount = sharedPreferences.getInt(KEY_TOTAL_SESSIONS, 0) + 1
    sharedPreferences.edit {
      putInt(KEY_TOTAL_SESSIONS, sessionCount)
      putLong(KEY_SESSION_START_TIME, sessionStartTime)
    }
  }

  fun getUserStats(): UserStats {
    return _userStats.value
  }

  private fun loadUserStats(): UserStats {
    val taps = sharedPreferences.getInt(KEY_TAPS, 0)
    val swipes = sharedPreferences.getInt(KEY_SWIPES, 0)
    val screensNavigated = sharedPreferences.getInt(KEY_SCREENS_NAVIGATED, 0)
    val lastUpdated = sharedPreferences.getLong(KEY_LAST_UPDATED, System.currentTimeMillis())
    val totalSessions = sharedPreferences.getInt(KEY_TOTAL_SESSIONS, 1)
    val avgSessionDuration = sharedPreferences.getLong(KEY_AVG_SESSION_DURATION, 0)

    return UserStats(
      taps = taps,
      swipes = swipes,
      screensNavigated = screensNavigated,
      lastUpdated = lastUpdated,
      sessionStartTime = sessionStartTime,
      totalSessions = totalSessions,
      averageSessionDuration = avgSessionDuration,
      tapBreakdown = getTapBreakdown(),
      swipeBreakdown = getSwipeBreakdown(),
      screenBreakdown = getScreenBreakdown(),
      todayStats = getTodayStats(),
      weeklyStats = getWeeklyStats()
    )
  }

  private fun getTapBreakdown(): Map<String, Int> {
    val breakdownJson = sharedPreferences.getString(KEY_TAP_BREAKDOWN, "{}")
    return parseBreakdownJson(breakdownJson ?: "{}")
  }

  private fun getSwipeBreakdown(): Map<String, Int> {
    val breakdownJson = sharedPreferences.getString(KEY_SWIPE_BREAKDOWN, "{}")
    return parseBreakdownJson(breakdownJson ?: "{}")
  }

  private fun getScreenBreakdown(): Map<String, Int> {
    val breakdownJson = sharedPreferences.getString(KEY_SCREEN_BREAKDOWN, "{}")
    return parseBreakdownJson(breakdownJson ?: "{}")
  }

  private fun parseBreakdownJson(json: String): Map<String, Int> {
    return try {
      json.removeSurrounding("{", "}")
        .split(",")
        .filter { it.isNotBlank() }
        .associate { entry ->
          val (key, value) = entry.split(":")
          key.trim().removeSurrounding("\"") to value.trim().toInt()
        }
    } catch (e: Exception) {
      emptyMap()
    }
  }

  private fun saveBreakdown(key: String, breakdown: Map<String, Int>) {
    val json = breakdown.entries.joinToString(",") { "\"${it.key}\":${it.value}" }
    sharedPreferences.edit { putString(key, "{$json}") }
  }

  fun trackEvent(eventName: String, properties: Map<String, Any> = emptyMap()) {
    if (!isTrackingEnabled) return

    @Suppress("UNCHECKED_CAST")
    val coordinates = properties["coordinates"] as? Pair<Float, Float>

    when (eventName) {
      "tap", "button_click", "card_tap" -> incrementTaps(
        elementType = properties["elementType"] as? String,
        elementId = properties["elementId"] as? String,
        coordinates = coordinates
      )

      "swipe", "scroll", "gesture" -> incrementSwipes(
        elementType = properties["elementType"] as? String,
        elementId = properties["elementId"] as? String,
        direction = properties["direction"] as? String,
        coordinates = coordinates
      )

      "navigation", "screen_view" -> incrementScreensNavigated(
        screenName = properties["screenName"] as? String
      )
    }
  }

  private fun getTodayStats(): DailyStats {
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    val todayTaps = sharedPreferences.getInt("${KEY_TODAY_TAPS}_$today", 0)
    val todaySwipes = sharedPreferences.getInt("${KEY_TODAY_SWIPES}_$today", 0)
    val todayScreens = sharedPreferences.getInt("${KEY_TODAY_SCREENS}_$today", 0)
    val todaySessions = sharedPreferences.getInt("${KEY_TODAY_SESSIONS}_$today", 0)
    val todayDuration = sharedPreferences.getLong("${KEY_TODAY_DURATION}_$today", 0)

    return DailyStats(
      date = today,
      taps = todayTaps,
      swipes = todaySwipes,
      screens = todayScreens,
      sessionCount = todaySessions,
      totalDuration = todayDuration
    )
  }

  private fun getWeeklyStats(): List<DailyStats> {
    val stats = mutableListOf<DailyStats>()
    val calendar = Calendar.getInstance()

    repeat(7) { i ->
      val date = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(calendar.time)
      val taps = sharedPreferences.getInt("${KEY_TODAY_TAPS}_$date", 0)
      val swipes = sharedPreferences.getInt("${KEY_TODAY_SWIPES}_$date", 0)
      val screens = sharedPreferences.getInt("${KEY_TODAY_SCREENS}_$date", 0)
      val sessions = sharedPreferences.getInt("${KEY_TODAY_SESSIONS}_$date", 0)
      val duration = sharedPreferences.getLong("${KEY_TODAY_DURATION}_$date", 0)

      stats.add(DailyStats(date, taps, swipes, screens, sessions, duration))
      calendar.add(Calendar.DAY_OF_YEAR, -1)
    }

    return stats.reversed()
  }

  fun incrementTaps(
    count: Int = 1,
    elementId: String? = null,
    elementType: String? = null,
    coordinates: Pair<Float, Float>? = null
  ) {
    if (!isTrackingEnabled) return

    val currentStats = getUserStats()
    val newCount = currentStats.taps + count

    sharedPreferences.edit {
      putInt(KEY_TAPS, newCount)
      putLong(KEY_LAST_UPDATED, System.currentTimeMillis())
    }

    // Update breakdowns
    elementType?.let { type ->
      val breakdown = getTapBreakdown().toMutableMap()
      breakdown[type] = (breakdown[type] ?: 0) + count
      saveBreakdown(KEY_TAP_BREAKDOWN, breakdown)
    }

    // Update daily stats
    updateDailyStats(taps = count)

    // Track detailed event
    trackDetailedEvent("tap", elementId, elementType, coordinates)

    // Performance monitoring
    monitorPerformance("tap")

    // Update the StateFlow with new stats
    _userStats.value = loadUserStats()
  }

  fun incrementSwipes(
    count: Int = 1,
    elementId: String? = null,
    elementType: String? = null,
    direction: String? = null,
    coordinates: Pair<Float, Float>? = null
  ) {
    if (!isTrackingEnabled) return

    val currentStats = getUserStats()
    val newCount = currentStats.swipes + count

    sharedPreferences.edit {
      putInt(KEY_SWIPES, newCount)
      putLong(KEY_LAST_UPDATED, System.currentTimeMillis())
    }

    // Update breakdowns
    val breakdownKey = when {
      elementType != null && direction != null -> "$elementType-$direction"
      elementType != null -> elementType
      direction != null -> direction
      else -> "unknown"
    }

    val breakdown = getSwipeBreakdown().toMutableMap()
    breakdown[breakdownKey] = (breakdown[breakdownKey] ?: 0) + count
    saveBreakdown(KEY_SWIPE_BREAKDOWN, breakdown)

    // Update daily stats
    updateDailyStats(swipes = count)

    // Track detailed event
    trackDetailedEvent(
      "swipe",
      elementId,
      elementType,
      coordinates,
      mapOf("direction" to (direction ?: "unknown"))
    )

    // Performance monitoring
    monitorPerformance("swipe")

    // Update the StateFlow with new stats
    _userStats.value = loadUserStats()
  }

  fun incrementScreensNavigated(count: Int = 1, screenName: String? = null) {
    if (!isTrackingEnabled) return

    val currentStats = getUserStats()
    val newCount = currentStats.screensNavigated + count

    sharedPreferences.edit {
      putInt(KEY_SCREENS_NAVIGATED, newCount)
      putLong(KEY_LAST_UPDATED, System.currentTimeMillis())
    }

    // Update screen breakdown
    screenName?.let { screen ->
      val breakdown = getScreenBreakdown().toMutableMap()
      breakdown[screen] = (breakdown[screen] ?: 0) + count
      saveBreakdown(KEY_SCREEN_BREAKDOWN, breakdown)
    }

    // Update current screen
    _currentScreen.value = screenName

    // Update daily stats
    updateDailyStats(screens = count)

    // Track detailed event
    trackDetailedEvent("screen_view", elementId = screenName)

    // Performance monitoring
    monitorPerformance("screen_navigation")

    // Update the StateFlow with new stats
    _userStats.value = loadUserStats()
  }

  private fun updateDailyStats(taps: Int = 0, swipes: Int = 0, screens: Int = 0) {
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

    sharedPreferences.edit {
      if (taps > 0) {
        val currentTaps = sharedPreferences.getInt("${KEY_TODAY_TAPS}_$today", 0)
        putInt("${KEY_TODAY_TAPS}_$today", currentTaps + taps)
      }
      if (swipes > 0) {
        val currentSwipes = sharedPreferences.getInt("${KEY_TODAY_SWIPES}_$today", 0)
        putInt("${KEY_TODAY_SWIPES}_$today", currentSwipes + swipes)
      }
      if (screens > 0) {
        val currentScreens = sharedPreferences.getInt("${KEY_TODAY_SCREENS}_$today", 0)
        putInt("${KEY_TODAY_SCREENS}_$today", currentScreens + screens)
      }
    }
  }

  private fun trackDetailedEvent(
    eventType: String,
    elementId: String? = null,
    elementType: String? = null,
    coordinates: Pair<Float, Float>? = null,
    additionalProperties: Map<String, Any> = emptyMap()
  ) {
    val event = AnalyticsEvent(
      eventName = eventType,
      timestamp = System.currentTimeMillis(),
      properties = additionalProperties,
      elementId = elementId,
      elementType = elementType,
      screenName = _currentScreen.value,
      coordinates = coordinates
    )

    // Keep only last 1000 events to prevent memory issues
    if (eventHistory.size >= 1000) {
      eventHistory.removeAt(0)
    }
    eventHistory.add(event)
  }

  private fun monitorPerformance(eventType: String) {
    val currentTime = System.currentTimeMillis()
    if (lastEventTime > 0) {
      val timeDiff = currentTime - lastEventTime
      performanceMetrics.getOrPut(eventType) { mutableListOf() }.add(timeDiff)

      // Keep only last 100 measurements per event type
      performanceMetrics[eventType]?.let { list ->
        if (list.size > 100) {
          list.removeAt(0)
        }
      }
    }
    lastEventTime = currentTime
  }

  fun getDetailedEventStats(eventType: String): DetailedEventStats {
    val filteredEvents = eventHistory.filter { it.eventName == eventType }
    val topElements = filteredEvents
      .mapNotNull { it.elementType }
      .groupingBy { it }
      .eachCount()
      .entries
      .sortedByDescending { it.value }
      .take(10)
      .associate { it.key to it.value }

    val topScreens = filteredEvents
      .mapNotNull { it.screenName }
      .groupingBy { it }
      .eachCount()
      .entries
      .sortedByDescending { it.value }
      .take(10)
      .associate { it.key to it.value }

    val hourlyDistribution = filteredEvents
      .groupBy {
        Calendar.getInstance().apply { timeInMillis = it.timestamp }.get(Calendar.HOUR_OF_DAY)
      }
      .mapValues { it.value.size }

    return DetailedEventStats(
      totalEvents = filteredEvents.size,
      recentEvents = filteredEvents.takeLast(50),
      topElements = topElements,
      topScreens = topScreens,
      hourlyDistribution = hourlyDistribution
    )
  }

  fun getPerformanceMetrics(): Map<String, Map<String, Double>> {
    return performanceMetrics.mapValues { (_, times) ->
      if (times.isEmpty()) {
        mapOf("avg" to 0.0, "min" to 0.0, "max" to 0.0)
      } else {
        mapOf(
          "avg" to times.average(),
          "min" to (times.minOrNull()?.toDouble() ?: 0.0),
          "max" to (times.maxOrNull()?.toDouble() ?: 0.0)
        )
      }
    }
  }

  fun exportData(): Map<String, Any> {
    return mapOf(
      "userStats" to getUserStats(),
      "eventHistory" to eventHistory.takeLast(500), // Export last 500 events
      "performanceMetrics" to getPerformanceMetrics(),
      "exportTimestamp" to System.currentTimeMillis()
    )
  }

  fun updateUserStats(stats: UserStats) {
    sharedPreferences.edit {
      putInt(KEY_TAPS, stats.taps)
      putInt(KEY_SWIPES, stats.swipes)
      putInt(KEY_SCREENS_NAVIGATED, stats.screensNavigated)
      putLong(KEY_LAST_UPDATED, stats.lastUpdated)
      putLong(KEY_AVG_SESSION_DURATION, stats.averageSessionDuration)
      putInt(KEY_TOTAL_SESSIONS, stats.totalSessions)
      putString(KEY_TAP_BREAKDOWN, stats.tapBreakdown.toString())
      putString(KEY_SWIPE_BREAKDOWN, stats.swipeBreakdown.toString())
      putString(KEY_SCREEN_BREAKDOWN, stats.screenBreakdown.toString())
    }
  }

  fun resetStats() {
    sharedPreferences.edit {
      putInt(KEY_TAPS, 0)
      putInt(KEY_SWIPES, 0)
      putInt(KEY_SCREENS_NAVIGATED, 0)
      putLong(KEY_LAST_UPDATED, System.currentTimeMillis())
      putString(KEY_TAP_BREAKDOWN, "{}")
      putString(KEY_SWIPE_BREAKDOWN, "{}")
      putString(KEY_SCREEN_BREAKDOWN, "{}")
    }
    eventHistory.clear()
    performanceMetrics.clear()
    _userStats.value = UserStats()
  }

  fun clearAnalyticsData() {
    sharedPreferences.edit { clear() }
    eventHistory.clear()
    performanceMetrics.clear()
    _userStats.value = UserStats()
  }

  fun endSession() {
    val sessionDuration = System.currentTimeMillis() - sessionStartTime
    val totalSessions = sharedPreferences.getInt(KEY_TOTAL_SESSIONS, 1)
    val currentAvgDuration = sharedPreferences.getLong(KEY_AVG_SESSION_DURATION, 0)
    val newAvgDuration =
      ((currentAvgDuration * (totalSessions - 1)) + sessionDuration) / totalSessions

    val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

    sharedPreferences.edit {
      putLong(KEY_AVG_SESSION_DURATION, newAvgDuration)

      // Update today's session info
      val todaySessions = sharedPreferences.getInt("${KEY_TODAY_SESSIONS}_$today", 0)
      val todayDuration = sharedPreferences.getLong("${KEY_TODAY_DURATION}_$today", 0)
      putInt("${KEY_TODAY_SESSIONS}_$today", todaySessions + 1)
      putLong("${KEY_TODAY_DURATION}_$today", todayDuration + sessionDuration)
    }
  }

  companion object {
    private const val PREFS_NAME = "analytics_prefs"
    private const val KEY_TRACKING_ENABLED = "tracking_enabled"
    private const val KEY_TAPS = "taps"
    private const val KEY_SWIPES = "swipes"
    private const val KEY_SCREENS_NAVIGATED = "screens_navigated"
    private const val KEY_LAST_UPDATED = "last_updated"
    private const val KEY_TOTAL_SESSIONS = "total_sessions"
    private const val KEY_SESSION_START_TIME = "session_start_time"
    private const val KEY_AVG_SESSION_DURATION = "avg_session_duration"
    private const val KEY_TAP_BREAKDOWN = "tap_breakdown"
    private const val KEY_SWIPE_BREAKDOWN = "swipe_breakdown"
    private const val KEY_SCREEN_BREAKDOWN = "screen_breakdown"
    private const val KEY_TODAY_TAPS = "today_taps"
    private const val KEY_TODAY_SWIPES = "today_swipes"
    private const val KEY_TODAY_SCREENS = "today_screens"
    private const val KEY_TODAY_SESSIONS = "today_sessions"
    private const val KEY_TODAY_DURATION = "today_duration"
  }
}
