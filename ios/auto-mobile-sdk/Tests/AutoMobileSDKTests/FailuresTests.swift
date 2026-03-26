import XCTest
@testable import AutoMobileSDK

final class AutoMobileFailuresTests: XCTestCase {
    override func tearDown() {
        AutoMobileFailures.shared.reset()
        super.tearDown()
    }

    func testRecordHandledException() {
        AutoMobileFailures.shared.initialize(
            bundleId: "com.test.app",
            buffer: SdkEventBuffer(maxBufferSize: 100, flushIntervalMs: 60000) { _ in }
        )

        let error = NSError(domain: "TestDomain", code: 42, userInfo: [
            NSLocalizedDescriptionKey: "Something went wrong",
        ])

        AutoMobileFailures.shared.recordHandledException(error, message: "custom msg")

        XCTAssertEqual(AutoMobileFailures.shared.eventCount, 1)
        let events = AutoMobileFailures.shared.getRecentEvents()
        XCTAssertEqual(events.first?.errorDomain, "TestDomain")
        XCTAssertEqual(events.first?.customMessage, "custom msg")
    }

    func testClearEvents() {
        AutoMobileFailures.shared.initialize(
            bundleId: "com.test.app",
            buffer: SdkEventBuffer(maxBufferSize: 100, flushIntervalMs: 60000) { _ in }
        )

        let error = NSError(domain: "Test", code: 1)
        AutoMobileFailures.shared.recordHandledException(error)
        XCTAssertEqual(AutoMobileFailures.shared.eventCount, 1)

        AutoMobileFailures.shared.clearEvents()
        XCTAssertEqual(AutoMobileFailures.shared.eventCount, 0)
    }

    func testMaxEventsLimit() {
        AutoMobileFailures.shared.initialize(
            bundleId: "com.test.app",
            buffer: SdkEventBuffer(maxBufferSize: 1000, flushIntervalMs: 60000) { _ in }
        )

        for i in 0..<150 {
            let error = NSError(domain: "Test", code: i)
            AutoMobileFailures.shared.recordHandledException(error)
        }

        XCTAssertEqual(AutoMobileFailures.shared.eventCount, 100)
    }
}
