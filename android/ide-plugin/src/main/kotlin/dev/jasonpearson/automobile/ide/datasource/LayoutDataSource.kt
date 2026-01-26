package dev.jasonpearson.automobile.ide.datasource

import dev.jasonpearson.automobile.ide.layout.UIElementInfo

/**
 * Complete observation data including hierarchy, screenshot, and dimensions.
 */
data class ObservationData(
    val hierarchy: UIElementInfo,
    val screenshotData: ByteArray? = null,
    val screenWidth: Int = 1080,
    val screenHeight: Int = 2340,
    val timestamp: Long = System.currentTimeMillis(),
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ObservationData) return false
        return hierarchy == other.hierarchy &&
            screenshotData.contentEquals(other.screenshotData) &&
            screenWidth == other.screenWidth &&
            screenHeight == other.screenHeight &&
            timestamp == other.timestamp
    }

    override fun hashCode(): Int {
        var result = hierarchy.hashCode()
        result = 31 * result + (screenshotData?.contentHashCode() ?: 0)
        result = 31 * result + screenWidth
        result = 31 * result + screenHeight
        result = 31 * result + timestamp.hashCode()
        return result
    }
}

interface LayoutDataSource {
    suspend fun getViewHierarchy(): Result<UIElementInfo>

    /**
     * Get the complete observation including hierarchy, screenshot, and screen dimensions.
     */
    suspend fun getObservation(): Result<ObservationData>
}
