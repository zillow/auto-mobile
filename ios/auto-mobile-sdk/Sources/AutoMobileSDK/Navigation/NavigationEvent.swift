import Foundation

/// Represents a navigation event within the app.
public struct NavigationEvent: Sendable {
    /// Destination identifier (route, screen name, deep link).
    public let destination: String

    /// Navigation framework source.
    public let source: NavigationSource

    /// Event timestamp (milliseconds since epoch, matches Android SDK).
    public let timestamp: Int64

    /// Navigation arguments (stringified for wire compatibility).
    /// Use the convenience init with `[String: Any]` to pass mixed types.
    public let arguments: [String: String]

    /// Additional metadata.
    public let metadata: [String: String]

    public init(
        destination: String,
        source: NavigationSource,
        timestamp: Int64 = Int64(Date().timeIntervalSince1970 * 1000),
        arguments: [String: String] = [:],
        metadata: [String: String] = [:]
    ) {
        self.destination = destination
        self.source = source
        self.timestamp = timestamp
        self.arguments = arguments
        self.metadata = metadata
    }

    /// Convenience init that accepts mixed-type arguments (matching Android's Map<String, Any?>).
    /// Values are converted to strings for wire compatibility.
    public init(
        destination: String,
        source: NavigationSource,
        timestamp: Int64 = Int64(Date().timeIntervalSince1970 * 1000),
        mixedArguments: [String: Any],
        metadata: [String: String] = [:]
    ) {
        self.destination = destination
        self.source = source
        self.timestamp = timestamp
        self.arguments = mixedArguments.compactMapValues { value in
            if let stringValue = value as? String { return stringValue }
            return String(describing: value)
        }
        self.metadata = metadata
    }
}
