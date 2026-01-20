import XCTest
@testable import XCTestService

final class CommandHandlerTests: XCTestCase {
    var fakeTimeProvider: FakeTimeProvider!
    var perfProvider: PerfProvider!
    var fakeElementLocator: FakeElementLocator!
    var fakeGesturePerformer: FakeGesturePerformer!
    var commandHandler: CommandHandler!

    override func setUp() {
        super.setUp()
        fakeTimeProvider = FakeTimeProvider(initialTime: 1000)
        perfProvider = PerfProvider.createForTesting(timeProvider: fakeTimeProvider)
        fakeElementLocator = FakeElementLocator()
        fakeGesturePerformer = FakeGesturePerformer()
        commandHandler = CommandHandler.createForTesting(
            elementLocator: fakeElementLocator,
            gesturePerformer: fakeGesturePerformer,
            perfProvider: perfProvider
        )
    }

    override func tearDown() {
        perfProvider.clear()
        PerfProvider.resetInstance()
        super.tearDown()
    }

    // MARK: - Hierarchy Request Tests

    func testRequestHierarchyIncludesPerfTiming() {
        // Configure fake hierarchy
        let testHierarchy = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Test Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeElementLocator.setHierarchy(testHierarchy)

        // Create request
        let request = WebSocketRequest(
            type: "request_hierarchy",
            requestId: "test-123"
        )

        // Simulate time passing during extraction
        fakeTimeProvider.setTime(1000)

        // Handle request
        let response = commandHandler.handle(request)

        // Verify response includes perf timing
        guard let hierarchyResponse = response as? HierarchyUpdateResponse else {
            XCTFail("Expected HierarchyUpdateResponse, got \(type(of: response))")
            return
        }

        XCTAssertEqual(hierarchyResponse.requestId, "test-123")
        XCTAssertNotNil(hierarchyResponse.data)
        XCTAssertEqual(hierarchyResponse.data?.packageName, "com.test.app")

        // Verify perf timing was captured
        // Note: The timing will be 0ms since we're using fakes, but the structure should be there
        XCTAssertNotNil(hierarchyResponse.perfTiming)
        XCTAssertEqual(hierarchyResponse.perfTiming?.name, "handleRequestHierarchy")
    }

    func testRequestHierarchyPerfTimingHasExtractionChild() {
        // Configure fake to simulate time passage
        fakeTimeProvider.setTime(1000)

        let testHierarchy = ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Test Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
        fakeElementLocator.setHierarchy(testHierarchy)

        let request = WebSocketRequest(
            type: "request_hierarchy",
            requestId: "test-456"
        )

        let response = commandHandler.handle(request)

        guard let hierarchyResponse = response as? HierarchyUpdateResponse else {
            XCTFail("Expected HierarchyUpdateResponse")
            return
        }

        // Verify perf timing structure includes extraction child
        let perfTiming = hierarchyResponse.perfTiming
        XCTAssertNotNil(perfTiming)
        XCTAssertEqual(perfTiming?.name, "handleRequestHierarchy")

        // Should have extraction as a child
        let extractionChild = perfTiming?.children?.first { $0.name == "extraction" }
        XCTAssertNotNil(extractionChild, "Expected 'extraction' child in perf timing")
    }

    func testRequestHierarchyError() {
        // Configure fake to throw error
        fakeElementLocator.setShouldThrow(CommandError.executionFailed("Test error"))

        let request = WebSocketRequest(
            type: "request_hierarchy",
            requestId: "test-error"
        )

        let response = commandHandler.handle(request)

        guard let errorResponse = response as? WebSocketResponse else {
            XCTFail("Expected WebSocketResponse error")
            return
        }

        XCTAssertFalse(errorResponse.success ?? true)
        XCTAssertNotNil(errorResponse.error)
        XCTAssertTrue(errorResponse.error?.contains("Test error") ?? false)
    }

    // MARK: - Tap Tests

