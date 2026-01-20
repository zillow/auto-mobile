import Foundation
#if canImport(XCTest) && os(iOS)
    import UIKit
    import XCTest
#endif

/// Locates elements using XCUITest APIs and returns Android-compatible format
/// Applies filtering similar to Android's ViewHierarchyExtractor to reduce hierarchy size
public class ElementLocator: ElementLocating {
    // MARK: - Filtering Constants

    /// Maximum depth to traverse (prevent infinite recursion)
    private static let maxDepth = 30

    /// Generic class names that are typically structural wrappers
    private static let structuralClassNames: Set<String> = [
        "UIView",
        "UIImageView",
        "UIWindow",
    ]
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
        /// The foreground app we're currently observing (not springboard)
        /// At most one instance besides springboard should exist
        private var foregroundApp: XCUIApplication?
        private var foregroundBundleId: String?

        /// Springboard app for detecting foreground app - always kept
        private lazy var springboard: XCUIApplication = {
            XCUIApplication(bundleIdentifier: "com.apple.springboard")
        }()

        /// Cache of resource IDs to XCUIElements
        private var elementCache: [String: XCUIElement] = [:]

        public init(application: XCUIApplication? = nil) {
            self.foregroundApp = application
        }

        // MARK: - Main Thread Helper

        /// Executes a throwing closure on the main thread and returns the result.
        /// XCUITest APIs must be called on the main thread.
        private func runOnMainThread<T>(_ block: @escaping () throws -> T) throws -> T {
            if Thread.isMainThread {
                return try block()
            }

            var result: Result<T, Error>!
            DispatchQueue.main.sync {
                do {
                    result = .success(try block())
                } catch {
                    result = .failure(error)
                }
            }
            return try result.get()
        }

        /// Executes a non-throwing closure on the main thread and returns the result.
        private func runOnMainThread<T>(_ block: @escaping () -> T) -> T {
            if Thread.isMainThread {
                return block()
            }

            var result: T!
            DispatchQueue.main.sync {
                result = block()
            }
            return result
        }

        public func setApplication(_ app: XCUIApplication) {
            // Release old app reference before setting new one
            foregroundApp = nil
            foregroundBundleId = nil

            foregroundApp = app
            elementCache.removeAll()
        }

        /// Set the application to observe with its bundle ID
        public func setApplication(_ app: XCUIApplication, bundleId: String) {
            // Release old app reference before setting new one
            foregroundApp = nil
            foregroundBundleId = nil

            foregroundApp = app
            foregroundBundleId = bundleId
            elementCache.removeAll()
            print("[ElementLocator] Set application to observe: \(bundleId)")
        }

