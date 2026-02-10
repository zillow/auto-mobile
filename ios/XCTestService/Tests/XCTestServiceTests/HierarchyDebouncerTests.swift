import XCTest
@testable import XCTestService

/// Simple reference wrapper for use in test closures to avoid Swift concurrency warnings.
private final class Box<T>: @unchecked Sendable {
    var value: T
    init(_ value: T) {
        self.value = value
    }
}

final class HierarchyDebouncerTests: XCTestCase {
    var fakeLocator: FakeElementLocator!
    var fakeTimer: FakeTimer!
    var debouncer: HierarchyDebouncer!

    override func setUp() {
        super.setUp()
        fakeLocator = FakeElementLocator()
        fakeTimer = FakeTimer(mode: .manual, initialTime: 0)
        debouncer = HierarchyDebouncer(
            elementLocator: fakeLocator,
            timer: fakeTimer,
            pollIntervalMs: 10
        )
    }

    override func tearDown() {
        debouncer.stop()
        fakeTimer.reset()
        super.tearDown()
    }

    // MARK: - Polling Resilience Tests

    func testContinuesPollingAfterExtractionError() {
        // Configure locator to throw on first calls
        let testError = NSError(domain: "test", code: 1, userInfo: nil)
        fakeLocator.setShouldThrow(testError)

        let results = Box<[HierarchyResult]>([])
        debouncer.setOnResult { result in
            results.value.append(result)
        }

        debouncer.start()

        // Initial capture should fail (throws), but debouncer should still be running
        XCTAssertTrue(debouncer.isRunning)

        // Advance past the poll interval to trigger a poll cycle - still throwing
        fakeTimer.advance(by: 10)
        XCTAssertTrue(debouncer.isRunning, "Debouncer should keep running after extraction error")
        XCTAssertEqual(results.value.count, 0, "No results should be emitted during errors")

        // Now stop throwing and provide a hierarchy
        fakeLocator.setShouldThrow(nil)
        let hierarchy = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy)

        // Advance past debounce window so broadcast is allowed
        fakeTimer.advance(by: HierarchyDebouncer.broadcastDebounceMs + 10)

