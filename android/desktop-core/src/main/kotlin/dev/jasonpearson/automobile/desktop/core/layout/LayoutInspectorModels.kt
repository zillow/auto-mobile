package dev.jasonpearson.automobile.desktop.core.layout

/**
 * Represents a UI element in the view hierarchy.
 * This maps to accessibility node data from the device.
 */
data class UIElementInfo(
    val id: String,
    val className: String,
    val resourceId: String?,
    val text: String?,
    val contentDescription: String?,
    val bounds: ElementBounds,
    val isClickable: Boolean,
    val isEnabled: Boolean,
    val isFocused: Boolean,
    val isSelected: Boolean,
    val isScrollable: Boolean,
    val isCheckable: Boolean,
    val isChecked: Boolean,
    val children: List<UIElementInfo>,
    val depth: Int,
)

/**
 * Element bounds in screen coordinates (pixels).
 */
data class ElementBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    val width: Int get() = right - left
    val height: Int get() = bottom - top
    val centerX: Int get() = left + width / 2
    val centerY: Int get() = top + height / 2

    fun contains(x: Int, y: Int): Boolean =
        x >= left && x < right && y >= top && y < bottom
}

/**
 * Screenshot frame data received from the device.
 */
data class ScreenshotFrame(
    val data: ByteArray,
    val width: Int,
    val height: Int,
    val timestamp: Long,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ScreenshotFrame) return false
        return timestamp == other.timestamp && width == other.width && height == other.height
    }

    override fun hashCode(): Int {
        var result = timestamp.hashCode()
        result = 31 * result + width
        result = 31 * result + height
        return result
    }
}

/**
 * Connection status for the layout inspector.
 */
enum class ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

/**
 * Streaming mode for screenshot updates.
 */
enum class StreamingMode {
    Paused,
    Live,
}

/**
 * Minimum tap target size in dp as per Android accessibility guidelines.
 * Touch targets should be at least 48x48dp for comfortable tapping.
 */
const val MIN_TAP_TARGET_DP = 48

/**
 * Standard phone screen width in dp (used as baseline for density estimation).
 * Most modern phones (Pixel, Samsung Galaxy, etc.) report ~411-412dp width.
 * Using 411dp gives accurate density estimates for xxhdpi (420dpi) devices.
 */
private const val STANDARD_PHONE_WIDTH_DP = 411

/**
 * Calculate minimum tap target size in pixels based on screen dimensions.
 *
 * Uses the shorter screen dimension to estimate density, which provides
 * more consistent results across orientation changes (portrait/landscape).
 *
 * Common device densities:
 * - 720px width → ~1.75x density (hdpi/xhdpi)
 * - 1080px width → ~2.63x density (xxhdpi/420dpi)
 * - 1440px width → ~3.5x density (xxxhdpi)
 *
 * @param screenWidthPx The screen width in pixels
 * @param screenHeightPx The screen height in pixels
 * @return The minimum tap target size in pixels
 */
fun calculateMinTapTargetPx(screenWidthPx: Int, screenHeightPx: Int): Int {
    // Use the shorter dimension for more stable density estimation across orientations.
    // A 1080x1920 screen in portrait and 1920x1080 in landscape both use 1080.
    val shorterDimension = minOf(screenWidthPx, screenHeightPx)

    // Estimate density: most phones have ~411dp on the shorter edge
    val estimatedDensity = shorterDimension.toFloat() / STANDARD_PHONE_WIDTH_DP
    return (MIN_TAP_TARGET_DP * estimatedDensity).toInt()
}

/**
 * Check if an element is a non-compliant tap target.
 * An element is non-compliant if it's clickable but smaller than 48x48dp.
 *
 * @param element The element to check
 * @param minSizePx The minimum tap target size in pixels
 * @return True if the element is clickable but too small
 */
fun isNonCompliantTapTarget(element: UIElementInfo, minSizePx: Int): Boolean {
    if (!element.isClickable) return false
    return element.bounds.width < minSizePx || element.bounds.height < minSizePx
}

/**
 * Check if an element has any clickable descendants.
 * Used to filter out container elements that just pass through clicks.
 */
