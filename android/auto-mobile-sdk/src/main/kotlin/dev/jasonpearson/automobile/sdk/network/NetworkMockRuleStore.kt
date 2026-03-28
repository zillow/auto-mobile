package dev.jasonpearson.automobile.sdk.network

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import dev.jasonpearson.automobile.protocol.NetworkMockRuleDto
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Thread-safe store for network mock rules and error simulation config.
 *
 * Updated via BroadcastReceiver from control-proxy process.
 * Queried by [AutoMobileNetworkInterceptor] on every HTTP request.
 */
class NetworkMockRuleStore(private val clock: () -> Long = { System.currentTimeMillis() }) {

  companion object {
    private const val TAG = "NetworkMockRuleStore"
    const val ACTION_NETWORK_MOCK_RULES = "dev.jasonpearson.automobile.sdk.NETWORK_MOCK_RULES"
    const val ACTION_NETWORK_ERROR_SIMULATION =
        "dev.jasonpearson.automobile.sdk.NETWORK_ERROR_SIMULATION"
    const val EXTRA_RULES_JSON = "rules_json"
    const val EXTRA_ERROR_SIM_ENABLED = "enabled"
    const val EXTRA_ERROR_SIM_TYPE = "error_type"
    const val EXTRA_ERROR_SIM_LIMIT = "limit"
    const val EXTRA_ERROR_SIM_EXPIRES_AT = "expires_at"
    private const val PERMISSION_NETWORK_CONTROL =
        "dev.jasonpearson.automobile.sdk.permission.NETWORK_CONTROL"

    @Volatile private var instance: NetworkMockRuleStore? = null

    fun getInstance(): NetworkMockRuleStore {
      return instance ?: synchronized(this) { instance ?: NetworkMockRuleStore().also { instance = it } }
    }

    fun initialize(context: Context) {
      getInstance().registerReceiver(context)
    }
  }

  /** Interface for the interceptor to query rules without depending on the full store. */
  interface RuleMatcher {
    fun findMatchingRule(host: String, path: String, method: String): MatchedMockRule?
    fun getErrorSimulation(): ErrorSimulationConfig?
  }

  data class CompiledMockRule(
      val mockId: String,
      val hostRegex: Regex,
      val pathRegex: Regex,
      val method: String,
      val limit: Int?,
      val remaining: AtomicInteger?,
      val statusCode: Int,
      val responseHeaders: Map<String, String>,
      val responseBody: String,
      val contentType: String,
  )

  data class MatchedMockRule(
      val mockId: String,
      val statusCode: Int,
      val responseHeaders: Map<String, String>,
      val responseBody: String,
      val contentType: String,
  )

  data class ErrorSimulationConfig(
      val errorType: String,
      val limit: Int?,
      val remaining: AtomicInteger?,
      val expiresAtEpochMs: Long,
  )

  private val rules = CopyOnWriteArrayList<CompiledMockRule>()
  @Volatile private var errorSimulation: ErrorSimulationConfig? = null

  private val json = Json { ignoreUnknownKeys = true }

  val ruleMatcher: RuleMatcher =
      object : RuleMatcher {
        override fun findMatchingRule(
            host: String,
            path: String,
            method: String
        ): MatchedMockRule? {
          return this@NetworkMockRuleStore.findMatchingRule(host, path, method)
        }

        override fun getErrorSimulation(): ErrorSimulationConfig? {
          return this@NetworkMockRuleStore.getActiveErrorSimulation()
        }
      }

  fun setRules(dtos: List<NetworkMockRuleDto>) {
    rules.clear()
    for (dto in dtos) {
      try {
        rules.add(
            CompiledMockRule(
                mockId = dto.mockId,
                hostRegex = Regex(dto.host),
                pathRegex = Regex(dto.path),
                method = dto.method,
                limit = dto.limit,
                remaining = dto.remaining?.let { AtomicInteger(it) },
                statusCode = dto.statusCode,
                responseHeaders = dto.responseHeaders,
                responseBody = dto.responseBody,
                contentType = dto.contentType,
            ))
      } catch (e: Exception) {
        Log.w(TAG, "Skipping mock rule ${dto.mockId}: invalid regex: ${e.message}")
      }
    }
    Log.d(TAG, "Updated mock rules: ${rules.size} active")
  }

