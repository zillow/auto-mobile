import XCTest
@testable import XCTestService

final class ModelsTests: XCTestCase {
    // MARK: - PerfTiming Tests

    func testPerfTimingEncoding() throws {
        let timing = PerfTiming(name: "test", durationMs: 100)

        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let data = try encoder.encode(timing)
        let json = String(data: data, encoding: .utf8)

        XCTAssertEqual(json, #"{"durationMs":100,"name":"test"}"#)
    }

    func testPerfTimingWithChildren() throws {
        let child1 = PerfTiming(name: "child1", durationMs: 30)
        let child2 = PerfTiming(name: "child2", durationMs: 20)
        let parent = PerfTiming(name: "parent", durationMs: 100, children: [child1, child2])

        let encoder = JSONEncoder()
        let data = try encoder.encode(parent)
        let decoded = try JSONDecoder().decode(PerfTiming.self, from: data)

        XCTAssertEqual(decoded.name, "parent")
        XCTAssertEqual(decoded.durationMs, 100)
        XCTAssertEqual(decoded.children?.count, 2)
        XCTAssertEqual(decoded.children?[0].name, "child1")
        XCTAssertEqual(decoded.children?[1].name, "child2")
    }

    func testPerfTimingConvenienceMethods() {
        let simple = PerfTiming.timing("simple", durationMs: 50)
        XCTAssertNil(simple.children)

        let withChildren = PerfTiming.timing("parent", durationMs: 100, children: [
            PerfTiming.timing("child", durationMs: 30),
        ])
        XCTAssertNotNil(withChildren.children)
        XCTAssertEqual(withChildren.children?.count, 1)
    }

    // MARK: - WebSocketRequest Tests

    func testWebSocketRequestDecoding() throws {
        let json = """
        {
            "type": "request_tap_coordinates",
            "requestId": "req-123",
            "x": 100,
            "y": 200,
            "duration": 50
        }
        """

        let request = try JSONDecoder().decode(WebSocketRequest.self, from: json.data(using: .utf8)!)

        XCTAssertEqual(request.type, "request_tap_coordinates")
        XCTAssertEqual(request.requestId, "req-123")
        XCTAssertEqual(request.x, 100)
        XCTAssertEqual(request.y, 200)
        XCTAssertEqual(request.duration, 50)
    }

    func testWebSocketRequestSwipeDecoding() throws {
        let json = """
        {
            "type": "request_swipe",
            "x1": 100,
            "y1": 200,
            "x2": 300,
            "y2": 400,
            "duration": 300
        }
        """

        let request = try JSONDecoder().decode(WebSocketRequest.self, from: json.data(using: .utf8)!)

        XCTAssertEqual(request.type, "request_swipe")
        XCTAssertEqual(request.x1, 100)
        XCTAssertEqual(request.y1, 200)
        XCTAssertEqual(request.x2, 300)
        XCTAssertEqual(request.y2, 400)
        XCTAssertEqual(request.duration, 300)
    }

    func testWebSocketRequestDragDecoding() throws {
        let json = """
        {
            "type": "request_drag",
            "x1": 100,
            "y1": 200,
            "x2": 300,
            "y2": 400,
            "pressDurationMs": 600,
            "dragDurationMs": 300,
            "holdDurationMs": 100
        }
        """

        let request = try JSONDecoder().decode(WebSocketRequest.self, from: json.data(using: .utf8)!)

        XCTAssertEqual(request.type, "request_drag")
        XCTAssertEqual(request.pressDurationMs, 600)
        XCTAssertEqual(request.dragDurationMs, 300)
        XCTAssertEqual(request.holdDurationMs, 100)
    }

    // MARK: - WebSocketResponse Tests

    func testWebSocketResponseSuccess() throws {
        let response = WebSocketResponse.success(
            type: "tap_coordinates_result",
            requestId: "req-123",
            totalTimeMs: 50
        )

        XCTAssertEqual(response.type, "tap_coordinates_result")
        XCTAssertEqual(response.requestId, "req-123")
        XCTAssertEqual(response.success, true)
        XCTAssertEqual(response.totalTimeMs, 50)
        XCTAssertNil(response.error)
    }

    func testWebSocketResponseError() throws {
        let response = WebSocketResponse.error(
            type: "tap_coordinates_result",
            requestId: "req-123",
            error: "Element not found"
        )

        XCTAssertEqual(response.type, "tap_coordinates_result")
        XCTAssertEqual(response.success, false)
        XCTAssertEqual(response.error, "Element not found")
    }

    func testWebSocketResponseWithPerfTiming() throws {
        let perfTiming = PerfTiming(name: "total", durationMs: 100, children: [
            PerfTiming(name: "find", durationMs: 30),
            PerfTiming(name: "tap", durationMs: 70),
        ])

        let response = WebSocketResponse(
            type: "tap_coordinates_result",
            requestId: "req-123",
            success: true,
            totalTimeMs: 100,
            perfTiming: perfTiming
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(response)
        let decoded = try JSONDecoder().decode(WebSocketResponse.self, from: data)

        XCTAssertNotNil(decoded.perfTiming)
        XCTAssertEqual(decoded.perfTiming?.name, "total")
        XCTAssertEqual(decoded.perfTiming?.children?.count, 2)
    }

    // MARK: - HierarchyUpdateResponse Tests

    func testHierarchyUpdateResponseEncoding() throws {
        let hierarchy = ViewHierarchy(
            packageName: "com.example.app",
            hierarchy: UIElementInfo(
                text: "Hello",
                className: "UILabel",
                bounds: ElementBounds(left: 0, top: 0, right: 100, bottom: 50)
            )
        )

        let response = HierarchyUpdateResponse(
            requestId: "req-456",
            data: hierarchy
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(response)
        let decoded = try JSONDecoder().decode(HierarchyUpdateResponse.self, from: data)

        XCTAssertEqual(decoded.type, "hierarchy_update")
        XCTAssertEqual(decoded.requestId, "req-456")
        XCTAssertEqual(decoded.data?.packageName, "com.example.app")
        XCTAssertEqual(decoded.data?.hierarchy?.text, "Hello")
    }

    // MARK: - UIElementInfo Tests

    func testUIElementInfoEncoding() throws {
        let element = UIElementInfo(
            text: "Button",
            contentDesc: "Submit button",
            resourceId: "com.example:id/submit",
            className: "UIButton",
            bounds: ElementBounds(left: 10, top: 20, right: 110, bottom: 70),
            clickable: "true",
            enabled: "true"
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(element)
        let jsonObject = try JSONSerialization.jsonObject(with: data)
        let json = try XCTUnwrap(jsonObject as? [String: Any])

        // Check that content-desc uses hyphenated key (Android format)
        XCTAssertNotNil(json["content-desc"])
        XCTAssertEqual(json["content-desc"] as? String, "Submit button")

        // Check that resource-id uses hyphenated key
        XCTAssertNotNil(json["resource-id"])
        XCTAssertEqual(json["resource-id"] as? String, "com.example:id/submit")
    }

    func testUIElementInfoDecoding() throws {
        let json = """
        {
            "text": "Label",
            "content-desc": "Description",
            "resource-id": "com.example:id/label",
            "className": "UILabel",
            "bounds": {"left": 0, "top": 0, "right": 100, "bottom": 50},
            "clickable": "false",
            "enabled": "true"
        }
        """

        let element = try JSONDecoder().decode(UIElementInfo.self, from: json.data(using: .utf8)!)

        XCTAssertEqual(element.text, "Label")
        XCTAssertEqual(element.contentDesc, "Description")
        XCTAssertEqual(element.resourceId, "com.example:id/label")
        XCTAssertEqual(element.clickable, "false")
    }

    // MARK: - ElementBounds Tests

    func testElementBoundsComputedProperties() {
        let bounds = ElementBounds(left: 10, top: 20, right: 110, bottom: 70)

        XCTAssertEqual(bounds.width, 100)
        XCTAssertEqual(bounds.height, 50)
        XCTAssertEqual(bounds.centerX, 60)
        XCTAssertEqual(bounds.centerY, 45)
    }

    // MARK: - HighlightShape Tests

    func testHighlightShapeBox() throws {
        let shape = HighlightShape(
            type: "box",
            bounds: HighlightBounds(x: 10, y: 20, width: 100, height: 50),
            style: HighlightStyle(strokeColor: "#FF0000", strokeWidth: 2.0)
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(shape)
        let decoded = try JSONDecoder().decode(HighlightShape.self, from: data)

        XCTAssertEqual(decoded.type, "box")
        XCTAssertEqual(decoded.bounds?.x, 10)
        XCTAssertEqual(decoded.bounds?.width, 100)
        XCTAssertEqual(decoded.style?.strokeColor, "#FF0000")
    }

    func testHighlightShapePath() throws {
        let shape = HighlightShape(
            type: "path",
            points: [
                HighlightPoint(x: 0, y: 0),
                HighlightPoint(x: 100, y: 100),
                HighlightPoint(x: 200, y: 50),
            ]
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(shape)
        let decoded = try JSONDecoder().decode(HighlightShape.self, from: data)

        XCTAssertEqual(decoded.type, "path")
        XCTAssertEqual(decoded.points?.count, 3)
        XCTAssertEqual(decoded.points?[1].x, 100)
        XCTAssertEqual(decoded.points?[1].y, 100)
    }

    // MARK: - RequestType Tests

    func testRequestTypeRawValues() {
        XCTAssertEqual(RequestType.requestHierarchy.rawValue, "request_hierarchy")
        XCTAssertEqual(RequestType.requestTapCoordinates.rawValue, "request_tap_coordinates")
        XCTAssertEqual(RequestType.requestSwipe.rawValue, "request_swipe")
        XCTAssertEqual(RequestType.requestDrag.rawValue, "request_drag")
        XCTAssertEqual(RequestType.requestSetText.rawValue, "request_set_text")
    }

    // MARK: - ResponseType Tests

    func testResponseTypeRawValues() {
        XCTAssertEqual(ResponseType.hierarchyUpdate.rawValue, "hierarchy_update")
        XCTAssertEqual(ResponseType.tapCoordinatesResult.rawValue, "tap_coordinates_result")
        XCTAssertEqual(ResponseType.swipeResult.rawValue, "swipe_result")
        XCTAssertEqual(ResponseType.screenshot.rawValue, "screenshot")
    }
}
