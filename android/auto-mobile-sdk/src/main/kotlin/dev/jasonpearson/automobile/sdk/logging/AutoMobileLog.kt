package dev.jasonpearson.automobile.sdk.logging

import android.util.Log
import dev.jasonpearson.automobile.protocol.SdkLogEvent
import dev.jasonpearson.automobile.sdk.events.SdkEventBuffer
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Drop-in replacement for [android.util.Log] that also checks registered filters
 * and posts matching entries to the SDK event buffer.
 *
 * Zero overhead when no filters are registered: a single `filters.isEmpty()` check.
 * First-match semantics — only records once per log call.
 */
object AutoMobileLog {

  @Volatile private var buffer: SdkEventBuffer? = null
  @Volatile private var applicationId: String? = null
  private val filters = CopyOnWriteArrayList<CompiledLogFilter>()

  fun initialize(applicationId: String?, buffer: SdkEventBuffer) {
    this.applicationId = applicationId
    this.buffer = buffer
  }

  fun addFilter(
    name: String,
    tagPattern: Regex? = null,
    messagePattern: Regex? = null,
    minLevel: Int = Log.VERBOSE,
  ) {
    filters.add(CompiledLogFilter(name, tagPattern, messagePattern, minLevel))
  }

  fun removeFilter(name: String) {
    filters.removeAll { it.name == name }
  }

  fun clearFilters() {
    filters.clear()
  }

  fun v(tag: String, msg: String): Int {
    val result = Log.v(tag, msg)
    checkFilters(tag, msg, Log.VERBOSE)
    return result
  }

  fun v(tag: String, msg: String, tr: Throwable): Int {
    val result = Log.v(tag, msg, tr)
    checkFilters(tag, msg, Log.VERBOSE)
    return result
  }

  fun d(tag: String, msg: String): Int {
    val result = Log.d(tag, msg)
    checkFilters(tag, msg, Log.DEBUG)
    return result
  }

  fun d(tag: String, msg: String, tr: Throwable): Int {
    val result = Log.d(tag, msg, tr)
    checkFilters(tag, msg, Log.DEBUG)
    return result
  }

  fun i(tag: String, msg: String): Int {
    val result = Log.i(tag, msg)
    checkFilters(tag, msg, Log.INFO)
    return result
  }

  fun i(tag: String, msg: String, tr: Throwable): Int {
    val result = Log.i(tag, msg, tr)
    checkFilters(tag, msg, Log.INFO)
    return result
  }

  fun w(tag: String, msg: String): Int {
    val result = Log.w(tag, msg)
    checkFilters(tag, msg, Log.WARN)
    return result
  }

  fun w(tag: String, msg: String, tr: Throwable): Int {
    val result = Log.w(tag, msg, tr)
    checkFilters(tag, msg, Log.WARN)
    return result
  }

  fun e(tag: String, msg: String): Int {
    val result = Log.e(tag, msg)
    checkFilters(tag, msg, Log.ERROR)
    return result
  }

  fun e(tag: String, msg: String, tr: Throwable): Int {
    val result = Log.e(tag, msg, tr)
    checkFilters(tag, msg, Log.ERROR)
    return result
  }

  fun wtf(tag: String, msg: String): Int {
    Log.wtf(tag, msg)
    checkFilters(tag, msg, Log.ASSERT)
    return 0
  }

  fun wtf(tag: String, msg: String, tr: Throwable): Int {
    Log.wtf(tag, msg, tr)
    checkFilters(tag, msg, Log.ASSERT)
    return 0
  }

  private fun checkFilters(tag: String, message: String, level: Int) {
    if (filters.isEmpty()) return
    val buf = buffer ?: return

    // First-match semantics — only record once
    for (filter in filters) {
      if (filter.matches(tag, message, level)) {
        buf.add(
          SdkLogEvent(
            timestamp = System.currentTimeMillis(),
            applicationId = applicationId,
            level = level,
            tag = tag,
            message = message,
            filterName = filter.name,
          )
        )
        return
      }
    }
  }
}
