import Foundation
#if canImport(XCTest) && os(iOS)
    import UIKit
    import XCTest
#endif

/// Locates elements using XCUITest APIs and returns Android-compatible format
public class ElementLocator: ElementLocating {
    public enum LocatorError: LocalizedError {
        case noApplication
        case elementNotFound(String)

        public var errorDescription: String? {
            switch self {
            case .noApplication:
                return "No application available for element lookup"
            case let .elementNotFound(id):
                return "Element not found: \(id)"
            }
        }
    }

    #if canImport(XCTest) && os(iOS)
        private weak var application: XCUIApplication?

        /// Cache of resource IDs to XCUIElements
        private var elementCache: [String: XCUIElement] = [:]

        public init(application: XCUIApplication? = nil) {
            self.application = application
        }

        public func setApplication(_ app: XCUIApplication) {
            application = app
            elementCache.removeAll()
        }

        // MARK: - View Hierarchy

        public func getViewHierarchy() throws -> ViewHierarchy {
            guard let app = application else {
                throw LocatorError.noApplication
            }

            elementCache.removeAll()

            let bundleId = Bundle.main.bundleIdentifier

            // Use snapshot() for fast hierarchy extraction - single IPC call captures everything
            print("[ElementLocator] Taking snapshot of view hierarchy...")
            let startTime = Date()

            // snapshot() captures all element data in ONE IPC call (fast!)
            // vs accessing properties individually which is extremely slow
            let snapshot = try app.snapshot()

            let snapshotTime = Date().timeIntervalSince(startTime) * 1000
            print("[ElementLocator] Snapshot captured in \(Int(snapshotTime))ms")

            // Build hierarchy from snapshot (no more IPC calls - all data is local)
            let rootElement = buildElementInfoFromSnapshot(snapshot, depth: 0, maxDepth: 30)

            let totalTime = Date().timeIntervalSince(startTime) * 1000
            print("[ElementLocator] View hierarchy extraction complete in \(Int(totalTime))ms")

            // Get window info from snapshot
            let frame = snapshot.frame
            let windowInfo = WindowInfo(
                id: 0,
                type: 1, // Application window
                isActive: true,
                isFocused: true,
                bounds: ElementBounds(
                    left: Int(frame.origin.x),
                    top: Int(frame.origin.y),
                    right: Int(frame.origin.x + frame.width),
                    bottom: Int(frame.origin.y + frame.height)
                )
            )

            return ViewHierarchy(
                packageName: bundleId,
                hierarchy: rootElement,
                windowInfo: windowInfo,
                windows: [windowInfo]
            )
        }

        /// Build element info from XCUIElementSnapshot - all data is already captured, no IPC calls
        private func buildElementInfoFromSnapshot(
            _ snapshot: XCUIElementSnapshot,
            depth: Int,
            maxDepth: Int
        )
            -> UIElementInfo
        {
            let frame = snapshot.frame
            let bounds = ElementBounds(
                left: Int(frame.origin.x),
                top: Int(frame.origin.y),
                right: Int(frame.origin.x + frame.width),
                bottom: Int(frame.origin.y + frame.height)
            )

            // Get identifier
            let identifier = snapshot.identifier

            // Get children from snapshot (already captured - fast!)
            var childNodes: [UIElementInfo]? = nil
            if depth < maxDepth {
                let children = snapshot.children
                if !children.isEmpty {
                    childNodes = children.map { child in
                        buildElementInfoFromSnapshot(child, depth: depth + 1, maxDepth: maxDepth)
                    }
                }
            }

            // Map element type to className
            let className = mapElementType(snapshot.elementType)

            // Get actions based on element state
            var actions: [String] = []
            if snapshot.isEnabled {
                actions.append("click")
                if snapshot.elementType == .textField || snapshot.elementType == .textView || snapshot
                    .elementType == .secureTextField
                {
                    actions.append("set_text")
                    actions.append("clear_text")
                }
            }

            // Note: isHittable is NOT available on XCUIElementSnapshot (only on XCUIElement)
            // and is expensive to compute. We approximate clickable based on isEnabled.
            // This matches WebDriverAgent's approach for performance.
            let isClickable = snapshot.isEnabled

            return UIElementInfo(
                text: snapshot.label.isEmpty ? nil : snapshot.label,
                textSize: nil,
                contentDesc: snapshot.label.isEmpty ? nil : snapshot.label,
                resourceId: identifier.isEmpty ? nil : identifier,
                className: className,
                bounds: bounds,
                clickable: isClickable ? "true" : "false",
                enabled: snapshot.isEnabled ? "true" : "false",
                focusable: "true",
                focused: snapshot.hasFocus ? "true" : "false",
                accessibilityFocused: nil,
                scrollable: isScrollableType(snapshot.elementType) ? "true" : "false",
                password: snapshot.elementType == .secureTextField ? "true" : "false",
                checkable: isCheckableType(snapshot.elementType) ? "true" : "false",
                checked: snapshot.isSelected ? "true" : "false",
                selected: snapshot.isSelected ? "true" : "false",
                longClickable: isClickable ? "true" : "false",
                testTag: identifier.isEmpty ? nil : identifier,
                role: mapRole(snapshot.elementType),
                stateDescription: nil,
                errorMessage: nil,
                hintText: snapshot.placeholderValue,
                actions: actions.isEmpty ? nil : actions,
                node: childNodes
            )
        }

