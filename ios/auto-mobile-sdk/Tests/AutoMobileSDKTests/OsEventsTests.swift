import XCTest
@testable import AutoMobileSDK

final class OsEventsTests: XCTestCase {
    func testOsEventsInitializesOnce() {
        let buffer = SdkEventBuffer { _ in }
        buffer.start()

        AutoMobileOsEvents.shared.initialize(bundleId: "test.bundle", buffer: buffer)
        // Second call should be a no-op
        AutoMobileOsEvents.shared.initialize(bundleId: "test.bundle", buffer: buffer)

        AutoMobileOsEvents.shared.reset()
        buffer.shutdown()
    }

    func testOsEventsShutdownCleansUp() {
        let buffer = SdkEventBuffer { _ in }
        buffer.start()

        AutoMobileOsEvents.shared.initialize(bundleId: "test.bundle", buffer: buffer)
        AutoMobileOsEvents.shared.reset()

        // Should be able to re-initialize after reset
        AutoMobileOsEvents.shared.initialize(bundleId: "test.bundle", buffer: buffer)
        AutoMobileOsEvents.shared.reset()

        buffer.shutdown()
    }
}

final class NotificationObserverTests: XCTestCase {
    func testObserverInitializesOnce() {
        let buffer = SdkEventBuffer { _ in }
        buffer.start()

        AutoMobileNotificationObserver.shared.initialize(bundleId: "test.bundle", buffer: buffer)
        // Second call should be a no-op
        AutoMobileNotificationObserver.shared.initialize(bundleId: "test.bundle", buffer: buffer)

        AutoMobileNotificationObserver.shared.reset()
        buffer.shutdown()
    }

    func testObserverShutdownCleansUp() {
        let buffer = SdkEventBuffer { _ in }
        buffer.start()

        AutoMobileNotificationObserver.shared.initialize(bundleId: "test.bundle", buffer: buffer)
        AutoMobileNotificationObserver.shared.reset()

        // Should be able to re-initialize after reset
        AutoMobileNotificationObserver.shared.initialize(bundleId: "test.bundle", buffer: buffer)
        AutoMobileNotificationObserver.shared.reset()

        buffer.shutdown()
    }
}
