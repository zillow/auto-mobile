import Foundation

// MARK: - FakeElementLocator

/// Fake implementation of ElementLocating for testing
public class FakeElementLocator: ElementLocating {
    // MARK: - Configurable State

    private var hierarchyData: ViewHierarchy?
    private var elements: [String: Any] = [:]
    private var shouldThrow: Error?

    // MARK: - Call History

    private var getHierarchyCallCount = 0
    private var findByIdHistory: [String] = []
    private var findByTextHistory: [String] = []

    /// Tracks the last value of disableAllFiltering passed to getViewHierarchy
    public private(set) var lastDisableAllFiltering: Bool?

    public init() {}

    // MARK: - Configuration

    /// Set the hierarchy to return
    public func setHierarchy(_ hierarchy: ViewHierarchy?) {
        hierarchyData = hierarchy
    }

    /// Set an element to be found by ID
    public func setElement(id: String, element: Any) {
        elements[id] = element
    }

    /// Configure to throw an error
    public func setShouldThrow(_ error: Error?) {
        shouldThrow = error
    }

    // MARK: - Assertions

    public var hierarchyRequestCount: Int {
        getHierarchyCallCount
    }

    public func getFindByIdHistory() -> [String] {
        findByIdHistory
    }

    public func getFindByTextHistory() -> [String] {
        findByTextHistory
    }

    public func clearHistory() {
        getHierarchyCallCount = 0
        findByIdHistory.removeAll()
        findByTextHistory.removeAll()
        lastDisableAllFiltering = nil
    }

    // MARK: - ElementLocating

    public func getViewHierarchy(disableAllFiltering: Bool = false) throws -> ViewHierarchy {
        getHierarchyCallCount += 1
        lastDisableAllFiltering = disableAllFiltering

        if let error = shouldThrow {
            throw error
        }

        return hierarchyData ?? ViewHierarchy(
            packageName: "com.test.app",
            hierarchy: UIElementInfo(
                text: "Fake Root",
                className: "UIView",
                bounds: ElementBounds(left: 0, top: 0, right: 375, bottom: 812)
            ),
            windowInfo: WindowInfo(id: 0, type: 1, isActive: true, isFocused: true)
        )
    }

    public func findElement(byResourceId resourceId: String) -> Any? {
        findByIdHistory.append(resourceId)
        return elements[resourceId]
    }

    public func findElement(byText text: String) -> Any? {
        findByTextHistory.append(text)
        return elements.values.first
    }
}

// MARK: - FakeGesturePerformer

/// Fake implementation of GesturePerforming for testing
public class FakeGesturePerformer: GesturePerforming {
    // MARK: - Configurable State

    private var screenshotData: Data?
    private var currentOrientation = "portrait"
    private var failureMap: [String: Error] = [:]

    // MARK: - Call History

    public struct TapCall {
        public let x: Double
        public let y: Double
        public let duration: TimeInterval
    }

    public struct SwipeCall {
        public let startX: Double
        public let startY: Double
        public let endX: Double
        public let endY: Double
        public let duration: TimeInterval
    }

    public struct DragCall {
        public let startX: Double
        public let startY: Double
        public let endX: Double
        public let endY: Double
        public let pressDuration: TimeInterval
        public let dragDuration: TimeInterval
        public let holdDuration: TimeInterval
    }

    public struct PinchCall {
        public let centerX: Double
        public let centerY: Double
        public let scale: Double
        public let duration: TimeInterval
    }

    public struct TextCall {
        public let text: String
        public let resourceId: String?
    }

    private var tapHistory: [TapCall] = []
    private var doubleTapHistory: [(x: Double, y: Double)] = []
    private var longPressHistory: [(x: Double, y: Double, duration: TimeInterval)] = []
    private var swipeHistory: [SwipeCall] = []
    private var dragHistory: [DragCall] = []
    private var pinchHistory: [PinchCall] = []
    private var typeTextHistory: [String] = []
    private var setTextHistory: [TextCall] = []
    private var clearTextHistory: [String?] = []
    private var imeActionHistory: [String] = []
    private var actionHistory: [(action: String, resourceId: String?)] = []
    private var screenshotCallCount = 0
    private var pressHomeCallCount = 0
    private var appLaunchHistory: [String] = []
    private var appTerminateHistory: [String] = []

    public init() {}

    // MARK: - Configuration

    public func setScreenshotData(_ data: Data?) {
        screenshotData = data
    }

