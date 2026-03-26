import XCTest
@testable import AutoMobileSDK

final class AutoMobileNetworkTests: XCTestCase {
    override func tearDown() {
        AutoMobileNetwork.shared.reset()
        super.tearDown()
    }

    func testRecordRequestManually() {
        var flushedEvents: [any SdkEvent] = []
        let buffer = SdkEventBuffer(maxBufferSize: 100, flushIntervalMs: 60000) { events in
            flushedEvents = events
        }

        AutoMobileNetwork.shared.initialize(bundleId: "test", buffer: buffer)
        AutoMobileNetwork.shared.setCaptureHeaders(true)

        AutoMobileNetwork.shared.recordRequest(
            url: "https://api.example.com/users",
            method: "GET",
            requestHeaders: ["Authorization": "Bearer token"],
            statusCode: 200,
            responseHeaders: ["Content-Type": "application/json"],
            responseBodySize: 1024,
            durationMs: 150.0
        )

        buffer.flush()

        XCTAssertEqual(flushedEvents.count, 1)
        let event = flushedEvents.first as? SdkNetworkRequestEvent
        XCTAssertEqual(event?.url, "https://api.example.com/users")
        XCTAssertEqual(event?.method, "GET")
        XCTAssertEqual(event?.statusCode, 200)
        XCTAssertEqual(event?.durationMs, 150.0)
        XCTAssertEqual(event?.requestHeaders?["Authorization"], "Bearer token")
    }

    func testHeadersNotCapturedByDefault() {
        var flushedEvents: [any SdkEvent] = []
        let buffer = SdkEventBuffer(maxBufferSize: 100, flushIntervalMs: 60000) { events in
            flushedEvents = events
        }

        AutoMobileNetwork.shared.initialize(bundleId: "test", buffer: buffer)
        // captureHeaders is false by default

        AutoMobileNetwork.shared.recordRequest(
            url: "https://api.example.com/data",
            method: "POST",
            requestHeaders: ["Authorization": "Bearer secret"]
        )

        buffer.flush()

        let event = flushedEvents.first as? SdkNetworkRequestEvent
        XCTAssertNil(event?.requestHeaders)
    }

    func testRecordWebSocketFrame() {
        var flushedEvents: [any SdkEvent] = []
        let buffer = SdkEventBuffer(maxBufferSize: 100, flushIntervalMs: 60000) { events in
            flushedEvents = events
        }

        AutoMobileNetwork.shared.initialize(bundleId: "test", buffer: buffer)

        AutoMobileNetwork.shared.recordWebSocketFrame(
            url: "wss://ws.example.com",
            direction: .received,
            frameType: .text,
            payloadSize: 256
        )

        buffer.flush()

        let event = flushedEvents.first as? SdkWebSocketFrameEvent
        XCTAssertEqual(event?.url, "wss://ws.example.com")
        XCTAssertEqual(event?.direction, .received)
        XCTAssertEqual(event?.frameType, .text)
        XCTAssertEqual(event?.payloadSize, 256)
    }
}
