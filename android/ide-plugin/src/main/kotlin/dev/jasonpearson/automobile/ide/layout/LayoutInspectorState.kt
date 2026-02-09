package dev.jasonpearson.automobile.ide.layout

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

/**
 * State holder for the Layout Inspector.
 * Manages:
 * - Screenshot data and streaming
 * - View hierarchy
 * - Selection state
 * - Connection status
 * - Changed element tracking for visual feedback
 *
 * Phase 1: Uses mock data
 * Phase 2: Will add WebSocket connection for live data
 */
class LayoutInspectorState {
    // Connection state
    var connectionStatus by mutableStateOf(ConnectionStatus.Disconnected)
        private set

    var streamingMode by mutableStateOf(StreamingMode.Paused)
        private set

    // Screenshot state
    var screenshotData by mutableStateOf<ByteArray?>(null)
        private set

    var screenWidth by mutableStateOf(1080)
        private set

    var screenHeight by mutableStateOf(2340)
        private set

    var lastScreenshotTimestamp by mutableStateOf(0L)
        private set

    // Hierarchy state
    var hierarchy by mutableStateOf<UIElementInfo?>(null)
        private set

    // Changed elements tracking - IDs of elements that changed in the last update
    // Used to trigger flash animations in the tree view
    var changedElementIds by mutableStateOf<Set<String>>(emptySet())
        private set

    // Selection state
    var selectedElementId by mutableStateOf<String?>(null)
        private set

    var hoveredElementId by mutableStateOf<String?>(null)
        private set

    // Tap target compliance highlighting
    var showTapTargetIssues by mutableStateOf(false)
        private set

    // Selected element (computed from hierarchy and selectedElementId)
    val selectedElement: UIElementInfo?
        get() = hierarchy?.let { root ->
            selectedElementId?.let { id ->
                LayoutInspectorMockData.findElementById(root, id)
            }
        }

    // Initialize with mock data for Phase 1
    init {
        loadMockData()
    }

    /**
     * Load mock data for development/testing.
     */
    fun loadMockData() {
        hierarchy = LayoutInspectorMockData.mockHierarchy
        connectionStatus = ConnectionStatus.Connected
        streamingMode = StreamingMode.Paused
    }

    /**
     * Set the selected element by ID.
     */
    fun selectElement(elementId: String?) {
        selectedElementId = elementId
    }

    /**
     * Set the hovered element by ID.
     */
    fun hoverElement(elementId: String?) {
        hoveredElementId = elementId
    }

    /**
     * Toggle tap target compliance highlighting.
     */
    fun toggleTapTargetIssues() {
        showTapTargetIssues = !showTapTargetIssues
    }

    /**
     * Clear selection.
     */
    fun clearSelection() {
        selectedElementId = null
    }

    /**
     * Toggle streaming mode (live/paused).
     */
    fun toggleStreaming() {
        streamingMode = when (streamingMode) {
            StreamingMode.Live -> StreamingMode.Paused
            StreamingMode.Paused -> StreamingMode.Live
        }
    }

    /**
     * Update streaming mode.
     */
    fun updateStreamingMode(mode: StreamingMode) {
        streamingMode = mode
    }

    /**
     * Refresh the hierarchy from the device.
     * Phase 1: Reloads mock data
     * Phase 2: Will request fresh data via WebSocket
     */
    fun refreshHierarchy() {
        // Phase 1: Just reload mock data
        hierarchy = LayoutInspectorMockData.mockHierarchy
        lastScreenshotTimestamp = System.currentTimeMillis()
    }

    /**
     * Update screenshot data.
     * Called when receiving screenshot frames from device.
     */
    fun updateScreenshot(data: ByteArray, width: Int, height: Int, timestamp: Long) {
        screenshotData = data
        screenWidth = width
        screenHeight = height
        lastScreenshotTimestamp = timestamp
    }