        /// Legacy slow method - keeping for reference but not used
        private func buildElementInfo(from _: XCUIElement, depth _: Int, maxDepth _: Int) -> UIElementInfo {
            // This method accesses element properties individually which is SLOW
            // Each property access is an IPC call to the accessibility service
            // Use buildElementInfoFromSnapshot instead
            fatalError("Use buildElementInfoFromSnapshot instead - this method is too slow")
        }

        private func mapElementType(_ type: XCUIElement.ElementType) -> String {
            switch type {
            case .application: return "XCUIApplication"
            case .window: return "UIWindow"
            case .button: return "UIButton"
            case .staticText: return "UILabel"
            case .textField: return "UITextField"
            case .secureTextField: return "UISecureTextField"
            case .textView: return "UITextView"
            case .image: return "UIImageView"
            case .switch: return "UISwitch"
            case .slider: return "UISlider"
            case .picker: return "UIPickerView"
            case .table: return "UITableView"
            case .cell: return "UITableViewCell"
            case .scrollView: return "UIScrollView"
            case .collectionView: return "UICollectionView"
            case .navigationBar: return "UINavigationBar"
            case .tabBar: return "UITabBar"
            case .toolbar: return "UIToolbar"
            case .searchField: return "UISearchBar"
            case .alert: return "UIAlertController"
            case .sheet: return "UIActionSheet"
            case .progressIndicator: return "UIProgressView"
            case .activityIndicator: return "UIActivityIndicatorView"
            case .segmentedControl: return "UISegmentedControl"
            case .stepper: return "UIStepper"
            case .datePicker: return "UIDatePicker"
            case .webView: return "WKWebView"
            case .link: return "UILink"
            case .keyboard: return "UIKeyboard"
            case .key: return "UIKeyboardKey"
            default: return "UIView"
            }
        }

        private func mapRole(_ type: XCUIElement.ElementType) -> String? {
            switch type {
            case .button: return "button"
            case .link: return "link"
            case .switch: return "switch"
            case .checkBox: return "checkbox"
            case .radioButton: return "radio"
            case .slider: return "slider"
            case .textField, .textView, .secureTextField: return "textfield"
            case .image: return "image"
            case .staticText: return "text"
            case .table, .collectionView: return "list"
            case .cell: return "listitem"
            case .tab: return "tab"
            case .progressIndicator: return "progressbar"
            default: return nil
            }
        }

        private func isScrollableType(_ type: XCUIElement.ElementType) -> Bool {
            switch type {
            case .scrollView, .table, .collectionView, .webView, .textView:
                return true
            default:
                return false
            }
        }

        private func isCheckableType(_ type: XCUIElement.ElementType) -> Bool {
            switch type {
            case .switch, .checkBox, .radioButton:
                return true
            default:
                return false
            }
        }

        // MARK: - Element Finding

        public func findElement(byResourceId resourceId: String) -> Any? {
            if let cached = elementCache[resourceId] {
                return cached
            }

            guard let app = application else { return nil }
            let element = app.descendants(matching: .any).matching(identifier: resourceId).firstMatch
            if element.exists {
                elementCache[resourceId] = element
                return element
            }
            return nil
        }

        public func findElement(byText text: String) -> Any? {
            guard let app = application else { return nil }
            let element = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", text)).firstMatch
            return element.exists ? element : nil
        }

        public func getCachedElement(_ resourceId: String) -> XCUIElement? {
            return elementCache[resourceId]
        }

    #else
        // Non-iOS stub implementation
        public init() {}

        public func getViewHierarchy() throws -> ViewHierarchy {
            return ViewHierarchy(
                packageName: nil,
                hierarchy: nil,
                windowInfo: nil,
                windows: nil,
                error: "XCUITest only available on iOS"
            )
        }

        public func findElement(byResourceId _: String) -> Any? {
            return nil
        }

        public func findElement(byText _: String) -> Any? {
            return nil
        }
    #endif
}
