package dev.jasonpearson.automobile.sdk.logging

/**
 * A pre-compiled log filter with regex patterns for efficient matching.
 *
 * Matching order (cheapest first): level → tag → message.
 *
 * @param name Unique name identifying this filter (for event attribution)
 * @param tagPattern Optional regex to match against the log tag
 * @param messagePattern Optional regex to match against the log message
 * @param minLevel Minimum log level to match (VERBOSE=2, DEBUG=3, INFO=4, WARN=5, ERROR=6, ASSERT=7)
 */
data class CompiledLogFilter(
  val name: String,
  val tagPattern: Regex? = null,
  val messagePattern: Regex? = null,
  val minLevel: Int = 2, // android.util.Log.VERBOSE
) {

  /**
   * Check if a log entry matches this filter.
   *
   * @param tag The log tag
   * @param message The log message
   * @param level The log level
   * @return true if the entry matches all criteria
   */
  fun matches(tag: String, message: String, level: Int): Boolean {
    if (level < minLevel) return false
    if (tagPattern != null && !tagPattern.containsMatchIn(tag)) return false
    if (messagePattern != null && !messagePattern.containsMatchIn(message)) return false
    return true
  }
}
