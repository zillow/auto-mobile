import XCTest
@testable import AutoMobileSDK

final class InteractionTrackerTests: XCTestCase {
    private var tracker: AutoMobileInteractionTracker!
    private var buffer: SdkEventBuffer!
    private var receivedEvents: [any SdkEvent]!

    override func setUp() {
        super.setUp()
        receivedEvents = []
        buffer = SdkEventBuffer { [weak self] events in
            self?.receivedEvents.append(contentsOf: events)
        }
        buffer.start()
        tracker = AutoMobileInteractionTracker.shared
        tracker.initialize(bundleId: "test.bundle", buffer: buffer)
    }

    override func tearDown() {
        tracker.reset()
        buffer.shutdown()
        super.tearDown()
    }

    func testRecordTapWhenDisabled() {
        tracker.setEnabled(false)
        tracker.recordTap(x: 100, y: 200)

        // No events should be recorded
        buffer.flush()
        XCTAssertTrue(receivedEvents.isEmpty)
    }

    func testRecordTapWhenEnabled() {
        tracker.setEnabled(true)
        tracker.recordTap(x: 100.5, y: 200.3, accessibilityLabel: "Submit", viewType: "UIButton")

        buffer.flush()
        let tapEvents = receivedEvents.compactMap { $0 as? SdkCustomEvent }
        XCTAssertEqual(tapEvents.count, 1)

        let event = tapEvents[0]
        XCTAssertEqual(event.name, "_auto_tap")
        XCTAssertEqual(event.properties["x"], "100.5")
        XCTAssertEqual(event.properties["y"], "200.3")
        XCTAssertEqual(event.properties["accessibilityLabel"], "Submit")
        XCTAssertEqual(event.properties["viewType"], "UIButton")
    }

    func testTapDebouncing() {
        tracker.setEnabled(true)
        // Record multiple taps quickly
        tracker.recordTap(x: 10, y: 20)
        tracker.recordTap(x: 30, y: 40) // Should be debounced
        tracker.recordTap(x: 50, y: 60) // Should be debounced

        buffer.flush()
        let tapEvents = receivedEvents.compactMap { $0 as? SdkCustomEvent }
        // Only first tap should be recorded due to debounce
        XCTAssertEqual(tapEvents.count, 1)
    }

    func testEmptyStringsNotIncludedInProperties() {
        tracker.setEnabled(true)
        tracker.recordTap(x: 10, y: 20, accessibilityLabel: "", text: "")

        buffer.flush()
        let tapEvents = receivedEvents.compactMap { $0 as? SdkCustomEvent }
        XCTAssertEqual(tapEvents.count, 1)
        XCTAssertNil(tapEvents[0].properties["accessibilityLabel"])
        XCTAssertNil(tapEvents[0].properties["text"])
    }

    func testIsEnabledDefaultsFalse() {
        XCTAssertFalse(tracker.isEnabled)
    }
}
