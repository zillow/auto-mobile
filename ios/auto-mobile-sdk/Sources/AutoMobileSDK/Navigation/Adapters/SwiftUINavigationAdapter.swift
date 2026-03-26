import Foundation
import SwiftUI

/// Adapter for tracking SwiftUI NavigationStack/NavigationPath navigation events.
/// iOS equivalent of Android's Navigation3Adapter.
public final class SwiftUINavigationAdapter: NavigationFrameworkAdapter, @unchecked Sendable {
    public static let shared = SwiftUINavigationAdapter()

    private let lock = NSLock()
    private var _isActive = false

    public var isActive: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isActive
    }

    private init() {}

    public func start() {
        lock.lock()
        _isActive = true
        lock.unlock()
    }

    public func stop() {
        lock.lock()
        _isActive = false
        lock.unlock()
    }

    /// Manually track a navigation event.
    public func trackNavigation(
        destination: String,
        arguments: [String: String] = [:],
        metadata: [String: String] = [:]
    ) {
        guard isActive else { return }
        let event = NavigationEvent(
            destination: destination,
            source: .swiftUINavigation,
            arguments: arguments,
            metadata: metadata
        )
        AutoMobileSDK.shared.notifyNavigationEvent(event)
    }
}

// MARK: - SwiftUI View Modifier

/// A view modifier that tracks when a SwiftUI destination appears.
public struct TrackNavigationModifier: ViewModifier {
    let destination: String
    let arguments: [String: String]
    let metadata: [String: String]

    public func body(content: Content) -> some View {
        content.onAppear {
            SwiftUINavigationAdapter.shared.trackNavigation(
                destination: destination,
                arguments: arguments,
                metadata: metadata
            )
        }
    }
}

public extension View {
    /// Track navigation to this view using the SwiftUI navigation adapter.
    func trackNavigation(
        destination: String,
        arguments: [String: String] = [:],
        metadata: [String: String] = [:]
    ) -> some View {
        modifier(TrackNavigationModifier(
            destination: destination,
            arguments: arguments,
            metadata: metadata
        ))
    }
}
