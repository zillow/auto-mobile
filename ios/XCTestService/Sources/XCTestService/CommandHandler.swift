import Foundation
#if canImport(XCTest) && os(iOS)
    import XCTest
#endif

/// Handles WebSocket commands matching Android AccessibilityService protocol
public class CommandHandler: CommandHandling {
    private let elementLocator: ElementLocating
    private let gesturePerformer: GesturePerforming
    private let perfProvider: PerfProvider

    public init(
        elementLocator: ElementLocating,
        gesturePerformer: GesturePerforming,
        perfProvider: PerfProvider = PerfProvider.instance
    ) {
        self.elementLocator = elementLocator
        self.gesturePerformer = gesturePerformer
        self.perfProvider = perfProvider
    }

    /// Factory for testing - allows injecting fakes
    public static func createForTesting(
        elementLocator: ElementLocating,
        gesturePerformer: GesturePerforming,
        perfProvider: PerfProvider
    )
        -> CommandHandler
    {
        return CommandHandler(
            elementLocator: elementLocator,
            gesturePerformer: gesturePerformer,
            perfProvider: perfProvider
        )
    }

    /// Handle an incoming request and return a response
    public func handle(_ request: WebSocketRequest) -> Any {
        let startTime = Date()

        do {
            switch request.type {
            // View hierarchy commands
            case RequestType.requestHierarchy.rawValue,
                 RequestType.requestHierarchyIfStale.rawValue:
                return try handleRequestHierarchy(request, startTime: startTime)

            case RequestType.requestScreenshot.rawValue:
                return try handleRequestScreenshot(request, startTime: startTime)

            // Gesture commands
            case RequestType.requestTapCoordinates.rawValue:
                return try handleTapCoordinates(request, startTime: startTime)

            case RequestType.requestSwipe.rawValue:
                return try handleSwipe(request, startTime: startTime)

            case RequestType.requestTwoFingerSwipe.rawValue:
                return try handleTwoFingerSwipe(request, startTime: startTime)

            case RequestType.requestDrag.rawValue:
                return try handleDrag(request, startTime: startTime)

            case RequestType.requestPinch.rawValue:
                return try handlePinch(request, startTime: startTime)

            // Text input commands
            case RequestType.requestSetText.rawValue:
                return try handleSetText(request, startTime: startTime)

            case RequestType.requestImeAction.rawValue:
                return try handleImeAction(request, startTime: startTime)

            case RequestType.requestSelectAll.rawValue:
                return try handleSelectAll(request, startTime: startTime)

            // Action commands
            case RequestType.requestAction.rawValue:
                return try handleAction(request, startTime: startTime)

            // Clipboard commands
            case RequestType.requestClipboard.rawValue:
                return try handleClipboard(request, startTime: startTime)

            // Accessibility features
            case RequestType.getCurrentFocus.rawValue:
                return try handleGetCurrentFocus(request, startTime: startTime)

            case RequestType.getTraversalOrder.rawValue:
                return try handleGetTraversalOrder(request, startTime: startTime)

            case RequestType.addHighlight.rawValue:
                return try handleAddHighlight(request, startTime: startTime)

            default:
                return WebSocketResponse.error(
                    type: "error",
                    requestId: request.requestId,
                    error: "Unknown command type: \(request.type)",
                    totalTimeMs: totalTimeMs(from: startTime)
                )
            }
        } catch {
            return WebSocketResponse.error(
                type: responseType(for: request.type),
                requestId: request.requestId,
                error: error.localizedDescription,
                totalTimeMs: totalTimeMs(from: startTime)
            )
        }
    }

    // MARK: - View Hierarchy

    private func handleRequestHierarchy(
        _ request: WebSocketRequest,
        startTime _: Date
    )
        throws -> HierarchyUpdateResponse
    {
        perfProvider.serial("handleRequestHierarchy")
        defer { perfProvider.end() }

        let hierarchy = perfProvider.track("extraction") {
            try? elementLocator.getViewHierarchy()
        }

        guard let hierarchy = hierarchy else {
            throw CommandError.executionFailed("Failed to get view hierarchy")
        }

        // Get accumulated timing for this operation
        let perfTimings = perfProvider.flush()

        return HierarchyUpdateResponse(
            requestId: request.requestId,
            data: hierarchy,
            perfTiming: perfTimings?.first
        )
    }

