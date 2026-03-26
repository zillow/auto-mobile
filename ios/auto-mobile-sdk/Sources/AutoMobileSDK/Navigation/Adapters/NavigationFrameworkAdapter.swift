import Foundation

/// Base protocol for navigation framework adapters.
/// Each adapter bridges a specific navigation framework to the AutoMobile SDK.
public protocol NavigationFrameworkAdapter: AnyObject, Sendable {
    /// Start tracking navigation events.
    func start()

    /// Stop tracking navigation events.
    func stop()

    /// Whether the adapter is currently tracking.
    var isActive: Bool { get }
}