        /// Detect and switch to the foreground application if current app is not in foreground
        private func ensureForegroundApp() {
            // Run XCUITest state checks on main thread
            // IMPORTANT: Create fresh XCUIApplication instances to check state, because
            // cached instances may return stale state values
            let stateInfo: (springboardState: UInt, currentAppState: UInt?, currentBundleId: String?) = runOnMainThread {
                let sbState = self.springboard.state.rawValue
                // Create fresh instance to get accurate state (cached instances return stale state)
                let freshAppState: UInt? = self.foregroundBundleId.map { bundleId in
                    XCUIApplication(bundleIdentifier: bundleId).state.rawValue
                }
                return (sbState, freshAppState, self.foregroundBundleId)
            }

            // Debug: Log all state info
            print("[ElementLocator] ensureForegroundApp - springboard.state=\(stateInfo.springboardState) (4=runningForeground), currentApp.state=\(stateInfo.currentAppState ?? 0), currentBundleId=\(stateInfo.currentBundleId ?? "nil")")

            let isSpringboardInForeground = stateInfo.springboardState == 4 // .runningForeground
            let isCurrentAppInForeground = stateInfo.currentAppState == 4 // .runningForeground

            // If we have an app and it's in foreground, we're good
            if isCurrentAppInForeground {
                print("[ElementLocator] Current app is in foreground, no switch needed")
                return
            }

            // Always try to detect foreground app first, even if springboard reports as foreground
            // This is because springboard may report as foreground even when another app is visible
            print("[ElementLocator] Current app not in foreground (state=\(stateInfo.currentAppState ?? 0)), detecting foreground app...")

            // Try to find the foreground app by checking springboard
            if let detectedBundleId = detectForegroundAppBundleId() {
                if detectedBundleId != foregroundBundleId {
                    print("[ElementLocator] Switching to foreground app: \(detectedBundleId)")
                    // Release old app before creating new one
                    foregroundApp = nil
                    foregroundBundleId = nil
                    elementCache.removeAll()

                    // Create new app instance for the detected bundle
                    foregroundApp = XCUIApplication(bundleIdentifier: detectedBundleId)
                    foregroundBundleId = detectedBundleId
                } else {
                    print("[ElementLocator] Detected app \(detectedBundleId) is already current, no switch needed")
                }
            } else if isSpringboardInForeground {
                // Only clear foreground app if we couldn't detect any app AND springboard reports as foreground
                print("[ElementLocator] No foreground app detected and springboard is in foreground, clearing foreground app")
                foregroundApp = nil
                foregroundBundleId = nil
                elementCache.removeAll()
            } else {
                print("[ElementLocator] Could not detect foreground app, keeping current: \(foregroundBundleId ?? "nil")")
            }
        }

        /// Get the current application to observe
        /// Returns foreground app if available and in foreground, otherwise springboard
        private var currentApplication: XCUIApplication {
            // Check state on main thread using fresh instance (cached instances return stale state)
            let stateInfo: (state: UInt?, bundleId: String?) = runOnMainThread {
                let freshState: UInt? = self.foregroundBundleId.map { bundleId in
                    XCUIApplication(bundleIdentifier: bundleId).state.rawValue
                }
                return (freshState, self.foregroundBundleId)
            }
            let foregroundAppInForeground = stateInfo.state == 4 // .runningForeground
            if let app = foregroundApp, foregroundAppInForeground {
                print("[ElementLocator] currentApplication returning foreground app: \(stateInfo.bundleId ?? "unknown")")
                return app
            }
            print("[ElementLocator] currentApplication returning springboard (foregroundApp.state=\(stateInfo.state ?? 0), bundleId=\(stateInfo.bundleId ?? "nil"))")
            return springboard
        }

        /// Common system apps to check when detecting foreground app
        /// These are apps that might be launched by the user during testing
        private static let commonSystemApps: [String] = [
            "com.apple.Preferences",      // Settings
            "com.apple.mobilesafari",     // Safari
            "com.apple.MobileAddressBook", // Contacts
            "com.apple.mobilephone",       // Phone
            "com.apple.MobileSMS",         // Messages
            "com.apple.mobileslideshow",   // Photos
            "com.apple.camera",            // Camera
            "com.apple.AppStore",          // App Store
            "com.apple.Maps",              // Maps
            "com.apple.Health",            // Health
            "com.apple.Fitness",           // Fitness
            "com.apple.weather",           // Weather
            "com.apple.mobilenotes",       // Notes
            "com.apple.reminders",         // Reminders
            "com.apple.mobilecal",         // Calendar
            "com.apple.mobilemail",        // Mail
            "com.apple.Music",             // Music
            "com.apple.Podcasts",          // Podcasts
            "com.apple.TV",                // TV
            "com.apple.news",              // News
            "com.apple.stocks",            // Stocks
            "com.apple.tips",              // Tips
            "com.apple.iBooks",            // Books
            "com.apple.DocumentsApp",      // Files
            "com.apple.calculator",        // Calculator
            "com.apple.VoiceMemos",        // Voice Memos
            "com.apple.compass",           // Compass
            "com.apple.measure",           // Measure
            "com.apple.facetime",          // FaceTime
            "com.apple.Home",              // Home
            "com.apple.shortcuts",         // Shortcuts
            "com.apple.Translate",         // Translate
            "com.apple.Magnifier",         // Magnifier
            "com.apple.clock",             // Clock
            "com.apple.findmy",            // Find My
            "com.apple.Passbook",          // Wallet
        ]