private fun hasClickableDescendant(element: UIElementInfo): Boolean {
    for (child in element.children) {
        if (child.isClickable) return true
        if (hasClickableDescendant(child)) return true
    }
    return false
}

/**
 * Find all non-compliant tap targets in a hierarchy.
 * Returns elements that are clickable but smaller than 48x48dp.
 *
 * Filters out:
 * - Elements with clickable descendants (these are likely container pass-throughs)
 * - Elements that are likely decorative (no text, content description, or resource ID)
 *
 * @param root The root of the hierarchy to search
 * @param screenWidthPx The screen width in pixels
 * @param screenHeightPx The screen height in pixels
 * @return List of non-compliant clickable elements
 */
fun findNonCompliantTapTargets(
    root: UIElementInfo,
    screenWidthPx: Int,
    screenHeightPx: Int,
): List<UIElementInfo> {
    val minSizePx = calculateMinTapTargetPx(screenWidthPx, screenHeightPx)
    val result = mutableListOf<UIElementInfo>()

    fun traverse(element: UIElementInfo) {
        if (isNonCompliantTapTarget(element, minSizePx)) {
            // Skip elements that have clickable descendants - they're likely containers
            // that delegate click handling to children
            if (!hasClickableDescendant(element)) {
                // Only flag elements that appear to be interactive (have identifying info)
                val hasIdentifyingInfo = !element.resourceId.isNullOrEmpty() ||
                    !element.text.isNullOrEmpty() ||
                    !element.contentDescription.isNullOrEmpty()
                if (hasIdentifyingInfo) {
                    result.add(element)
                }
            }
        }
        element.children.forEach { traverse(it) }
    }

    traverse(root)
    return result
}

/**
 * Pre-computed hierarchy with lookup indexes built during parsing.
 * Eliminates the need for repeated tree traversals.
 */
data class ParsedHierarchy(
    val root: UIElementInfo,
    val elementMap: Map<String, UIElementInfo>,
    val parentMap: Map<String, String>,
    /** Display rotation: 0=portrait, 1=landscape 90deg, 2=reverse portrait, 3=reverse landscape */
    val rotation: Int = 0,
)

/**
 * Build the path from root to [targetId] using the pre-computed parent map.
 * Returns a list of element IDs from root to target (inclusive).
 * O(depth) instead of O(n) DFS.
 */
fun getPathFromParentMap(parentMap: Map<String, String>, targetId: String): List<String> {
    val path = mutableListOf(targetId)
    var current = targetId
    while (parentMap.containsKey(current)) {
        current = parentMap[current]!!
        path.add(0, current)
    }
    return path
}

// Mock data for development
object LayoutInspectorMockData {

