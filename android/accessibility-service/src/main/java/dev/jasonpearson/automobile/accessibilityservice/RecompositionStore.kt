package dev.jasonpearson.automobile.accessibilityservice

import dev.jasonpearson.automobile.accessibilityservice.models.RecompositionEntry
import dev.jasonpearson.automobile.accessibilityservice.models.RecompositionSnapshot
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class RecompositionStore {
    private val entriesById = ConcurrentHashMap<String, RecompositionEntry>()
    private val enabled = AtomicBoolean(false)
    private val lastUpdatedAt = AtomicLong(0)
    private var lastApplicationId: String? = null

    fun setEnabled(isEnabled: Boolean) {
        enabled.set(isEnabled)
        if (!isEnabled) {
            clear()
        }
    }

    fun isEnabled(): Boolean = enabled.get()

    fun updateSnapshot(snapshot: RecompositionSnapshot) {
        if (!enabled.get()) {
            return
        }

        lastApplicationId = snapshot.applicationId
        lastUpdatedAt.set(snapshot.timestamp)
        entriesById.clear()

        snapshot.entries.forEach { entry ->
            entriesById[entry.id] = entry
        }
    }

    fun isForPackage(packageName: String?): Boolean {
        return packageName != null && packageName == lastApplicationId
    }

    fun findMatch(extras: Map<String, String>?): RecompositionEntry? {
        extras?.get(RECOMPOSITION_ID_KEY)?.let { id ->
            entriesById[id]?.let { return it }
        }

        return null
    }

    private fun clear() {
        entriesById.clear()
        lastUpdatedAt.set(0)
        lastApplicationId = null
    }

    companion object {
        const val RECOMPOSITION_ID_KEY = "auto-mobile-recomposition-id"
    }
}
