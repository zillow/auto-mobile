package dev.jasonpearson.automobile.ctrlproxy.models

import kotlinx.serialization.Serializable

/**
 * Result containing ordered accessibility-focusable elements in TalkBack traversal order.
 *
 * @property elements List of elements in traversal order (depth-first, left-to-right)
 * @property focusedIndex Index of currently focused element in the list, or null if no element has
 *   focus
 * @property totalCount Total number of focusable elements found
 */
@Serializable
data class TraversalOrderResult(
    val elements: List<UIElementInfo>,
    val focusedIndex: Int? = null,
    val totalCount: Int = elements.size,
)
