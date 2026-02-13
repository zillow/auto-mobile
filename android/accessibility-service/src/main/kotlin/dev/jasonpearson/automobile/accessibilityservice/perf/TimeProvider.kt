package dev.jasonpearson.automobile.accessibilityservice.perf

/** Interface for providing current time in milliseconds. */
interface TimeProvider {
  /** Get current time in milliseconds (epoch time). */
  fun currentTimeMillis(): Long
}

/** Default implementation using System.currentTimeMillis() (API 1+). */
class SystemTimeProvider : TimeProvider {
  override fun currentTimeMillis(): Long {
    return System.currentTimeMillis()
  }
}