        // Should have recovered and emitted a result
        XCTAssertTrue(debouncer.isRunning, "Debouncer should still be running after recovery")
        XCTAssertEqual(results.value.count, 1, "Should emit result after recovery from error")
    }

    func testStartCapturesInitialState() {
        let hierarchy = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy)

        debouncer.start()

        XCTAssertTrue(debouncer.isRunning)
        let lastHierarchy = debouncer.getLastHierarchy()
        XCTAssertNotNil(lastHierarchy)
        XCTAssertEqual(lastHierarchy?.packageName, "com.test.app")
    }

    func testStartBroadcastsInitialState() {
        let hierarchy = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy)

        let results = Box<[HierarchyResult]>([])
        debouncer.setOnResult { result in
            results.value.append(result)
        }

        debouncer.start()

        // Initial state should be broadcast immediately via onResult
        XCTAssertEqual(results.value.count, 1, "Initial state should be broadcast on start")
        if case let .changed(h, _, _) = results.value.first {
            XCTAssertEqual(h.packageName, "com.test.app")
        } else {
            XCTFail("Expected .changed result for initial broadcast")
        }
    }

    func testStopPreventsPolling() {
        debouncer.start()
        XCTAssertTrue(debouncer.isRunning)

        debouncer.stop()
        XCTAssertFalse(debouncer.isRunning)

        // Advancing timer should not trigger any polling
        let initialCount = fakeLocator.hierarchyRequestCount
        fakeTimer.advance(by: 100)
        XCTAssertEqual(fakeLocator.hierarchyRequestCount, initialCount)
    }

    func testExtractNowBlockingReturnsHierarchy() {
        let hierarchy = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy)

        debouncer.start()
        let result = debouncer.extractNowBlocking(skipFlowEmit: true)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.packageName, "com.test.app")
    }

    func testDetectsStructuralChange() {
        let hierarchy1 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy1)

        let results = Box<[HierarchyResult]>([])
        debouncer.setOnResult { result in
            results.value.append(result)
        }

        debouncer.start()

        // Change hierarchy to include a new element (structural change)
        let hierarchy2 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812),
                node: [
                    UIElementInfo(
                        text: "New Button",
                        className: "UIButton",
                        bounds: ElementBounds(left: 10, top: 10, right: 100, bottom: 50),
                        clickable: "true",
                        role: "button"
                    ),
                ]
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy2)

        // Advance past debounce window
        fakeTimer.advance(by: HierarchyDebouncer.broadcastDebounceMs + 10)

        // 2 results: initial broadcast + structural change
        XCTAssertEqual(results.value.count, 2)
        if case let .changed(hierarchy, _, _) = results.value.last {
            XCTAssertEqual(hierarchy.packageName, "com.test.app")
        } else {
            XCTFail("Expected .changed result")
        }
    }

    func testResetClearsState() {
        let hierarchy = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy)

        debouncer.start()
        XCTAssertNotNil(debouncer.getLastHierarchy())

        debouncer.reset()
        XCTAssertNil(debouncer.getLastHierarchy())
    }

    // MARK: - Debounce Resilience Tests

    func testDebouncedChangeIsEventuallyBroadcast() {
        // This tests the fix for a bug where the last change in a rapid sequence
        // could be silently dropped: the hash was updated but the broadcast was
        // debounced, so subsequent polls saw no change and entered animation mode.

        let hierarchy1 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy1)

        let results = Box<[HierarchyResult]>([])
        debouncer.setOnResult { result in
            results.value.append(result)
        }

        debouncer.start()

        // First change - advance past debounce to broadcast
        let hierarchy2 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812),
                node: [
                    UIElementInfo(
                        text: "Button A",
                        className: "UIButton",
                        bounds: ElementBounds(left: 10, top: 10, right: 100, bottom: 50),
                        clickable: "true",
                        role: "button"
                    ),
                ]
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy2)
        fakeTimer.advance(by: HierarchyDebouncer.broadcastDebounceMs + 10)
        XCTAssertEqual(results.value.count, 2, "Initial broadcast + first change should be broadcast")

        // Second change immediately after - within debounce window
        // This simulates a permission dialog appearing right after a UI change
        let hierarchy3 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812),
                node: [
                    UIElementInfo(
                        text: "Button A",
                        className: "UIButton",
                        bounds: ElementBounds(left: 10, top: 10, right: 100, bottom: 50),
                        clickable: "true",
                        role: "button"
                    ),
                    UIElementInfo(
                        text: "Permission Dialog",
                        className: "UIAlertController",
                        bounds: ElementBounds(left: 20, top: 300, right: 355, bottom: 500),
                        clickable: "true"
                    ),
                ]
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeLocator.setHierarchy(hierarchy3)

        // Advance just past poll interval but within debounce window (should detect but not broadcast yet)
        fakeTimer.advance(by: 10)
        XCTAssertEqual(results.value.count, 2, "Change within debounce window should not broadcast yet")

        // Now advance past the debounce window - the change MUST eventually be broadcast
        fakeTimer.advance(by: HierarchyDebouncer.broadcastDebounceMs + 10)
        XCTAssertEqual(results.value.count, 3, "Debounced change must eventually be broadcast")

        // Verify the broadcast contains the dialog
        if case let .changed(hierarchy, _, _) = results.value.last {
            let hasDialog = hierarchy.hierarchy?.node?.contains { $0.text == "Permission Dialog" } ?? false
            XCTAssertTrue(hasDialog, "Broadcast should contain the permission dialog")
        } else {
            XCTFail("Expected .changed result")
        }
    }

    // MARK: - StructuralHasher Tests

    func testHashChangesWhenAlertNodesAdded() {
        let hierarchyWithoutAlert = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "XCUIApplication",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812),
                node: [
                    UIElementInfo(
                        text: "Hello",
                        className: "UILabel",
                        bounds: ElementBounds(left: 10, top: 10, right: 200, bottom: 30),
                        role: "text"
                    ),
                ]
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )

        let hierarchyWithAlert = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "XCUIApplication",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812),
                node: [
                    UIElementInfo(
                        text: "Hello",
                        className: "UILabel",
                        bounds: ElementBounds(left: 10, top: 10, right: 200, bottom: 30),
                        role: "text"
                    ),
                    UIElementInfo(
                        text: "\u{201c}App\u{201d} Would Like to Send You Notifications",
                        className: "UIAlertController",
                        bounds: ElementBounds(left: 20, top: 300, right: 355, bottom: 500),
                        node: [
                            UIElementInfo(
                                text: "Allow",
                                className: "UIButton",
                                bounds: ElementBounds(left: 20, top: 450, right: 180, bottom: 490),
                                clickable: "true",
                                role: "button"
                            ),
                            UIElementInfo(
                                text: "Don\u{2019}t Allow",
                                className: "UIButton",
                                bounds: ElementBounds(left: 190, top: 450, right: 355, bottom: 490),
                                clickable: "true",
                                role: "button"
                            ),
                        ]
                    ),
                ]
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )

        let hashWithout = StructuralHasher.computeHash(hierarchyWithoutAlert)
        let hashWith = StructuralHasher.computeHash(hierarchyWithAlert)

        XCTAssertNotEqual(hashWithout, hashWith, "Hash should change when alert nodes are added to hierarchy")
    }

    func testHashUnchangedForBoundsOnlyDifference() {
        let hierarchy1 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812),
                node: [
                    UIElementInfo(
                        text: "Hello",
                        className: "UILabel",
                        bounds: ElementBounds(left: 10, top: 10, right: 200, bottom: 30)
                    ),
                ]
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )

        // Same structure, different bounds (simulating animation)
        let hierarchy2 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812),
                node: [
                    UIElementInfo(
                        text: "Hello",
                        className: "UILabel",
                        bounds: ElementBounds(left: 15, top: 15, right: 205, bottom: 35)
                    ),
                ]
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )

        let hash1 = StructuralHasher.computeHash(hierarchy1)
        let hash2 = StructuralHasher.computeHash(hierarchy2)

        XCTAssertEqual(hash1, hash2, "Hash should be the same when only bounds differ (animation)")
    }

    func testHashChangesWhenContentDescChanges() {
        let hierarchy1 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812),
                node: [
                    UIElementInfo(
                        contentDesc: "Balance: $100",
                        className: "UILabel",
                        bounds: ElementBounds(left: 10, top: 10, right: 200, bottom: 30)
                    ),
                ]
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )

        let hierarchy2 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812),
                node: [
                    UIElementInfo(
                        contentDesc: "Balance: $200",
                        className: "UILabel",
                        bounds: ElementBounds(left: 10, top: 10, right: 200, bottom: 30)
                    ),
                ]
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )

        let hash1 = StructuralHasher.computeHash(hierarchy1)
        let hash2 = StructuralHasher.computeHash(hierarchy2)

        XCTAssertNotEqual(hash1, hash2, "Hash should change when contentDesc changes")
    }

    func testHashChangesWhenClickableStateChanges() {
        let hierarchy1 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Submit",
                className: "UIButton",
                bounds: ElementBounds(left: 10, top: 10, right: 100, bottom: 50),
                clickable: "true",
                enabled: "true"
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )

        let hierarchy2 = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Submit",
                className: "UIButton",
                bounds: ElementBounds(left: 10, top: 10, right: 100, bottom: 50),
                clickable: "false",
                enabled: "false"
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )

        let hash1 = StructuralHasher.computeHash(hierarchy1)
        let hash2 = StructuralHasher.computeHash(hierarchy2)

        XCTAssertNotEqual(hash1, hash2, "Hash should change when clickable/enabled state changes")
    }
}