  fun setErrorSimulation(
      enabled: Boolean,
      errorType: String?,
      limit: Int?,
      expiresAtEpochMs: Long?
  ) {
    errorSimulation =
        if (enabled && errorType != null && expiresAtEpochMs != null) {
          ErrorSimulationConfig(
              errorType = errorType,
              limit = limit,
              remaining = limit?.let { AtomicInteger(it) },
              expiresAtEpochMs = expiresAtEpochMs,
          )
        } else {
          null
        }
    Log.d(TAG, "Error simulation: ${if (enabled) errorType else "disabled"}")
  }

  fun findMatchingRule(host: String, path: String, method: String): MatchedMockRule? {
    for (rule in rules) {
      if (rule.method != "*" && !rule.method.equals(method, ignoreCase = true)) continue
      if (!rule.hostRegex.containsMatchIn(host)) continue
      if (!rule.pathRegex.containsMatchIn(path)) continue

      // Check remaining limit
      val remaining = rule.remaining
      if (remaining != null) {
        val left = remaining.decrementAndGet()
        if (left < 0) continue
      }

      return MatchedMockRule(
          mockId = rule.mockId,
          statusCode = rule.statusCode,
          responseHeaders = rule.responseHeaders,
          responseBody = rule.responseBody,
          contentType = rule.contentType,
      )
    }
    return null
  }

  fun getActiveErrorSimulation(): ErrorSimulationConfig? {
    val sim = errorSimulation ?: return null
    if (clock() >= sim.expiresAtEpochMs) {
      errorSimulation = null
      return null
    }
    val remaining = sim.remaining
    if (remaining != null) {
      val left = remaining.decrementAndGet()
      if (left < 0) {
        errorSimulation = null
        return null
      }
    }
    return sim
  }

  fun clear() {
    rules.clear()
    errorSimulation = null
  }

  fun getRuleCount(): Int = rules.size

  fun registerReceiver(context: Context) {
    val filter =
        IntentFilter().apply {
          addAction(ACTION_NETWORK_MOCK_RULES)
          addAction(ACTION_NETWORK_ERROR_SIMULATION)
        }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(
          receiver, filter, PERMISSION_NETWORK_CONTROL, null, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter, PERMISSION_NETWORK_CONTROL, null)
    }
    Log.d(TAG, "Registered broadcast receiver for network mock rules (permission-gated)")
  }

  fun unregisterReceiver(context: Context) {
    try {
      context.unregisterReceiver(receiver)
    } catch (_: Exception) {}
  }

  private val receiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent == null) return
          when (intent.action) {
            ACTION_NETWORK_MOCK_RULES -> {
              val rulesJson = intent.getStringExtra(EXTRA_RULES_JSON) ?: return
              try {
                val dtos =
                    json.decodeFromString(
                        ListSerializer(NetworkMockRuleDto.serializer()), rulesJson)
                setRules(dtos)
              } catch (e: Exception) {
                Log.e(TAG, "Failed to parse mock rules: ${e.message}")
              }
            }
            ACTION_NETWORK_ERROR_SIMULATION -> {
              val enabled = intent.getBooleanExtra(EXTRA_ERROR_SIM_ENABLED, false)
              val errorType = intent.getStringExtra(EXTRA_ERROR_SIM_TYPE)
              val limit =
                  intent.getIntExtra(EXTRA_ERROR_SIM_LIMIT, -1).let { if (it == -1) null else it }
              val expiresAt =
                  intent.getLongExtra(EXTRA_ERROR_SIM_EXPIRES_AT, -1).let {
                    if (it == -1L) null else it
                  }
              setErrorSimulation(enabled, errorType, limit, expiresAt)
            }
          }
        }
      }
}