    public func setFailure(for operation: String, error: Error?) {
        if let error = error {
            failureMap[operation] = error
        } else {
            failureMap.removeValue(forKey: operation)
        }
    }

    // MARK: - Assertions

    public func getTapHistory() -> [TapCall] {
        tapHistory
    }

    public func getSwipeHistory() -> [SwipeCall] {
        swipeHistory
    }

    public func getDragHistory() -> [DragCall] {
        dragHistory
    }

    public func getPinchHistory() -> [PinchCall] {
        pinchHistory
    }

    public func getTypeTextHistory() -> [String] {
        typeTextHistory
    }

    public func getSetTextHistory() -> [TextCall] {
        setTextHistory
    }

    public func getImeActionHistory() -> [String] {
        imeActionHistory
    }

    public func getActionHistory() -> [(action: String, resourceId: String?)] {
        actionHistory
    }

    public func getScreenshotCallCount() -> Int {
        screenshotCallCount
    }

    public func getPressHomeCallCount() -> Int {
        pressHomeCallCount
    }

    public func getAppLaunchHistory() -> [String] {
        appLaunchHistory
    }

    public func getAppTerminateHistory() -> [String] {
        appTerminateHistory
    }

    public func clearHistory() {
        tapHistory.removeAll()
        doubleTapHistory.removeAll()
        longPressHistory.removeAll()
        swipeHistory.removeAll()
        dragHistory.removeAll()
        pinchHistory.removeAll()
        typeTextHistory.removeAll()
        setTextHistory.removeAll()
        clearTextHistory.removeAll()
        imeActionHistory.removeAll()
        actionHistory.removeAll()
        screenshotCallCount = 0
        pressHomeCallCount = 0
        appLaunchHistory.removeAll()
        appTerminateHistory.removeAll()
    }

    // MARK: - Private Helpers

    private func checkFailure(_ operation: String) throws {
        if let error = failureMap[operation] {
            throw error
        }
    }

    // MARK: - GesturePerforming

    public func tap(x: Double, y: Double, duration: TimeInterval) throws {
        try checkFailure("tap")
        tapHistory.append(TapCall(x: x, y: y, duration: duration))
    }

    public func doubleTap(x: Double, y: Double) throws {
        try checkFailure("doubleTap")
        doubleTapHistory.append((x: x, y: y))
    }

    public func longPress(x: Double, y: Double, duration: TimeInterval) throws {
        try checkFailure("longPress")
        longPressHistory.append((x: x, y: y, duration: duration))
    }

    public func swipe(startX: Double, startY: Double, endX: Double, endY: Double, duration: TimeInterval) throws {
        try checkFailure("swipe")
        swipeHistory.append(SwipeCall(startX: startX, startY: startY, endX: endX, endY: endY, duration: duration))
    }

    public func drag(
        startX: Double,
        startY: Double,
        endX: Double,
        endY: Double,
        pressDuration: TimeInterval,
        dragDuration: TimeInterval,
        holdDuration: TimeInterval
    )
        throws
    {
        try checkFailure("drag")
        dragHistory.append(DragCall(
            startX: startX,
            startY: startY,
            endX: endX,
            endY: endY,
            pressDuration: pressDuration,
            dragDuration: dragDuration,
            holdDuration: holdDuration
        ))
    }

    public func pinch(centerX: Double, centerY: Double, scale: Double, duration: TimeInterval) throws {
        try checkFailure("pinch")
        pinchHistory.append(PinchCall(centerX: centerX, centerY: centerY, scale: scale, duration: duration))
    }

    public func typeText(text: String) throws {
        try checkFailure("typeText")
        typeTextHistory.append(text)
    }

    public func setText(resourceId: String, text: String) throws {
        try checkFailure("setText")
        setTextHistory.append(TextCall(text: text, resourceId: resourceId))
    }

    public func clearText(resourceId: String?) throws {
        try checkFailure("clearText")
        clearTextHistory.append(resourceId)
    }

    public func selectAll() throws {
        try checkFailure("selectAll")
    }

    public func performImeAction(_ action: String) throws {
        try checkFailure("imeAction")
        imeActionHistory.append(action)
    }

    public func performAction(_ action: String, resourceId: String?) throws {
        try checkFailure("action")
        actionHistory.append((action: action, resourceId: resourceId))
    }

    public func getScreenshot() throws -> Data {
        try checkFailure("screenshot")
        screenshotCallCount += 1
        return screenshotData ?? Data()
    }

