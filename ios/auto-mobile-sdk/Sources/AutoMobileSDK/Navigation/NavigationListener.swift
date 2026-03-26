import Foundation

/// Functional interface for receiving navigation events.
public protocol NavigationListener: AnyObject, Sendable {
    func onNavigationEvent(_ event: NavigationEvent)
}

/// Closure-based navigation listener for convenience.
public final class BlockNavigationListener: NavigationListener, @unchecked Sendable {
    private let block: @Sendable (NavigationEvent) -> Void

    public init(_ block: @escaping @Sendable (NavigationEvent) -> Void) {
        self.block = block
    }

    public func onNavigationEvent(_ event: NavigationEvent) {
        block(event)
    }
}
