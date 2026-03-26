package dev.jasonpearson.automobile.junit

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Provides AI recovery configuration values. */
interface RecoveryConfigProvider {
  /** Whether the ai-recovery feature flag is enabled. */
  fun isRecoveryEnabled(): Boolean

  /** Maximum number of tool calls the Koog agent may use during a single recovery attempt. */
  fun getMaxRecoveryToolCalls(): Int
}

/**
 * Reads recovery config from the daemon's feature-flag resource.
 *
 * The value is cached with a TTL so runtime changes to the feature flag take effect without
 * restarting the JVM. The default TTL is 30 seconds — short enough to pick up a kill-switch
 * toggle within a test suite run, long enough to avoid per-test daemon round-trips.
 */
class DaemonRecoveryConfigProvider(
    private val cacheTtlMs: Long = DEFAULT_CACHE_TTL_MS,
    private val clock: () -> Long = System::currentTimeMillis,
) : RecoveryConfigProvider {

  private data class CachedEntry(val config: CachedConfig, val fetchedAt: Long)
  private data class CachedConfig(val enabled: Boolean, val maxToolCalls: Int)

  @Volatile private var cached: CachedEntry? = null

  override fun isRecoveryEnabled(): Boolean = getConfig().enabled

  override fun getMaxRecoveryToolCalls(): Int = getConfig().maxToolCalls

  private fun getConfig(): CachedConfig {
    val entry = cached
    if (entry != null && (clock() - entry.fetchedAt) < cacheTtlMs) {
      return entry.config
    }

    val config =
        try {
          val response =
              DaemonSocketClientManager.readResource(
                  "automobile:config/feature-flags/ai-recovery",
                  5000L,
              )
          if (!response.success || response.result == null) {
            CachedConfig(DEFAULT_ENABLED, DEFAULT_MAX_TOOL_CALLS)
          } else {
            parseConfig(response)
          }
        } catch (e: Exception) {
          println("Warning: Failed to read ai-recovery config from daemon: ${e.message}")
          CachedConfig(DEFAULT_ENABLED, DEFAULT_MAX_TOOL_CALLS)
        }

    cached = CachedEntry(config, clock())
    return config
  }

  private fun parseConfig(response: DaemonResponse): CachedConfig {
    val json = Json { ignoreUnknownKeys = true }
    val resultObj = response.result?.jsonObject
        ?: return CachedConfig(DEFAULT_ENABLED, DEFAULT_MAX_TOOL_CALLS)
    val contents = resultObj["contents"]
        ?: return CachedConfig(DEFAULT_ENABLED, DEFAULT_MAX_TOOL_CALLS)
    val firstContent = contents as? kotlinx.serialization.json.JsonArray
        ?: return CachedConfig(DEFAULT_ENABLED, DEFAULT_MAX_TOOL_CALLS)
    if (firstContent.isEmpty()) return CachedConfig(DEFAULT_ENABLED, DEFAULT_MAX_TOOL_CALLS)
    val text = firstContent[0].jsonObject["text"]?.jsonPrimitive?.content
        ?: return CachedConfig(DEFAULT_ENABLED, DEFAULT_MAX_TOOL_CALLS)

    val body = json.parseToJsonElement(text).jsonObject
    val enabled = body["enabled"]?.jsonPrimitive?.content?.toBooleanStrictOrNull()
        ?: DEFAULT_ENABLED
    val configObj = body["config"]?.jsonObject
    val maxToolCalls = try {
      configObj?.get("maxToolCalls")?.jsonPrimitive?.intOrNull ?: DEFAULT_MAX_TOOL_CALLS
    } catch (_: Exception) {
      DEFAULT_MAX_TOOL_CALLS
    }
    return CachedConfig(enabled, maxToolCalls)
  }

  companion object {
    internal const val DEFAULT_ENABLED = true
    internal const val DEFAULT_MAX_TOOL_CALLS = 5
    internal const val DEFAULT_CACHE_TTL_MS = 30_000L
  }
}

/** Fixed config for use in tests. */
class StaticRecoveryConfigProvider(
    private val enabled: Boolean = true,
    private val maxToolCalls: Int = 5,
) : RecoveryConfigProvider {
  override fun isRecoveryEnabled(): Boolean = enabled
  override fun getMaxRecoveryToolCalls(): Int = maxToolCalls
}