    private func handleRequestScreenshot(_ request: WebSocketRequest, startTime _: Date) throws -> ScreenshotResponse {
        let data = try gesturePerformer.getScreenshot()
        let base64 = data.base64EncodedString()

        return ScreenshotResponse(
            requestId: request.requestId,
            data: base64,
            format: "png"
        )
    }

    // MARK: - Gestures

    private func handleTapCoordinates(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        guard let x = request.x, let y = request.y else {
            throw CommandError.missingParameter("x and y coordinates")
        }

        let duration = request.duration ?? 0
        try gesturePerformer.tap(x: Double(x), y: Double(y), duration: TimeInterval(duration) / 1000.0)

        return WebSocketResponse.success(
            type: ResponseType.tapCoordinatesResult.rawValue,
            requestId: request.requestId,
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    private func handleSwipe(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        guard let x1 = request.x1, let y1 = request.y1,
              let x2 = request.x2, let y2 = request.y2
        else {
            throw CommandError.missingParameter("x1, y1, x2, y2")
        }

        let duration = request.duration ?? 300
        try gesturePerformer.swipe(
            startX: Double(x1), startY: Double(y1),
            endX: Double(x2), endY: Double(y2),
            duration: TimeInterval(duration) / 1000.0
        )

        return WebSocketResponse.success(
            type: ResponseType.swipeResult.rawValue,
            requestId: request.requestId,
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    private func handleTwoFingerSwipe(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        // Stub: Two-finger swipe not yet implemented on iOS
        return WebSocketResponse.error(
            type: ResponseType.swipeResult.rawValue,
            requestId: request.requestId,
            error: "Two-finger swipe not yet implemented on iOS",
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    private func handleDrag(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        guard let x1 = request.x1, let y1 = request.y1,
              let x2 = request.x2, let y2 = request.y2
        else {
            throw CommandError.missingParameter("x1, y1, x2, y2")
        }

        let pressDuration = request.pressDurationMs ?? request.holdTime ?? 600
        let dragDuration = request.dragDurationMs ?? 300
        let holdDuration = request.holdDurationMs ?? 100

        try gesturePerformer.drag(
            startX: Double(x1), startY: Double(y1),
            endX: Double(x2), endY: Double(y2),
            pressDuration: TimeInterval(pressDuration) / 1000.0,
            dragDuration: TimeInterval(dragDuration) / 1000.0,
            holdDuration: TimeInterval(holdDuration) / 1000.0
        )

        return WebSocketResponse.success(
            type: ResponseType.dragResult.rawValue,
            requestId: request.requestId,
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    private func handlePinch(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        guard let centerX = request.centerX, let centerY = request.centerY,
              let distanceStart = request.distanceStart, let distanceEnd = request.distanceEnd
        else {
            throw CommandError.missingParameter("centerX, centerY, distanceStart, distanceEnd")
        }

        let duration = request.duration ?? 300
        let scale = Double(distanceEnd) / Double(distanceStart)

        try gesturePerformer.pinch(
            centerX: Double(centerX),
            centerY: Double(centerY),
            scale: scale,
            duration: TimeInterval(duration) / 1000.0
        )

        return WebSocketResponse.success(
            type: ResponseType.pinchResult.rawValue,
            requestId: request.requestId,
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    // MARK: - Text Input

    private func handleSetText(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        guard let text = request.text else {
            throw CommandError.missingParameter("text")
        }

        if let resourceId = request.resourceId {
            try gesturePerformer.setText(resourceId: resourceId, text: text)
        } else {
            try gesturePerformer.typeText(text: text)
        }

        return WebSocketResponse.success(
            type: ResponseType.setTextResult.rawValue,
            requestId: request.requestId,
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    private func handleImeAction(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        guard let action = request.action else {
            throw CommandError.missingParameter("action")
        }

        try gesturePerformer.performImeAction(action)

        return WebSocketResponse.success(
            type: ResponseType.imeActionResult.rawValue,
            requestId: request.requestId,
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    private func handleSelectAll(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        try gesturePerformer.selectAll()

        return WebSocketResponse.success(
            type: ResponseType.selectAllResult.rawValue,
            requestId: request.requestId,
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    // MARK: - Actions

    private func handleAction(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        guard let action = request.action else {
            throw CommandError.missingParameter("action")
        }

        try gesturePerformer.performAction(action, resourceId: request.resourceId)

        return WebSocketResponse.success(
            type: ResponseType.actionResult.rawValue,
            requestId: request.requestId,
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    // MARK: - Clipboard

    private func handleClipboard(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        // Stub: Clipboard operations not yet fully implemented
        return WebSocketResponse.error(
            type: ResponseType.clipboardResult.rawValue,
            requestId: request.requestId,
            error: "Clipboard operations not yet implemented on iOS",
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    // MARK: - Accessibility Features

    private func handleGetCurrentFocus(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        // Stub: Focus tracking not yet implemented
        return WebSocketResponse.error(
            type: ResponseType.currentFocusResult.rawValue,
            requestId: request.requestId,
            error: "Current focus not yet implemented on iOS",
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    private func handleGetTraversalOrder(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        // Stub: Traversal order not yet implemented
        return WebSocketResponse.error(
            type: ResponseType.traversalOrderResult.rawValue,
            requestId: request.requestId,
            error: "Traversal order not yet implemented on iOS",
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    private func handleAddHighlight(_ request: WebSocketRequest, startTime: Date) throws -> WebSocketResponse {
        // Stub: Highlights not yet implemented
        return WebSocketResponse.error(
            type: ResponseType.highlightResponse.rawValue,
            requestId: request.requestId,
            error: "Highlights not yet implemented on iOS",
            totalTimeMs: totalTimeMs(from: startTime)
        )
    }

    // MARK: - Helpers

    private func totalTimeMs(from startTime: Date) -> Int64 {
        return Int64(Date().timeIntervalSince(startTime) * 1000)
    }

    private func responseType(for requestType: String) -> String {
        switch requestType {
        case RequestType.requestHierarchy.rawValue,
             RequestType.requestHierarchyIfStale.rawValue:
            return ResponseType.hierarchyUpdate.rawValue
        case RequestType.requestScreenshot.rawValue:
            return ResponseType.screenshot.rawValue
        case RequestType.requestTapCoordinates.rawValue:
            return ResponseType.tapCoordinatesResult.rawValue
        case RequestType.requestSwipe.rawValue,
             RequestType.requestTwoFingerSwipe.rawValue:
            return ResponseType.swipeResult.rawValue
        case RequestType.requestDrag.rawValue:
            return ResponseType.dragResult.rawValue
        case RequestType.requestPinch.rawValue:
            return ResponseType.pinchResult.rawValue
        case RequestType.requestSetText.rawValue:
            return ResponseType.setTextResult.rawValue
        case RequestType.requestImeAction.rawValue:
            return ResponseType.imeActionResult.rawValue
        case RequestType.requestSelectAll.rawValue:
            return ResponseType.selectAllResult.rawValue
        case RequestType.requestAction.rawValue:
            return ResponseType.actionResult.rawValue
        case RequestType.requestClipboard.rawValue:
            return ResponseType.clipboardResult.rawValue
        default:
            return "error"
        }
    }
}

// MARK: - Errors

public enum CommandError: LocalizedError {
    case unknownCommand(String)
    case missingParameter(String)
    case invalidParameter(String, String)
    case elementNotFound(String)
    case executionFailed(String)
    case notSupported(String)

    public var errorDescription: String? {
        switch self {
        case let .unknownCommand(cmd):
            return "Unknown command: \(cmd)"
        case let .missingParameter(param):
            return "Missing required parameter: \(param)"
        case let .invalidParameter(param, value):
            return "Invalid value '\(value)' for parameter '\(param)'"
        case let .elementNotFound(id):
            return "Element not found: \(id)"
        case let .executionFailed(reason):
            return "Command execution failed: \(reason)"
        case let .notSupported(feature):
            return "Feature not supported: \(feature)"
        }
    }
}
