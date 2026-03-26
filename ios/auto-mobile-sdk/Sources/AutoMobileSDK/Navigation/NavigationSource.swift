import Foundation

/// The framework that triggered a navigation event.
public enum NavigationSource: String, Sendable, CaseIterable {
    /// SwiftUI NavigationStack / NavigationPath
    case swiftUINavigation = "swiftui_navigation"

    /// UIKit UINavigationController
    case uiKitNavigation = "uikit_navigation"

    /// Deep link (URL scheme or universal link)
    case deepLink = "deep_link"

    /// Custom or unknown navigation framework
    case custom
}
