package dev.jasonpearson.automobile.ide.time

import kotlinx.coroutines.delay

interface Delayer {
    suspend fun delay(durationMs: Long)
}

object RealDelayer : Delayer {
    override suspend fun delay(durationMs: Long) {
        delay(durationMs)
    }
}

class FakeDelayer : Delayer {
    private val pendingDelays = mutableListOf<Long>()
    private var autoAdvance = false

    override suspend fun delay(durationMs: Long) {
        if (!autoAdvance) {
            pendingDelays.add(durationMs)
        }
        // In fake mode, delays complete immediately
    }

    fun getPendingDelays(): List<Long> = pendingDelays.toList()

    fun clearPendingDelays() {
        pendingDelays.clear()
    }

    fun setAutoAdvance(enabled: Boolean) {
        autoAdvance = enabled
    }
}
