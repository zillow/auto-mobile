package dev.jasonpearson.automobile.sdk.events

import android.content.Context
import android.content.Intent
import dev.jasonpearson.automobile.protocol.SdkEvent
import dev.jasonpearson.automobile.protocol.SdkEventBatch
import dev.jasonpearson.automobile.protocol.SdkEventSerializer

/**
 * Broadcasts batched SDK events via Intent for cross-process communication.
 *
 * Serializes events as [SdkEventBatch] JSON and sends via scoped broadcast Intent.
 * Caps batch JSON at [MAX_BATCH_BYTES] and splits if exceeded to respect
 * the Android Intent size limit (~1MB).
 */
object SdkEventBroadcaster {

  const val ACTION_SDK_EVENT_BATCH = "dev.jasonpearson.automobile.sdk.EVENT_BATCH"
  internal const val MAX_BATCH_BYTES = 500_000 // 500KB per Intent

  /**
   * Broadcast a batch of events. Called by [SdkEventBuffer] on flush.
   *
   * @param context Application context for sending broadcasts
   * @param events The events to broadcast
   */
  fun broadcastBatch(context: Context, events: List<SdkEvent>) {
    if (events.isEmpty()) return

    val batches = splitIntoBatches(events, context.packageName)
    for (json in batches) {
      sendBatchIntent(context, json)
    }
  }

  /**
   * Splits events into serialized JSON batches that each fit within [MAX_BATCH_BYTES].
   * Visible for testing.
   *
   * @param events The events to batch
   * @param applicationId Application ID for the batch envelope
   * @param maxBytes Maximum serialized size per batch
   * @return List of serialized JSON strings, one per batch
   */
  internal fun splitIntoBatches(
    events: List<SdkEvent>,
    applicationId: String?,
    maxBytes: Int = MAX_BATCH_BYTES,
  ): List<String> {
    if (events.isEmpty()) return emptyList()

    val json = serializeBatch(events, applicationId)
    if (json.toByteArray(Charsets.UTF_8).size <= maxBytes) {
      return listOf(json)
    }

    val midpoint = events.size / 2
    if (midpoint == 0) {
      // Single event that's too large — send it anyway
      return listOf(serializeBatch(events, null))
    }

    return splitIntoBatches(events.subList(0, midpoint), applicationId, maxBytes) +
      splitIntoBatches(events.subList(midpoint, events.size), applicationId, maxBytes)
  }

  private fun serializeBatch(events: List<SdkEvent>, applicationId: String?): String =
    SdkEventSerializer.toJson(
      SdkEventBatch(
        timestamp = System.currentTimeMillis(),
        applicationId = applicationId,
        events = events,
      )
    )

  private fun sendBatchIntent(context: Context, batchJson: String) {
    try {
      val intent = Intent(ACTION_SDK_EVENT_BATCH).apply {
        putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_JSON, batchJson)
        putExtra(SdkEventSerializer.EXTRA_SDK_EVENT_TYPE, SdkEventSerializer.EventTypes.EVENT_BATCH)
      }
      context.sendBroadcast(intent)
    } catch (_: Exception) {
      // Swallow — broadcasting is best-effort
    }
  }
}