    val mockHierarchy = UIElementInfo(
        id = "root",
        className = "android.widget.FrameLayout",
        resourceId = "android:id/content",
        text = null,
        contentDescription = null,
        bounds = ElementBounds(0, 0, 1080, 2340),
        isClickable = false,
        isEnabled = true,
        isFocused = false,
        isSelected = false,
        isScrollable = false,
        isCheckable = false,
        isChecked = false,
        depth = 0,
        children = listOf(
            UIElementInfo(
                id = "toolbar_container",
                className = "androidx.appcompat.widget.Toolbar",
                resourceId = "com.chat.app:id/toolbar",
                text = null,
                contentDescription = null,
                bounds = ElementBounds(0, 84, 1080, 224),
                isClickable = false,
                isEnabled = true,
                isFocused = false,
                isSelected = false,
                isScrollable = false,
                isCheckable = false,
                isChecked = false,
                depth = 1,
                children = listOf(
                    UIElementInfo(
                        id = "nav_back",
                        className = "android.widget.ImageButton",
                        resourceId = "com.chat.app:id/btn_back",
                        text = null,
                        contentDescription = "Navigate back",
                        bounds = ElementBounds(16, 100, 88, 172),
                        isClickable = true,
                        isEnabled = true,
                        isFocused = false,
                        isSelected = false,
                        isScrollable = false,
                        isCheckable = false,
                        isChecked = false,
                        depth = 2,
                        children = emptyList(),
                    ),
                    UIElementInfo(
                        id = "title",
                        className = "android.widget.TextView",
                        resourceId = "com.chat.app:id/toolbar_title",
                        text = "Chat",
                        contentDescription = null,
                        bounds = ElementBounds(104, 108, 400, 164),
                        isClickable = false,
                        isEnabled = true,
                        isFocused = false,
                        isSelected = false,
                        isScrollable = false,
                        isCheckable = false,
                        isChecked = false,
                        depth = 2,
                        children = emptyList(),
                    ),
                    UIElementInfo(
                        id = "menu_more",
                        className = "android.widget.ImageButton",
                        resourceId = "com.chat.app:id/btn_menu",
                        text = null,
                        contentDescription = "More options",
                        bounds = ElementBounds(992, 100, 1064, 172),
                        isClickable = true,
                        isEnabled = true,
                        isFocused = false,
                        isSelected = false,
                        isScrollable = false,
                        isCheckable = false,
                        isChecked = false,
                        depth = 2,
                        children = emptyList(),
                    ),
                ),
            ),
            UIElementInfo(
                id = "recycler_messages",
                className = "androidx.recyclerview.widget.RecyclerView",
                resourceId = "com.chat.app:id/message_list",
                text = null,
                contentDescription = null,
                bounds = ElementBounds(0, 224, 1080, 2140),
                isClickable = false,
                isEnabled = true,
                isFocused = false,
                isSelected = false,
                isScrollable = true,
                isCheckable = false,
                isChecked = false,
                depth = 1,
                children = listOf(
                    UIElementInfo(
                        id = "msg_1",
                        className = "android.widget.LinearLayout",
                        resourceId = null,
                        text = null,
                        contentDescription = null,
                        bounds = ElementBounds(16, 240, 800, 360),
                        isClickable = true,
                        isEnabled = true,
                        isFocused = false,
                        isSelected = false,
                        isScrollable = false,
                        isCheckable = false,
                        isChecked = false,
                        depth = 2,
                        children = listOf(
                            UIElementInfo(
                                id = "msg_1_text",
                                className = "android.widget.TextView",
                                resourceId = "com.chat.app:id/message_text",
                                text = "Hey! How are you?",
                                contentDescription = null,
                                bounds = ElementBounds(32, 256, 784, 344),
                                isClickable = false,
                                isEnabled = true,
                                isFocused = false,
                                isSelected = false,
                                isScrollable = false,
                                isCheckable = false,
                                isChecked = false,
                                depth = 3,
                                children = emptyList(),
                            ),
                        ),
                    ),
                    UIElementInfo(
                        id = "msg_2",
                        className = "android.widget.LinearLayout",
                        resourceId = null,
                        text = null,
                        contentDescription = null,
                        bounds = ElementBounds(280, 380, 1064, 520),
                        isClickable = true,
                        isEnabled = true,
                        isFocused = false,
                        isSelected = false,
                        isScrollable = false,
                        isCheckable = false,
                        isChecked = false,
                        depth = 2,
                        children = listOf(
                            UIElementInfo(
                                id = "msg_2_text",
                                className = "android.widget.TextView",
                                resourceId = "com.chat.app:id/message_text",
                                text = "I'm doing great! Just finished a project.",
                                contentDescription = null,
                                bounds = ElementBounds(296, 396, 1048, 504),
                                isClickable = false,
                                isEnabled = true,
                                isFocused = false,
                                isSelected = false,
                                isScrollable = false,
                                isCheckable = false,
                                isChecked = false,
                                depth = 3,
                                children = emptyList(),
                            ),
                        ),
                    ),
                    UIElementInfo(
                        id = "msg_3",
                        className = "android.widget.LinearLayout",
                        resourceId = null,
                        text = null,
                        contentDescription = null,
                        bounds = ElementBounds(16, 540, 700, 660),
                        isClickable = true,
                        isEnabled = true,
                        isFocused = false,
                        isSelected = false,
                        isScrollable = false,
                        isCheckable = false,
                        isChecked = false,
                        depth = 2,
                        children = listOf(
                            UIElementInfo(
                                id = "msg_3_text",
                                className = "android.widget.TextView",
                                resourceId = "com.chat.app:id/message_text",
                                text = "That's awesome! What kind of project?",
                                contentDescription = null,
                                bounds = ElementBounds(32, 556, 684, 644),
                                isClickable = false,
                                isEnabled = true,
                                isFocused = false,
                                isSelected = false,
                                isScrollable = false,
                                isCheckable = false,
                                isChecked = false,
                                depth = 3,
                                children = emptyList(),
                            ),
                        ),
                    ),
                ),
            ),
            UIElementInfo(
                id = "input_container",
                className = "android.widget.LinearLayout",
                resourceId = "com.chat.app:id/input_area",
                text = null,
                contentDescription = null,
                bounds = ElementBounds(0, 2140, 1080, 2260),
                isClickable = false,
                isEnabled = true,
                isFocused = false,
                isSelected = false,
                isScrollable = false,
                isCheckable = false,
                isChecked = false,
                depth = 1,
                children = listOf(
                    UIElementInfo(
                        id = "attach_button",
                        className = "android.widget.ImageButton",
                        resourceId = "com.chat.app:id/btn_attach",
                        text = null,
                        contentDescription = "Attach file",
                        bounds = ElementBounds(16, 2156, 88, 2228),
                        isClickable = true,
                        isEnabled = true,
                        isFocused = false,
                        isSelected = false,
                        isScrollable = false,
                        isCheckable = false,
                        isChecked = false,
                        depth = 2,
                        children = emptyList(),
                    ),
                    UIElementInfo(
                        id = "message_input",
                        className = "android.widget.EditText",
                        resourceId = "com.chat.app:id/input_message",
                        text = "",
                        contentDescription = "Type a message",
                        bounds = ElementBounds(104, 2156, 904, 2228),
                        isClickable = true,
                        isEnabled = true,
                        isFocused = true,
                        isSelected = false,
                        isScrollable = false,
                        isCheckable = false,
                        isChecked = false,
                        depth = 2,
                        children = emptyList(),
                    ),
                    UIElementInfo(
                        id = "send_button",
                        className = "android.widget.ImageButton",
                        resourceId = "com.chat.app:id/btn_send",
                        text = null,
                        contentDescription = "Send message",
                        bounds = ElementBounds(920, 2156, 1064, 2228),
                        isClickable = true,
                        isEnabled = true,
                        isFocused = false,
                        isSelected = false,
                        isScrollable = false,
                        isCheckable = false,
                        isChecked = false,
                        depth = 2,
                        children = emptyList(),
                    ),
                ),
            ),
            UIElementInfo(
                id = "nav_bar",
                className = "android.view.View",
                resourceId = "android:id/navigationBarBackground",
                text = null,
                contentDescription = null,
                bounds = ElementBounds(0, 2260, 1080, 2340),
                isClickable = false,
                isEnabled = true,
                isFocused = false,
                isSelected = false,
                isScrollable = false,
                isCheckable = false,
                isChecked = false,
                depth = 1,
                children = emptyList(),
            ),
        ),
    )

