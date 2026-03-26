import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Automatic tap tracking.
/// iOS equivalent of Android's AutoMobileClickTracker.
/// Tracks user taps with coordinates, target view info, and accessibility labels.
public final class AutoMobileInteractionTracker: @unchecked Sendable {
    public static let shared = AutoMobileInteractionTracker()

    private let lock = NSLock()
    private weak var buffer: SdkEventBuffer?
    private var bundleId: String?
    private var _isEnabled = false
    private var lastTapProcessedAt: TimeInterval = 0

    /// Minimum interval between tap event processing (milliseconds).
    static let tapDebounceMs: TimeInterval = 100

    private init() {}

    func initialize(bundleId: String?, buffer: SdkEventBuffer) {
        lock.lock()
        self.bundleId = bundleId
        self.buffer = buffer
        lock.unlock()
    }

    /// Whether interaction tracking is enabled.
    public var isEnabled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isEnabled
    }

    /// Enable or disable interaction tracking.
    /// When enabled, call `recordTap` from your gesture recognizers or SwiftUI tap handlers.
    public func setEnabled(_ enabled: Bool) {
        lock.lock()
        _isEnabled = enabled
        lock.unlock()
    }

    /// Record a tap event at the given coordinates.
    /// Optionally include information about the tapped element.
    public func recordTap(
        x: Double,
        y: Double,
        accessibilityLabel: String? = nil,
        accessibilityIdentifier: String? = nil,
        viewType: String? = nil,
        text: String? = nil
    ) {
        guard AutoMobileSDK.shared.isEnabled else { return }

        lock.lock()
        guard _isEnabled else {
            lock.unlock()
            return
        }

        let now = Date().timeIntervalSince1970
        let elapsed = (now - lastTapProcessedAt) * 1000
        guard elapsed >= Self.tapDebounceMs else {
            lock.unlock()
            return
        }
        lastTapProcessedAt = now

        let currentBuffer = buffer
        lock.unlock()

        var properties: [String: String] = [
            "x": String(format: "%.1f", x),
            "y": String(format: "%.1f", y),
        ]

        if let label = accessibilityLabel, !label.isEmpty {
            properties["accessibilityLabel"] = label
        }
        if let identifier = accessibilityIdentifier, !identifier.isEmpty {
            properties["accessibilityIdentifier"] = identifier
        }
        if let viewType = viewType, !viewType.isEmpty {
            properties["viewType"] = viewType
        }
        if let text = text, !text.isEmpty {
            properties["text"] = text
        }

        let event = SdkCustomEvent(name: "_auto_tap", properties: properties)
        currentBuffer?.add(event)
    }

    #if canImport(UIKit)
    /// Record a tap from a UITapGestureRecognizer.
    /// Inspects the view hierarchy to extract accessibility info from the tapped view.
    public func recordTap(from recognizer: UITapGestureRecognizer, in view: UIView) {
        guard isEnabled else { return }

        let location = recognizer.location(in: view)
        let hitView = view.hitTest(location, with: nil)

        recordTap(
            x: Double(location.x),
            y: Double(location.y),
            accessibilityLabel: hitView?.accessibilityLabel,
            accessibilityIdentifier: hitView?.accessibilityIdentifier,
            viewType: hitView.map { String(describing: type(of: $0)) },
            text: (hitView as? UILabel)?.text ?? (hitView as? UIButton)?.titleLabel?.text
        )
    }
    #endif

    // MARK: - Testing Support

    internal func reset() {
        lock.lock()
        buffer = nil
        bundleId = nil
        _isEnabled = false
        lastTapProcessedAt = 0
        lock.unlock()
    }
}
