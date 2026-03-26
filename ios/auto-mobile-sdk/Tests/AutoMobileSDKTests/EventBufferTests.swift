import XCTest
@testable import AutoMobileSDK

final class SdkEventBufferTests: XCTestCase {
    func testFlushOnCapacity() {
        let expectation = XCTestExpectation(description: "flush called")
        var flushedEvents: [any SdkEvent] = []

        let buffer = SdkEventBuffer(maxBufferSize: 3, flushIntervalMs: 60000) { events in
            flushedEvents = events
            expectation.fulfill()
        }

        buffer.add(SdkCustomEvent(name: "e1"))
        buffer.add(SdkCustomEvent(name: "e2"))
        XCTAssertTrue(flushedEvents.isEmpty)

        buffer.add(SdkCustomEvent(name: "e3"))
        wait(for: [expectation], timeout: 1.0)

        XCTAssertEqual(flushedEvents.count, 3)
    }

    func testFlushOnTimer() {
        let expectation = XCTestExpectation(description: "timer flush")
        var flushedEvents: [any SdkEvent] = []

        let fakeTimer = FakeTimer()
        let buffer = SdkEventBuffer(
            maxBufferSize: 100,
            flushIntervalMs: 500,
            timerFactory: { fakeTimer }
        ) { events in
            flushedEvents = events
            expectation.fulfill()
        }

        buffer.start()
        buffer.add(SdkCustomEvent(name: "e1"))
        buffer.add(SdkCustomEvent(name: "e2"))

        // Manually fire the timer
        fakeTimer.fire()
        wait(for: [expectation], timeout: 1.0)

        XCTAssertEqual(flushedEvents.count, 2)
    }

    func testShutdownFlushesRemaining() {
        var flushedEvents: [any SdkEvent] = []

        let buffer = SdkEventBuffer(maxBufferSize: 100, flushIntervalMs: 60000) { events in
            flushedEvents = events
        }

        buffer.add(SdkCustomEvent(name: "e1"))
        buffer.add(SdkCustomEvent(name: "e2"))
        buffer.shutdown()

        XCTAssertEqual(flushedEvents.count, 2)
    }

    func testEmptyFlushDoesNothing() {
        var flushCount = 0

        let buffer = SdkEventBuffer(maxBufferSize: 100, flushIntervalMs: 60000) { _ in
            flushCount += 1
        }

        buffer.flush()
        XCTAssertEqual(flushCount, 0)
    }

    func testTimerScheduledOnStart() {
        let fakeTimer = FakeTimer()
        let buffer = SdkEventBuffer(
            maxBufferSize: 100,
            flushIntervalMs: 500,
            timerFactory: { fakeTimer }
        ) { _ in }

        buffer.start()
        XCTAssertEqual(fakeTimer.intervalMs, 500)
        XCTAssertFalse(fakeTimer.isCancelled)

        buffer.shutdown()
        XCTAssertTrue(fakeTimer.isCancelled)
    }
}