    /**
     * Update hierarchy data.
     * Called when receiving hierarchy updates from device.
     * Detects changed elements and tracks them for visual feedback.
     * Clears selection if the selected element is no longer in the hierarchy.
     */
    fun updateHierarchy(newHierarchy: UIElementInfo) {
        // Detect changed elements by comparing with the previous hierarchy
        val oldHierarchy = hierarchy
        changedElementIds = if (oldHierarchy != null) {
            findChangedElements(oldHierarchy, newHierarchy)
        } else {
            emptySet()
        }

        // Always update - Compose will efficiently diff the actual UI changes.
        hierarchy = newHierarchy

        // Clear selection if the selected element no longer exists in the new hierarchy
        val currentSelectedId = selectedElementId
        if (currentSelectedId != null) {
            val newElementsById = flattenToMap(newHierarchy)
            if (!newElementsById.containsKey(currentSelectedId)) {
                selectedElementId = null
            }
        }
    }

    /**
     * Clear the changed elements set.
     * Called after flash animation completes.
     */
    fun clearChangedElements() {
        changedElementIds = emptySet()
    }

    /**
     * Find elements that changed between two hierarchies.
     * Compares elements by their stable ID and detects property changes.
     */
    private fun findChangedElements(old: UIElementInfo, new: UIElementInfo): Set<String> {
        val changedIds = mutableSetOf<String>()
        val oldElementsById = flattenToMap(old)
        val newElementsById = flattenToMap(new)

        // Find elements that exist in both but have changed properties
        for ((id, newElement) in newElementsById) {
            val oldElement = oldElementsById[id]
            if (oldElement == null) {
                // New element appeared
                changedIds.add(id)
            } else if (hasElementChanged(oldElement, newElement)) {
                // Existing element changed
                changedIds.add(id)
            }
        }

        // Elements that were removed don't need to flash (they're gone)

        return changedIds
    }

    /**
     * Check if an element's visible properties have changed.
     */
    private fun hasElementChanged(old: UIElementInfo, new: UIElementInfo): Boolean {
        return old.text != new.text ||
            old.contentDescription != new.contentDescription ||
            old.bounds != new.bounds ||
            old.isClickable != new.isClickable ||
            old.isEnabled != new.isEnabled ||
            old.isFocused != new.isFocused ||
            old.isSelected != new.isSelected ||
            old.isScrollable != new.isScrollable ||
            old.isCheckable != new.isCheckable ||
            old.isChecked != new.isChecked ||
            old.children.size != new.children.size
    }

    /**
     * Flatten hierarchy into a map by element ID for efficient lookup.
     */
    private fun flattenToMap(root: UIElementInfo): Map<String, UIElementInfo> {
        val result = mutableMapOf<String, UIElementInfo>()
        fun traverse(element: UIElementInfo) {
            result[element.id] = element
            element.children.forEach { traverse(it) }
        }
        traverse(root)
        return result
    }

    /**
     * Connect to device.
     * Phase 1: Simulates connection
     * Phase 2: Will establish WebSocket connection
     */
    fun connect() {
        connectionStatus = ConnectionStatus.Connecting
        // Simulate connection delay then connect
        connectionStatus = ConnectionStatus.Connected
        loadMockData()
    }

    /**
     * Update connection status externally (e.g., from stream connection state).
     */
    fun updateConnectionStatus(status: ConnectionStatus) {
        connectionStatus = status
    }

    /**
     * Disconnect from device. Clears all device-specific stale data.
     */
    fun disconnect() {
        connectionStatus = ConnectionStatus.Disconnected
        streamingMode = StreamingMode.Paused
        screenshotData = null
        hierarchy = null
        selectedElementId = null
        hoveredElementId = null
        changedElementIds = emptySet()
    }

    // ========================================
    // Phase 2: WebSocket methods (stubs for now)
    // ========================================

    /**
     * Start screenshot streaming.
     * Phase 2: Will send subscribe_screenshots message via WebSocket.
     */
    fun startScreenshotStream(intervalMs: Int = 100, quality: Int = 70) {
        streamingMode = StreamingMode.Live
        // Phase 2: Send WebSocket message
        // { "type": "subscribe_screenshots", "intervalMs": intervalMs, "quality": quality }
    }

    /**
     * Stop screenshot streaming.
     * Phase 2: Will send unsubscribe_screenshots message via WebSocket.
     */
    fun stopScreenshotStream() {
        streamingMode = StreamingMode.Paused
        // Phase 2: Send WebSocket message
        // { "type": "unsubscribe_screenshots" }
    }
}

/**
 * Remember a LayoutInspectorState instance scoped to composition.
 */
@Composable
fun rememberLayoutInspectorState(): LayoutInspectorState {
    return remember { LayoutInspectorState() }
}
