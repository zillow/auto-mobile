import Foundation

/// Biometric authentication result for test injection.
public enum BiometricResult: Sendable, Equatable {
    case success
    case failure
    case cancel
    case error(code: Int, message: String)
}

/// Test hook for deterministic biometric testing.
/// Allows tests to inject biometric authentication results.
public final class AutoMobileBiometrics: @unchecked Sendable {
    public static let shared = AutoMobileBiometrics()

    /// Notification posted when a biometric override is set.
    public static let overrideNotification = Notification.Name(
        "dev.jasonpearson.automobile.sdk.BIOMETRIC_OVERRIDE"
    )

    private let lock = NSLock()
    private var _override: BiometricResult?
    private var _overrideExpiry: Date?

    private init() {}

    /// Override the next biometric authentication result.
    /// The override expires after `ttlMs` milliseconds.
    public func overrideResult(_ result: BiometricResult, ttlMs: Double = 5000) {
        lock.lock()
        _override = result
        _overrideExpiry = Date().addingTimeInterval(ttlMs / 1000.0)
        lock.unlock()

        NotificationCenter.default.post(
            name: Self.overrideNotification,
            object: nil,
            userInfo: ["result": result]
        )
    }

    /// Consume the current override. Returns nil if no override is set or it has expired.
    /// This is a one-shot operation — the override is cleared after consumption.
    public func consumeOverride() -> BiometricResult? {
        lock.lock()
        defer { lock.unlock() }

        guard let result = _override, let expiry = _overrideExpiry else {
            return nil
        }

        // Check if expired
        guard Date() < expiry else {
            _override = nil
            _overrideExpiry = nil
            return nil
        }

        _override = nil
        _overrideExpiry = nil
        return result
    }

    /// Clear any pending override.
    public func clearOverride() {
        lock.lock()
        _override = nil
        _overrideExpiry = nil
        lock.unlock()
    }

    /// Whether an override is currently set and not expired.
    public var hasOverride: Bool {
        lock.lock()
        defer { lock.unlock() }
        guard let expiry = _overrideExpiry else { return false }
        return Date() < expiry
    }

    // MARK: - Testing Support

    internal func reset() {
        lock.lock()
        _override = nil
        _overrideExpiry = nil
        lock.unlock()
    }
}
