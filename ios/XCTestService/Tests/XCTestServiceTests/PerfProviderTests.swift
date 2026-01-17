import XCTest
@testable import XCTestService

/// Simple reference wrapper for use in test closures to avoid Swift concurrency warnings
/// about mutation of captured variables.
private final class Box<T>: @unchecked Sendable {
    var value: T
    init(_ value: T) { self.value = value }
}

final class PerfProviderTests: XCTestCase {
    var fakeTimeProvider: FakeTimeProvider!
    var perfProvider: PerfProvider!

    override func setUp() {
        super.setUp()
        fakeTimeProvider = FakeTimeProvider(initialTime: 1000)
        perfProvider = PerfProvider.createForTesting(timeProvider: fakeTimeProvider)
    }

    override func tearDown() {
        perfProvider.clear()
        PerfProvider.resetInstance()
        super.tearDown()
    }

    // MARK: - Basic Operation Tests

    func testTrackSingleOperation() {
        fakeTimeProvider.setTime(1000)

        perfProvider.startOperation("testOp")

        fakeTimeProvider.setTime(1050)

        perfProvider.endOperation("testOp")

        let timings = perfProvider.flush()
        XCTAssertNotNil(timings)
        XCTAssertEqual(timings?.count, 1)
        XCTAssertEqual(timings?.first?.name, "testOp")
        XCTAssertEqual(timings?.first?.durationMs, 50)
    }

    func testTrackWithBlock() {
        fakeTimeProvider.setTime(1000)

        let result = perfProvider.track("operation") {
            fakeTimeProvider.advance(by: 100)
            return "result"
        }

        XCTAssertEqual(result, "result")

        let timings = perfProvider.flush()
        XCTAssertNotNil(timings)
        XCTAssertEqual(timings?.first?.durationMs, 100)
    }

    func testNestedOperations() {
        fakeTimeProvider.setTime(1000)

        perfProvider.startOperation("outer")
        fakeTimeProvider.advance(by: 10)

        perfProvider.startOperation("inner")
        fakeTimeProvider.advance(by: 50)
        perfProvider.endOperation("inner")

        fakeTimeProvider.advance(by: 10)
        perfProvider.endOperation("outer")

        let timings = perfProvider.flush()
        XCTAssertNotNil(timings)
        XCTAssertEqual(timings?.count, 1)

        let outer = timings?.first
        XCTAssertEqual(outer?.name, "outer")
        XCTAssertEqual(outer?.durationMs, 70)
        XCTAssertEqual(outer?.children?.count, 1)

        let inner = outer?.children?.first
        XCTAssertEqual(inner?.name, "inner")
        XCTAssertEqual(inner?.durationMs, 50)
    }

    // MARK: - Serial/Parallel Block Tests

    func testSerialBlock() {
        fakeTimeProvider.setTime(1000)

        perfProvider.serial("serialBlock")
        fakeTimeProvider.advance(by: 100)
        perfProvider.end()

        let timings = perfProvider.flush()
        XCTAssertNotNil(timings)
        XCTAssertEqual(timings?.first?.name, "serialBlock")
        XCTAssertEqual(timings?.first?.durationMs, 100)
    }

    func testParallelBlock() {
        fakeTimeProvider.setTime(1000)

        perfProvider.parallel("parallelBlock")
        fakeTimeProvider.advance(by: 50)
        perfProvider.end()

        let timings = perfProvider.flush()
        XCTAssertNotNil(timings)
        XCTAssertEqual(timings?.first?.name, "parallelBlock")
        XCTAssertEqual(timings?.first?.durationMs, 50)
    }

    func testIndependentRoot() {
        fakeTimeProvider.setTime(1000)

        // Start first root
        perfProvider.serial("first")
        fakeTimeProvider.advance(by: 50)

        // Start independent root - should close first and start new
        perfProvider.independentRoot("second")
        fakeTimeProvider.advance(by: 30)
        perfProvider.end()

        let timings = perfProvider.flush()
        XCTAssertNotNil(timings)
        XCTAssertEqual(timings?.count, 2)

        // First should be completed with 50ms
        let first = timings?.first(where: { $0.name == "first" })
        XCTAssertNotNil(first)
        XCTAssertEqual(first?.durationMs, 50)

        // Second should have 30ms
        let second = timings?.first(where: { $0.name == "second" })
        XCTAssertNotNil(second)
        XCTAssertEqual(second?.durationMs, 30)
    }

    // MARK: - Debounce Tests