    public func setOrientation(_ orientation: String) throws {
        try checkFailure("setOrientation")
        currentOrientation = orientation
    }

    public func getOrientation() -> String {
        return currentOrientation
    }

    public func pressHome() throws {
        try checkFailure("pressHome")
        pressHomeCallCount += 1
    }

    public func launchApp(bundleId: String) throws {
        try checkFailure("launchApp")
        appLaunchHistory.append(bundleId)
    }

    public func terminateApp(bundleId: String) throws {
        try checkFailure("terminateApp")
        appTerminateHistory.append(bundleId)
    }

    public func activateApp(bundleId _: String) throws {
        try checkFailure("activateApp")
    }
}

// MARK: - FakeWebSocketServer

/// Fake implementation of WebSocketServing for testing
public class FakeWebSocketServer: WebSocketServing {
    // MARK: - State

    private var running = false
    private var shouldStartFail = false
    private var startError: Error?

    // MARK: - Call History

    private var broadcastHistory: [Data] = []
    private var startCallCount = 0
    private var stopCallCount = 0

    public init() {}

    // MARK: - Configuration

    public func setShouldStartFail(_ shouldFail: Bool, error: Error? = nil) {
        shouldStartFail = shouldFail
        startError = error
    }

    // MARK: - Assertions

    public func getBroadcastHistory() -> [Data] {
        broadcastHistory
    }

    public func getStartCallCount() -> Int {
        startCallCount
    }

    public func getStopCallCount() -> Int {
        stopCallCount
    }

    public func clearHistory() {
        broadcastHistory.removeAll()
        startCallCount = 0
        stopCallCount = 0
    }

    // MARK: - WebSocketServing

    public var isRunning: Bool {
        running
    }

    public func start() throws {
        startCallCount += 1

        if shouldStartFail {
            throw startError ?? NSError(
                domain: "FakeWebSocketServer",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Fake start failure"]
            )
        }

        running = true
    }

    public func stop() {
        stopCallCount += 1
        running = false
    }

    public func broadcast(_ data: Data) {
        broadcastHistory.append(data)
    }
}

// MARK: - FakePerfProvider

/// Fake implementation of PerfProvider for testing
public class FakePerfProvider {
    // MARK: - State

    private var flushData: [PerfTiming]?
    private let timeProvider: TimeProvider

    // MARK: - Call History

    private var serialHistory: [String] = []
    private var parallelHistory: [String] = []
    private var operationHistory: [(name: String, type: String)] = []
    private var endCallCount = 0
    private var flushCallCount = 0

    public init(timeProvider: TimeProvider = FakeTimeProvider()) {
        self.timeProvider = timeProvider
    }

    // MARK: - Configuration

    public func setFlushData(_ data: [PerfTiming]?) {
        flushData = data
    }

    // MARK: - Assertions

    public func getSerialHistory() -> [String] {
        serialHistory
    }

    public func getParallelHistory() -> [String] {
        parallelHistory
    }

    public func getOperationHistory() -> [(name: String, type: String)] {
        operationHistory
    }

    public func getEndCallCount() -> Int {
        endCallCount
    }

    public func getFlushCallCount() -> Int {
        flushCallCount
    }

    public func clearHistory() {
        serialHistory.removeAll()
        parallelHistory.removeAll()
        operationHistory.removeAll()
        endCallCount = 0
        flushCallCount = 0
    }

    // MARK: - PerfProvider-like Methods

    public func serial(_ name: String) {
        serialHistory.append(name)
        operationHistory.append((name: name, type: "serial"))
    }

    public func parallel(_ name: String) {
        parallelHistory.append(name)
        operationHistory.append((name: name, type: "parallel"))
    }

    public func end() {
        endCallCount += 1
    }

    @discardableResult
    public func track<T>(_ name: String, block: () throws -> T) rethrows -> T {
        operationHistory.append((name: name, type: "track"))
        return try block()
    }

    public func startOperation(_ name: String) {
        operationHistory.append((name: name, type: "startOperation"))
    }

    public func endOperation(_ name: String) {
        operationHistory.append((name: name, type: "endOperation"))
    }

    public func flush() -> [PerfTiming]? {
        flushCallCount += 1
        return flushData
    }

    public var hasData: Bool {
        return flushData != nil && !(flushData?.isEmpty ?? true)
    }

    public func clear() {
        flushData = nil
    }
}