        /// Detect the bundle ID of the foreground app
        /// Returns nil if detection fails or springboard is in front
        private func detectForegroundAppBundleId() -> String? {
            print("[ElementLocator] detectForegroundAppBundleId() called")

            // First, try to find bundle IDs from springboard's element tree
            // This can work when apps embed their bundle ID in element identifiers
            if let snapshot: XCUIElementSnapshot = runOnMainThread({
                return try? self.springboard.snapshot()
            }) {
                var candidateBundleIds: [String] = []
                collectBundleIdsFromElement(snapshot, into: &candidateBundleIds)
                print("[ElementLocator] Found \(candidateBundleIds.count) candidate bundle IDs from springboard: \(candidateBundleIds)")

                for bundleId in candidateBundleIds {
                    if bundleId == "com.apple.springboard" {
                        continue
                    }

                    let stateRawValue: UInt = runOnMainThread {
                        let testApp = XCUIApplication(bundleIdentifier: bundleId)
                        return testApp.state.rawValue
                    }
                    print("[ElementLocator] Checking \(bundleId): state=\(stateRawValue) (4=runningForeground)")
                    if stateRawValue == 4 { // .runningForeground
                        print("[ElementLocator] Detected foreground app from springboard: \(bundleId)")
                        return bundleId
                    }
                }
            } else {
                print("[ElementLocator] Failed to get springboard snapshot")
            }

            // Fallback: Check common system apps directly
            // This is necessary because when another app is in foreground,
            // springboard's element tree may not contain that app's bundle ID
            print("[ElementLocator] No foreground app found in springboard tree, checking common system apps...")
            for bundleId in Self.commonSystemApps {
                // Skip current app (we already know it's not in foreground)
                if bundleId == foregroundBundleId {
                    print("[ElementLocator] Skipping current app: \(bundleId)")
                    continue
                }

                let stateRawValue: UInt = runOnMainThread {
                    let testApp = XCUIApplication(bundleIdentifier: bundleId)
                    return testApp.state.rawValue
                }
                // Only log apps that are running (state > 0) to reduce noise
                if stateRawValue > 0 {
                    print("[ElementLocator] System app \(bundleId): state=\(stateRawValue) (4=runningForeground)")
                }
                if stateRawValue == 4 { // .runningForeground
                    print("[ElementLocator] Detected foreground app from system apps: \(bundleId)")
                    return bundleId
                }
            }

            print("[ElementLocator] Could not detect foreground app from any source")
            return nil
        }

        /// Collect all potential bundle IDs from springboard element tree
        private func collectBundleIdsFromElement(_ element: XCUIElementSnapshot, into bundleIds: inout [String]) {
            let identifier = element.identifier

            // Many springboard elements have identifiers like "com.apple.AppName-window"
            // or just the bundle ID directly
            if identifier.contains(".") && !identifier.contains(" ") {
                // Looks like a bundle ID pattern
                let cleanId = identifier.replacingOccurrences(of: "-window", with: "")
                    .replacingOccurrences(of: "-sceneID", with: "")
                    .replacingOccurrences(of: "-SceneWindow", with: "")
                if cleanId.hasPrefix("com.") || cleanId.hasPrefix("io.") || cleanId.hasPrefix("org.") ||
                   cleanId.hasPrefix("net.") || cleanId.hasPrefix("me.") {
                    if !bundleIds.contains(cleanId) {
                        bundleIds.append(cleanId)
                    }
                }
            }

            // Recursively check children
            for child in element.children {
                collectBundleIdsFromElement(child, into: &bundleIds)
            }
        }