    // Helper to flatten hierarchy for searching
    fun flattenHierarchy(root: UIElementInfo): List<UIElementInfo> {
        val result = mutableListOf<UIElementInfo>()
        fun traverse(element: UIElementInfo) {
            result.add(element)
            element.children.forEach { traverse(it) }
        }
        traverse(root)
        return result
    }

    // Helper to find element by ID
    fun findElementById(root: UIElementInfo, id: String): UIElementInfo? {
        if (root.id == id) return root
        for (child in root.children) {
            val found = findElementById(child, id)
            if (found != null) return found
        }
        return null
    }

    // Helper to find deepest element at point
    fun findElementAt(root: UIElementInfo, x: Int, y: Int): UIElementInfo? {
        if (!root.bounds.contains(x, y)) return null

        // Check children first (depth-first to find deepest)
        for (child in root.children.reversed()) {
            val found = findElementAt(child, x, y)
            if (found != null) return found
        }

        return root
    }

    // Helper to get path from root to element
    fun getPathToElement(root: UIElementInfo, targetId: String): List<String> {
        val path = mutableListOf<String>()

        fun traverse(element: UIElementInfo): Boolean {
            if (element.id == targetId) {
                path.add(element.id)
                return true
            }
            for (child in element.children) {
                if (traverse(child)) {
                    path.add(0, element.id)
                    return true
                }
            }
            return false
        }

        traverse(root)
        return path
    }
}