    func testTapCoordinatesSuccess() {
        let request = WebSocketRequest(
            type: "request_tap_coordinates",
            requestId: "tap-123",
            x: 100,
            y: 200
        )

        let response = commandHandler.handle(request)

        guard let tapResponse = response as? WebSocketResponse else {
            XCTFail("Expected WebSocketResponse")
            return
        }

        XCTAssertEqual(tapResponse.success, true)
        XCTAssertEqual(tapResponse.type, "tap_coordinates_result")

        // Verify tap was performed
        let tapHistory = fakeGesturePerformer.getTapHistory()
        XCTAssertEqual(tapHistory.count, 1)
        XCTAssertEqual(tapHistory.first?.x, 100)
        XCTAssertEqual(tapHistory.first?.y, 200)
    }

    func testTapCoordinatesMissingParameters() {
        let request = WebSocketRequest(
            type: "request_tap_coordinates",
            requestId: "tap-error"
            // Missing x, y
        )

        let response = commandHandler.handle(request)

        guard let errorResponse = response as? WebSocketResponse else {
            XCTFail("Expected WebSocketResponse")
            return
        }

        XCTAssertFalse(errorResponse.success ?? true)
        XCTAssertNotNil(errorResponse.error)
        XCTAssertTrue(errorResponse.error?.contains("x and y") ?? false)
    }

    // MARK: - Swipe Tests

    func testSwipeSuccess() {
        let request = WebSocketRequest(
            type: "request_swipe",
            requestId: "swipe-123",
            duration: 300,
            x1: 100,
            y1: 200,
            x2: 100,
            y2: 500
        )

        let response = commandHandler.handle(request)

        guard let swipeResponse = response as? WebSocketResponse else {
            XCTFail("Expected WebSocketResponse")
            return
        }

        XCTAssertEqual(swipeResponse.success, true)

        // Verify swipe was performed
        let swipeHistory = fakeGesturePerformer.getSwipeHistory()
        XCTAssertEqual(swipeHistory.count, 1)
        XCTAssertEqual(swipeHistory.first?.startY, 200)
        XCTAssertEqual(swipeHistory.first?.endY, 500)
    }

    // MARK: - Text Input Tests

    func testSetTextSuccess() {
        let request = WebSocketRequest(
            type: "request_set_text",
            requestId: "text-123",
            text: "Hello World"
        )

        let response = commandHandler.handle(request)

        guard let textResponse = response as? WebSocketResponse else {
            XCTFail("Expected WebSocketResponse")
            return
        }

        XCTAssertEqual(textResponse.success, true)

        // Verify text was typed
        let textHistory = fakeGesturePerformer.getTypeTextHistory()
        XCTAssertEqual(textHistory.count, 1)
        XCTAssertEqual(textHistory.first, "Hello World")
    }

    func testSetTextWithResourceId() {
        let request = WebSocketRequest(
            type: "request_set_text",
            requestId: "text-456",
            text: "Field Text",
            resourceId: "input_field"
        )

        let response = commandHandler.handle(request)

        guard let textResponse = response as? WebSocketResponse else {
            XCTFail("Expected WebSocketResponse")
            return
        }

        XCTAssertEqual(textResponse.success, true)

        // Verify setText was called (not typeText)
        let setTextHistory = fakeGesturePerformer.getSetTextHistory()
        XCTAssertEqual(setTextHistory.count, 1)
        XCTAssertEqual(setTextHistory.first?.text, "Field Text")
        XCTAssertEqual(setTextHistory.first?.resourceId, "input_field")
    }

    // MARK: - Unknown Command Tests

    func testUnknownCommand() {
        let request = WebSocketRequest(
            type: "unknown_command",
            requestId: "unknown-123"
        )

        let response = commandHandler.handle(request)

        guard let errorResponse = response as? WebSocketResponse else {
            XCTFail("Expected WebSocketResponse")
            return
        }

        XCTAssertFalse(errorResponse.success ?? true)
        XCTAssertTrue(errorResponse.error?.contains("Unknown command") ?? false)
    }
}
