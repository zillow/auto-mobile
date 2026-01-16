import Foundation
#if canImport(XCTest) && os(iOS)
import XCTest
import UIKit
#endif

/// Locates elements using XCUITest APIs and returns Android-compatible format
public class ElementLocator {

    public enum LocatorError: LocalizedError {
        case noApplication
        case elementNotFound(String)

        public var errorDescription: String? {
            switch self {
            case .noApplication:
                return "No application available for element lookup"
            case .elementNotFound(let id):
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
        self.application = app
        elementCache.removeAll()
    }

    // MARK: - View Hierarchy

    public func getViewHierarchy() throws -> ViewHierarchy {
        guard let app = application else {
            throw LocatorError.noApplication
        }

        elementCache.removeAll()

        let bundleId = Bundle.main.bundleIdentifier

        // Build hierarchy from root
        let rootElement = buildElementInfo(from: app, depth: 0, maxDepth: 50)

        // Get window info
        let windowInfo = WindowInfo(
            id: 0,
            type: 1, // Application window
            isActive: true,
            isFocused: true,
            bounds: ElementBounds(
                left: Int(app.frame.origin.x),
                top: Int(app.frame.origin.y),
                right: Int(app.frame.origin.x + app.frame.width),
                bottom: Int(app.frame.origin.y + app.frame.height)
            )
        )

        return ViewHierarchy(
            packageName: bundleId,
            hierarchy: rootElement,
            windowInfo: windowInfo,
            windows: [windowInfo]
        )
    }

    private func buildElementInfo(from element: XCUIElement, depth: Int, maxDepth: Int) -> UIElementInfo {
        let frame = element.frame
        let bounds = ElementBounds(
            left: Int(frame.origin.x),
            top: Int(frame.origin.y),
            right: Int(frame.origin.x + frame.width),
            bottom: Int(frame.origin.y + frame.height)
        )

        // Cache element by identifier if available
        let identifier = element.identifier
        if !identifier.isEmpty {
            elementCache[identifier] = element
        }

        // Get children
        var childNodes: [UIElementInfo]? = nil
        if depth < maxDepth {
            let children = element.children(matching: .any)
            if children.count > 0 {
                childNodes = []
                for i in 0..<children.count {
                    let child = children.element(boundBy: i)
                    if child.exists {
                        childNodes?.append(buildElementInfo(from: child, depth: depth + 1, maxDepth: maxDepth))
                    }
                }
            }
        }

        // Map element type to className
        let className = mapElementType(element.elementType)

        // Get actions
        var actions: [String] = []
        if element.isEnabled {
            actions.append("click")
            if element.elementType == .textField || element.elementType == .textView || element.elementType == .secureTextField {
                actions.append("set_text")
                actions.append("clear_text")
            }
        }

        return UIElementInfo(
            text: element.label.isEmpty ? nil : element.label,
            textSize: nil,
            contentDesc: element.label.isEmpty ? nil : element.label,
            resourceId: identifier.isEmpty ? nil : identifier,
            className: className,
            bounds: bounds,
            clickable: element.isHittable ? "true" : "false",
            enabled: element.isEnabled ? "true" : "false",
            focusable: "true",
            focused: "false",
            accessibilityFocused: nil,
            scrollable: isScrollable(element) ? "true" : "false",
            password: element.elementType == .secureTextField ? "true" : "false",
            checkable: isCheckable(element) ? "true" : "false",
            checked: element.isSelected ? "true" : "false",
            selected: element.isSelected ? "true" : "false",
            longClickable: element.isHittable ? "true" : "false",
            testTag: identifier.isEmpty ? nil : identifier,
            role: mapRole(element.elementType),
            stateDescription: nil,
            errorMessage: nil,
            hintText: element.placeholderValue,
            actions: actions.isEmpty ? nil : actions,
            node: childNodes
        )
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

    private func isScrollable(_ element: XCUIElement) -> Bool {
        switch element.elementType {
        case .scrollView, .table, .collectionView, .webView, .textView:
            return true
        default:
            return false
        }
    }

    private func isCheckable(_ element: XCUIElement) -> Bool {
        switch element.elementType {
        case .switch, .checkBox, .radioButton:
            return true
        default:
            return false
        }
    }

    // MARK: - Element Finding

    public func findElement(byResourceId resourceId: String) -> XCUIElement? {
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

    public func findElement(byText text: String) -> XCUIElement? {
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

    public func findElement(byResourceId resourceId: String) -> Any? {
        return nil
    }

    public func findElement(byText text: String) -> Any? {
        return nil
    }
    #endif
}
