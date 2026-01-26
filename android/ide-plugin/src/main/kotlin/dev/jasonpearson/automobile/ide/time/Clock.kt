package dev.jasonpearson.automobile.ide.time

interface Clock {
    fun nowMs(): Long
}

object SystemClock : Clock {
    override fun nowMs(): Long = System.currentTimeMillis()
}

class FakeClock(initialMs: Long = 0L) : Clock {
    private var nowMs: Long = initialMs

    override fun nowMs(): Long = nowMs

    fun advanceBy(deltaMs: Long) {
        nowMs += deltaMs
    }

    fun setTime(ms: Long) {
        nowMs = ms
    }
}