        // MARK: - View Hierarchy

        public func getViewHierarchy() throws -> ViewHierarchy {
            // First, ensure we're observing the foreground app
            ensureForegroundApp()

            // Get the current app to observe (foreground app or springboard)
            let app = currentApplication

            elementCache.removeAll()

            // Use the observed app's bundle identifier for packageName
            let bundleId = foregroundBundleId ?? "com.apple.springboard"

            // Use snapshot() for fast hierarchy extraction - single IPC call captures everything
            print("[ElementLocator] Taking snapshot of \(bundleId)...")
            let startTime = Date()

            // snapshot() captures all element data in ONE IPC call (fast!)
            // vs accessing properties individually which is extremely slow
            // Must be called on main thread
            let snapshot = try runOnMainThread {
                try app.snapshot()
            }

            let snapshotTime = Date().timeIntervalSince(startTime) * 1000
            print("[ElementLocator] Snapshot captured in \(Int(snapshotTime))ms")

            // Get screen bounds for offscreen filtering
            let screenBounds = snapshot.frame

            // Build hierarchy from snapshot (no more IPC calls - all data is local)
            let rawElement = buildElementInfoFromSnapshot(
                snapshot,
                depth: 0,
                screenBounds: screenBounds
            )

            let buildTime = Date().timeIntervalSince(startTime) * 1000
            print("[ElementLocator] Raw hierarchy built in \(Int(buildTime))ms")

            // Apply optimization - flatten structural wrappers and filter empty nodes
            let optimizedElements = optimizeHierarchy(rawElement, isRoot: true)
            let rootElement = optimizedElements.first ?? rawElement

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
        /// Applies early filtering: offscreen elements, zero-area elements
        /// Only sets boolean fields when true (nil = false) to reduce JSON size
        private func buildElementInfoFromSnapshot(
            _ snapshot: XCUIElementSnapshot,
            depth: Int,
            screenBounds: CGRect
        )
            -> UIElementInfo
        {
            let frame = snapshot.frame

            // Skip zero-area elements
            let hasZeroArea = frame.width <= 0 || frame.height <= 0

            let bounds = ElementBounds(
                left: Int(frame.origin.x),
                top: Int(frame.origin.y),
                right: Int(frame.origin.x + frame.width),
                bottom: Int(frame.origin.y + frame.height)
            )

            // Get identifier
            let identifier = snapshot.identifier

            // Get children from snapshot (already captured - fast!)
            // Filter out offscreen and zero-area children
            var childNodes: [UIElementInfo]? = nil
            if depth < ElementLocator.maxDepth {
                let children = snapshot.children
                if !children.isEmpty {
                    let filteredChildren = children.compactMap { child -> UIElementInfo? in
                        let childFrame = child.frame

                        // Skip zero-area children
                        if childFrame.width <= 0 || childFrame.height <= 0 {
                            return nil
                        }

                        // Skip completely offscreen children (with margin)
                        let margin: CGFloat = 50
                        let expandedScreen = screenBounds.insetBy(dx: -margin, dy: -margin)
                        if !expandedScreen.intersects(childFrame) {
                            return nil
                        }

                        return buildElementInfoFromSnapshot(
                            child,
                            depth: depth + 1,
                            screenBounds: screenBounds
                        )
                    }
                    childNodes = filteredChildren.isEmpty ? nil : filteredChildren
                }
            }

            // Map element type to className
            let className = mapElementType(snapshot.elementType)

            // Determine boolean properties - only set to "true", leave nil for false
            // This significantly reduces JSON size
            let isEnabled = snapshot.isEnabled

            // Only mark specific element types as clickable (not generic UIViews)
            let isClickableType = isActuallyClickableType(snapshot.elementType)
            let isClickable = isEnabled && isClickableType

            let isScrollable = isScrollableType(snapshot.elementType)
            let isCheckable = isCheckableType(snapshot.elementType)
            let isSelected = snapshot.isSelected
            let hasFocus = snapshot.hasFocus
            let isPassword = snapshot.elementType == .secureTextField

            // Only include actions for text input elements (click is implied by clickable)
            var actions: [String]? = nil
            if isEnabled && (snapshot.elementType == .textField || snapshot.elementType == .textView ||
                             snapshot.elementType == .secureTextField) {
                actions = ["set_text", "clear_text"]
            }

            // Get label - use for text (don't duplicate in content-desc)
            let label = snapshot.label.isEmpty ? nil : snapshot.label

            // Use resourceId (don't duplicate in testTag)
            let resId = identifier.isEmpty ? nil : identifier

            return UIElementInfo(
                text: label,
                textSize: nil,
                contentDesc: nil, // Don't duplicate - label is in text
                resourceId: resId,
                className: className,
                bounds: hasZeroArea ? nil : bounds, // Don't include bounds for zero-area elements
                // Only include boolean fields when true (nil = false)
                clickable: isClickable ? "true" : nil,
                enabled: nil, // Don't include enabled - it's almost always true and implied by clickable
                focusable: nil, // Don't include - almost all elements are focusable on iOS
                focused: hasFocus ? "true" : nil,
                accessibilityFocused: nil,
                scrollable: isScrollable ? "true" : nil,
                password: isPassword ? "true" : nil,
                checkable: isCheckable ? "true" : nil,
                checked: (isCheckable && isSelected) ? "true" : nil,
                selected: isSelected ? "true" : nil,
                longClickable: nil, // Don't include - same as clickable on iOS
                testTag: nil, // Don't duplicate - identifier is in resourceId
                role: mapRole(snapshot.elementType),
                stateDescription: nil,
                errorMessage: nil,
                hintText: snapshot.placeholderValue,
                actions: actions,
                node: childNodes
            )
        }

        // MARK: - Hierarchy Optimization

        /// Check if an element has meaningful content that should be preserved
        private func meetsFilterCriteria(_ element: UIElementInfo) -> Bool {
            // String criteria - element has useful identifying information
            let hasStringCriteria =
                element.text != nil ||
                element.resourceId != nil ||
                element.role != nil ||
                element.hintText != nil

            // Boolean criteria - element is interactive
            let hasBooleanCriteria =
                element.clickable == "true" ||
                element.scrollable == "true" ||
                element.focused == "true" ||
                element.selected == "true" ||
                element.checkable == "true"

            return hasStringCriteria || hasBooleanCriteria
        }

        /// Check if a class name is a structural wrapper (no semantic meaning)
        private func isStructuralWrapper(_ className: String?) -> Bool {
            guard let className = className else { return false }
            return ElementLocator.structuralClassNames.contains(className)
        }

        /// Optimizes the hierarchy by:
        /// 1. Promoting children of bounds-only wrapper nodes (structural nodes with only bounds)
        /// 2. Filtering out empty structural nodes
        /// 3. Preserving interactive elements and their children
        ///
        /// This significantly reduces hierarchy size for complex UIs.
        private func optimizeHierarchy(_ element: UIElementInfo, isRoot: Bool = false) -> [UIElementInfo] {
            // Check if this element is a bounds-only wrapper (has no useful properties)
            let meetsCriteria = meetsFilterCriteria(element)
            let isStructural = isStructuralWrapper(element.className)
            let isBoundsOnlyWrapper = !meetsCriteria && isStructural

            // Never promote children of interactive elements
            let isInteractive = element.clickable == "true" ||
                element.scrollable == "true" ||
                element.selected == "true"

            // First, recursively optimize children
            var optimizedChildren: [UIElementInfo]? = nil
            if let children = element.node {
                let optimized = children.flatMap { child in
                    optimizeHierarchy(child, isRoot: false)
                }
                optimizedChildren = optimized.isEmpty ? nil : optimized
            }

            // Root element is always kept
            if isRoot {
                return [UIElementInfo(
                    text: element.text,
                    textSize: element.textSize,
                    contentDesc: element.contentDesc,
                    resourceId: element.resourceId,
                    className: element.className,
                    bounds: element.bounds,
                    clickable: element.clickable,
                    enabled: element.enabled,
                    focusable: element.focusable,
                    focused: element.focused,
                    accessibilityFocused: element.accessibilityFocused,
                    scrollable: element.scrollable,
                    password: element.password,
                    checkable: element.checkable,
                    checked: element.checked,
                    selected: element.selected,
                    longClickable: element.longClickable,
                    testTag: element.testTag,
                    role: element.role,
                    stateDescription: element.stateDescription,
                    errorMessage: element.errorMessage,
                    hintText: element.hintText,
                    actions: element.actions,
                    node: optimizedChildren
                )]
            }

            // Only promote children (flatten hierarchy) if this is a bounds-only wrapper AND not interactive
            if isBoundsOnlyWrapper && !isInteractive {
                if let children = optimizedChildren {
                    // Promote children - flatten this wrapper node
                    return children
                }
                // No children and no content - filter out completely
                return []
            }

            // Keep this element with optimized children
            return [UIElementInfo(
                text: element.text,
                textSize: element.textSize,
                contentDesc: element.contentDesc,
                resourceId: element.resourceId,
                className: element.className,
                bounds: element.bounds,
                clickable: element.clickable,
                enabled: element.enabled,
                focusable: element.focusable,
                focused: element.focused,
                accessibilityFocused: element.accessibilityFocused,
                scrollable: element.scrollable,
                password: element.password,
                checkable: element.checkable,
                checked: element.checked,
                selected: element.selected,
                longClickable: element.longClickable,
                testTag: element.testTag,
                role: element.role,
                stateDescription: element.stateDescription,
                errorMessage: element.errorMessage,
                hintText: element.hintText,
                actions: element.actions,
                node: optimizedChildren
            )]
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

        /// Check if an element type is actually clickable (not just a generic container)
        /// This prevents marking every UIView as clickable just because it's enabled
        private func isActuallyClickableType(_ type: XCUIElement.ElementType) -> Bool {
            switch type {
            // Interactive controls
            case .button, .link, .switch, .slider, .stepper, .segmentedControl:
                return true
            // Checkable items
            case .checkBox, .radioButton:
                return true
            // Text input
            case .textField, .textView, .secureTextField, .searchField:
                return true
            // List items (cells are tappable)
            case .cell:
                return true
            // Tab and navigation items
            case .tab, .tabBar:
                return true
            // Pickers
            case .picker, .datePicker:
                return true
            // Alert/sheet buttons
            case .alert, .sheet:
                return true
            // Keyboard keys
            case .key:
                return true
            // Images can be tappable
            case .image:
                return true
            // Everything else (UIView, window, staticText, etc.) is not inherently clickable
            default:
                return false
            }
        }

        // MARK: - Element Finding

        public func findElement(byResourceId resourceId: String) -> Any? {
            if let cached = elementCache[resourceId] {
                return cached
            }

            let app = currentApplication
            // Run on main thread since XCUITest APIs require it
            let element: XCUIElement = runOnMainThread {
                app.descendants(matching: .any).matching(identifier: resourceId).firstMatch
            }
            let exists = runOnMainThread { element.exists }
            if exists {
                elementCache[resourceId] = element
                return element
            }
            return nil
        }

        public func findElement(byText text: String) -> Any? {
            let app = currentApplication
            // Run on main thread since XCUITest APIs require it
            let element: XCUIElement = runOnMainThread {
                app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", text)).firstMatch
            }
            let exists = runOnMainThread { element.exists }
            return exists ? element : nil
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
