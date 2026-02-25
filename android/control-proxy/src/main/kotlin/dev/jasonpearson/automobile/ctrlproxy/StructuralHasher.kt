package dev.jasonpearson.automobile.ctrlproxy

import dev.jasonpearson.automobile.ctrlproxy.models.UIElementInfo
import dev.jasonpearson.automobile.ctrlproxy.models.ViewHierarchy
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Computes a structural hash of the view hierarchy that ignores bounds.
 *
 * During scroll/fling animations, many TYPE_WINDOW_CONTENT_CHANGED events fire, but only the bounds
 * are changing (elements moving). The actual content (text, resource-ids, structure) remains the
 * same.
 *
 * By hashing only structural content, we can detect:
 * - Animation: Same hash = just bounds changing, no real content change
 * - Real change: Different hash = actual content/structure changed
 *
 * This allows us to skip unnecessary debounce waits during animations.
 */
object StructuralHasher {

  /** Compute a structural hash of the hierarchy, excluding bounds. */
  fun computeHash(hierarchy: ViewHierarchy): Int {
    var hash = 17
    hash = 31 * hash + (hierarchy.packageName?.hashCode() ?: 0)
    hierarchy.hierarchy?.let { root -> hash = 31 * hash + computeElementHash(root) }
    return hash
  }

  /** Compute hash for a single UIElementInfo, excluding bounds. */
  private fun computeElementHash(element: UIElementInfo): Int {
    var hash = 17

    // Text content fields
    hash = 31 * hash + (element.text?.hashCode() ?: 0)
    hash = 31 * hash + (element.contentDesc?.hashCode() ?: 0)
    hash = 31 * hash + (element.resourceId?.hashCode() ?: 0)
    hash = 31 * hash + (element.className?.hashCode() ?: 0)
    hash = 31 * hash + (element.hintText?.hashCode() ?: 0)
    hash = 31 * hash + (element.errorMessage?.hashCode() ?: 0)
    hash = 31 * hash + (element.stateDescription?.hashCode() ?: 0)
    hash = 31 * hash + (element.paneTitle?.hashCode() ?: 0)
    hash = 31 * hash + (element.testTag?.hashCode() ?: 0)
    hash = 31 * hash + (element.role?.hashCode() ?: 0)

    // Boolean state flags (as strings)
    hash = 31 * hash + (element.clickable?.hashCode() ?: 0)
    hash = 31 * hash + (element.focusable?.hashCode() ?: 0)
    hash = 31 * hash + (element.scrollable?.hashCode() ?: 0)
    hash = 31 * hash + (element.checkable?.hashCode() ?: 0)
    hash = 31 * hash + (element.checked?.hashCode() ?: 0)
    hash = 31 * hash + (element.selected?.hashCode() ?: 0)
    hash = 31 * hash + (element.enabled?.hashCode() ?: 0)
    hash = 31 * hash + (element.focused?.hashCode() ?: 0)
    hash = 31 * hash + (element.longClickable?.hashCode() ?: 0)
    hash = 31 * hash + (element.password?.hashCode() ?: 0)

    // Other semantic fields
    hash = 31 * hash + (element.liveRegion?.hashCode() ?: 0)
    hash = 31 * hash + (element.collectionInfo?.hashCode() ?: 0)
    hash = 31 * hash + (element.collectionItemInfo?.hashCode() ?: 0)
    hash = 31 * hash + (element.rangeInfo?.hashCode() ?: 0)
    hash = 31 * hash + (element.inputType?.hashCode() ?: 0)
    hash = 31 * hash + (element.actions?.hashCode() ?: 0)
    hash = 31 * hash + (element.extras?.hashCode() ?: 0)
    hash = 31 * hash + (element.fragment?.hashCode() ?: 0)

    // NOTE: Intentionally EXCLUDING:
    // - bounds (changes during animation)
    // - accessible (z-index percentage may fluctuate)
    // - textSize/textColor (unlikely to change during animation, but not structural)

    // Recursively hash children in node
    element.node?.let { node -> hash = 31 * hash + computeNodeHash(node) }

    return hash
  }

  /** Compute hash for JsonElement children (can be array, object, or primitive). */
  private fun computeNodeHash(node: JsonElement): Int {
    return when (node) {
      is JsonArray -> {
        var hash = 17
        node.forEach { child -> hash = 31 * hash + computeNodeHash(child) }
        hash
      }
      is JsonObject -> computeJsonObjectHash(node)
      is JsonPrimitive -> node.content.hashCode()
    }
  }

  /**
   * Compute hash for a JsonObject representing a UIElementInfo node. Mirrors computeElementHash but
   * works with raw JSON.
   */
  private fun computeJsonObjectHash(obj: JsonObject): Int {
    var hash = 17

    // Text content fields
    hash = 31 * hash + getJsonStringHash(obj, "text")
    hash = 31 * hash + getJsonStringHash(obj, "content-desc")
    hash = 31 * hash + getJsonStringHash(obj, "resource-id")
    hash = 31 * hash + getJsonStringHash(obj, "className")
    hash = 31 * hash + getJsonStringHash(obj, "hint-text")
    hash = 31 * hash + getJsonStringHash(obj, "error-message")
    hash = 31 * hash + getJsonStringHash(obj, "state-description")
    hash = 31 * hash + getJsonStringHash(obj, "pane-title")
    hash = 31 * hash + getJsonStringHash(obj, "test-tag")
    hash = 31 * hash + getJsonStringHash(obj, "role")

    // Boolean state flags
    hash = 31 * hash + getJsonStringHash(obj, "clickable")
    hash = 31 * hash + getJsonStringHash(obj, "focusable")
    hash = 31 * hash + getJsonStringHash(obj, "scrollable")
    hash = 31 * hash + getJsonStringHash(obj, "checkable")
    hash = 31 * hash + getJsonStringHash(obj, "checked")
    hash = 31 * hash + getJsonStringHash(obj, "selected")
    hash = 31 * hash + getJsonStringHash(obj, "enabled")
    hash = 31 * hash + getJsonStringHash(obj, "focused")
    hash = 31 * hash + getJsonStringHash(obj, "long-clickable")
    hash = 31 * hash + getJsonStringHash(obj, "password")

    // Other semantic fields
    hash = 31 * hash + getJsonStringHash(obj, "live-region")
    hash = 31 * hash + getJsonStringHash(obj, "collection-info")
    hash = 31 * hash + getJsonStringHash(obj, "collection-item-info")
    hash = 31 * hash + getJsonStringHash(obj, "range-info")
    hash = 31 * hash + getJsonStringHash(obj, "input-type")
    hash = 31 * hash + getJsonStringHash(obj, "fragment")

    // NOTE: Intentionally EXCLUDING "bounds"

    // Recursively hash children
    obj["node"]?.let { childNode -> hash = 31 * hash + computeNodeHash(childNode) }

    return hash
  }

  /** Safely get hash of a string field from JsonObject. */
  private fun getJsonStringHash(obj: JsonObject, key: String): Int {
    val element = obj[key] ?: return 0
    return if (element is JsonPrimitive) {
      element.content.hashCode()
    } else {
      element.toString().hashCode()
    }
  }
}
