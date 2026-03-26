import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Tracks handled (non-fatal) exceptions and errors.
/// iOS equivalent of Android's AutoMobileFailures.
public final class AutoMobileFailures: @unchecked Sendable {
    public static let shared = AutoMobileFailures()

    private let lock = NSLock()
    private var bundleId: String?
    private weak var buffer: SdkEventBuffer?
    private var events: [HandledExceptionEvent] = []
    private let maxEvents = 100

    private init() {}

    func initialize(bundleId: String?, buffer: SdkEventBuffer) {
        lock.lock()
        self.bundleId = bundleId
        self.buffer = buffer
        lock.unlock()
    }

    /// Record a handled exception/error.
    public func recordHandledException(
        _ error: Error,
        message: String? = nil,
        currentScreen: String? = nil
    ) {
        guard AutoMobileSDK.shared.isEnabled else { return }
        let nsError = error as NSError
        let event = HandledExceptionEvent(
            timestamp: Int64(Date().timeIntervalSince1970 * 1000),
            errorDomain: nsError.domain,
            errorMessage: nsError.localizedDescription,
            stackTrace: Thread.callStackSymbols.joined(separator: "\n"),
            customMessage: message,
            currentScreen: currentScreen,
            bundleId: bundleId ?? Bundle.main.bundleIdentifier ?? "",
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
            deviceInfo: Self.currentDeviceInfo()
        )

        lock.lock()
        events.append(event)
        if events.count > maxEvents {
            events.removeFirst(events.count - maxEvents)
        }
        let currentBuffer = buffer
        lock.unlock()

        let sdkEvent = SdkHandledExceptionEvent(
            timestamp: event.timestamp,
            errorDomain: event.errorDomain,
            errorMessage: event.errorMessage,
            stackTrace: event.stackTrace,
            customMessage: event.customMessage,
            currentScreen: event.currentScreen,
            bundleId: event.bundleId,
            appVersion: event.appVersion,
            deviceInfo: event.deviceInfo
        )
        currentBuffer?.add(sdkEvent)
    }

    /// Get recent handled exception events.
    public func getRecentEvents() -> [HandledExceptionEvent] {
        lock.lock()
        defer { lock.unlock() }
        return events
    }

    /// Clear all stored events.
    public func clearEvents() {
        lock.lock()
        defer { lock.unlock() }
        events.removeAll()
    }

    /// Number of stored events.
    public var eventCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return events.count
    }

    // MARK: - Device Info

    static func currentDeviceInfo() -> SdkDeviceInfo {
        #if canImport(UIKit) && !os(watchOS)
        let device = UIDevice.current
        return SdkDeviceInfo(
            model: device.model,
            osVersion: device.systemVersion,
            systemName: device.systemName
        )
        #else
        var systemInfo = utsname()
        uname(&systemInfo)
        let machine = withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(validatingUTF8: $0) ?? "Unknown"
            }
        }
        return SdkDeviceInfo(
            model: machine,
            osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
            systemName: "macOS"
        )
        #endif
    }

    // MARK: - Testing Support

    internal func reset() {
        lock.lock()
        bundleId = nil
        buffer = nil
        events.removeAll()
        lock.unlock()
    }
}

// MARK: - HandledExceptionEvent

public struct HandledExceptionEvent: Sendable {
    public let timestamp: Int64
    public let errorDomain: String
    public let errorMessage: String?
    public let stackTrace: String
    public let customMessage: String?
    public let currentScreen: String?
    public let bundleId: String
    public let appVersion: String?
    public let deviceInfo: SdkDeviceInfo

    public init(
        timestamp: Int64,
        errorDomain: String,
        errorMessage: String?,
        stackTrace: String,
        customMessage: String?,
        currentScreen: String?,
        bundleId: String,
        appVersion: String?,
        deviceInfo: SdkDeviceInfo
    ) {
        self.timestamp = timestamp
        self.errorDomain = errorDomain
        self.errorMessage = errorMessage
        self.stackTrace = stackTrace
        self.customMessage = customMessage
        self.currentScreen = currentScreen
        self.bundleId = bundleId
        self.appVersion = appVersion
        self.deviceInfo = deviceInfo
    }
}
