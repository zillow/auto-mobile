package dev.jasonpearson.automobile.accessibilityservice.perf

import java.time.Clock

/** Interface for providing current time in milliseconds. Uses Clock injection for testability. */
interface TimeProvider {
  /** Get current time in milliseconds (epoch time with nanoseconds stripped). */
  fun currentTimeMillis(): Long
}

/** Default implementation using system clock. */
class SystemTimeProvider(private val clock: Clock = Clock.systemUTC()) : TimeProvider {
  override fun currentTimeMillis(): Long {
    return clock.millis()
  }
}
