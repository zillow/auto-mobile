import Foundation
import UIKit

/// Provides access to the accessibility tree of the application
public class AccessibilityTreeProvider {

    /// Structure representing a node in the accessibility tree
    public struct AccessibilityNode: Codable {
        public let id: String
        public let type: String
        public let text: String?
        public let bounds: CGRect
        public let isEnabled: Bool
        public let isFocused: Bool
        public let children: [AccessibilityNode]

        public init(
            id: String,
            type: String,
            text: String? = nil,
            bounds: CGRect,
            isEnabled: Bool,
            isFocused: Bool,
            children: [AccessibilityNode] = []
        ) {
            self.id = id
            self.type = type
            self.text = text
            self.bounds = bounds
            self.isEnabled = isEnabled
            self.isFocused = isFocused
            self.children = children
        }
    }

    public init() {}

    /// Retrieves the current accessibility tree
    public func getViewHierarchy() -> AccessibilityNode? {
        guard let window = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) else {
            return nil
        }

        return buildNode(from: window)
    }

    /// Finds an element by its accessibility identifier
    public func findElement(byId id: String) -> AccessibilityNode? {
        guard let root = getViewHierarchy() else {
            return nil
        }

        return searchNode(root, withId: id)
    }

    /// Finds elements by their text content
    public func findElements(byText text: String) -> [AccessibilityNode] {
        guard let root = getViewHierarchy() else {
            return []
        }

        var results: [AccessibilityNode] = []
        collectNodes(root, matching: text, into: &results)
        return results
    }

    // MARK: - Private Methods

    private func buildNode(from view: UIView) -> AccessibilityNode {
        let id = view.accessibilityIdentifier ?? UUID().uuidString
        let type = String(describing: type(of: view))
        let text = view.accessibilityLabel ?? view.accessibilityValue
        let bounds = view.frame
        let isEnabled = view.isUserInteractionEnabled
        let isFocused = view.isFirstResponder

        let children = view.subviews.map { buildNode(from: $0) }

        return AccessibilityNode(
            id: id,
            type: type,
            text: text,
            bounds: bounds,
            isEnabled: isEnabled,
            isFocused: isFocused,
            children: children
        )
    }

    private func searchNode(_ node: AccessibilityNode, withId id: String) -> AccessibilityNode? {
        if node.id == id {
            return node
        }

        for child in node.children {
            if let found = searchNode(child, withId: id) {
                return found
            }
        }

        return nil
    }

    private func collectNodes(
        _ node: AccessibilityNode,
        matching text: String,
        into results: inout [AccessibilityNode]
    ) {
        if let nodeText = node.text, nodeText.contains(text) {
            results.append(node)
        }

        for child in node.children {
            collectNodes(child, matching: text, into: &results)
        }
    }
}