    func testDebounceTracking() {
        perfProvider.recordDebounce()
        perfProvider.recordDebounce()
        perfProvider.recordDebounce()

        let timings = perfProvider.flush()
        XCTAssertNotNil(timings)

        let debounceInfo = timings?.first(where: { $0.name == "debounce" })
        XCTAssertNotNil(debounceInfo)

        let countChild = debounceInfo?.children?.first(where: { $0.name == "count" })
        XCTAssertEqual(countChild?.durationMs, 3) // 3 debounces recorded
    }

    // MARK: - Flush and Clear Tests

    func testFlushReturnsNilWhenEmpty() {
        let timings = perfProvider.flush()
        XCTAssertNil(timings)
    }

    func testFlushClearsData() {
        perfProvider.startOperation("op")
        fakeTimeProvider.advance(by: 10)
        perfProvider.endOperation("op")

        _ = perfProvider.flush()
        let secondFlush = perfProvider.flush()
        XCTAssertNil(secondFlush)
    }

    func testClear() {
        perfProvider.startOperation("op")
        perfProvider.clear()

        XCTAssertFalse(perfProvider.hasData)
        XCTAssertNil(perfProvider.flush())
    }

    func testHasData() {
        XCTAssertFalse(perfProvider.hasData)

        perfProvider.startOperation("op")
        // hasData might be true during operation or after completion
        perfProvider.endOperation("op")

        XCTAssertTrue(perfProvider.hasData)
    }

    // MARK: - Peek Tests

    func testPeekDoesNotClearData() {
        perfProvider.startOperation("op")
        fakeTimeProvider.advance(by: 50)
        perfProvider.endOperation("op")

        let peeked = perfProvider.peek()
        XCTAssertEqual(peeked.count, 1)

        // Data should still be there
        XCTAssertTrue(perfProvider.hasData)
        let flushed = perfProvider.flush()
        XCTAssertNotNil(flushed)
    }

    // MARK: - Thread Safety Tests

    func testConcurrentOperations() {
        let expectation = self.expectation(description: "concurrent operations")
        expectation.expectedFulfillmentCount = 10

        for i in 0 ..< 10 {
            DispatchQueue.global().async {
                self.perfProvider.startOperation("op\(i)")
                Thread.sleep(forTimeInterval: 0.001)
                self.perfProvider.endOperation("op\(i)")
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 5.0)

        // Should not crash and should have data
        let timings = perfProvider.flush()
        XCTAssertNotNil(timings)
    }
}

// MARK: - FakeTimeProvider Tests

final class FakeTimeProviderTests: XCTestCase {
    func testInitialTime() {
        let provider = FakeTimeProvider(initialTime: 5000)
        XCTAssertEqual(provider.currentTimeMillis(), 5000)
    }

    func testSetTime() {
        let provider = FakeTimeProvider()
        provider.setTime(10000)
        XCTAssertEqual(provider.currentTimeMillis(), 10000)
    }

    func testAdvance() {
        let provider = FakeTimeProvider(initialTime: 1000)
        provider.advance(by: 500)
        XCTAssertEqual(provider.currentTimeMillis(), 1500)
    }

    func testReset() {
        let provider = FakeTimeProvider(initialTime: 5000)
        provider.reset()
        XCTAssertEqual(provider.currentTimeMillis(), 0)
    }
}

// MARK: - FakeTimer Tests

final class FakeTimerTests: XCTestCase {
    func testInstantMode() async {
        let timer = FakeTimer(mode: .instant, initialTime: 1000)

        let before = timer.now()
        await timer.wait(milliseconds: 100)
        let after = timer.now()

        // Time should advance by the wait amount
        XCTAssertEqual(after - before, 100)
    }

    func testManualModeAdvance() {
        let timer = FakeTimer(mode: .manual, initialTime: 0)

        let callbackFired = Box(false)
        timer.schedule(after: 50) {
            callbackFired.value = true
        }

        XCTAssertFalse(callbackFired.value)

        timer.advance(by: 50)
        XCTAssertTrue(callbackFired.value)
    }

    func testScheduleMultipleCallbacks() {
        let timer = FakeTimer(mode: .instant, initialTime: 0)

        let order = Box<[Int]>([])
        timer.schedule(after: 30) { order.value.append(2) }
        timer.schedule(after: 10) { order.value.append(1) }
        timer.schedule(after: 50) { order.value.append(3) }

        // In instant mode, callbacks fire immediately when scheduled
        // They fire in schedule order, not target time order
        XCTAssertEqual(order.value, [2, 1, 3])
    }

    func testReset() {
        let timer = FakeTimer(mode: .manual, initialTime: 1000)
        timer.schedule(after: 50) {}

        XCTAssertEqual(timer.pendingCallbackCount, 1)

        timer.reset()

        XCTAssertEqual(timer.now(), 0)
        XCTAssertEqual(timer.pendingCallbackCount, 0)
    }
}
