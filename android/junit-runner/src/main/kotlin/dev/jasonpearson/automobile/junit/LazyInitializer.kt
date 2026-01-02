package dev.jasonpearson.automobile.junit

/**
 * Phase 4 optimization: Lazy initialization of heavy components.
 * Delays expensive initialization until actually needed.
 */
object LazyInitializer {
  private var agentInitialized = false
  private var _agent: AutoMobileAgent? = null

  fun getAgent(): AutoMobileAgent {
    if (!agentInitialized) {
      _agent = AutoMobileAgent()
      agentInitialized = true
    }
    return _agent!!
  }

  fun clear() {
    _agent = null
    agentInitialized = false
  }
}
