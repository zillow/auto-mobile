import Foundation

/// Network request/response tracking for URLSession.
/// iOS equivalent of Android's OkHttp interceptor.
public final class AutoMobileNetwork: @unchecked Sendable {
    public static let shared = AutoMobileNetwork()

    private let lock = NSLock()
    private var bundleId: String?
    private weak var buffer: SdkEventBuffer?
    private var _captureHeaders = false
    private var _captureBodies = false
    var _maxBodyBytes: Int = 32 * 1024 // 32KB default (internal for URLProtocol access)

    /// Thread-safe read of maxBodyBytes for URLProtocol callbacks.
    var maxBodyBytes: Int {
        lock.lock()
        defer { lock.unlock() }
        return _maxBodyBytes
    }

    /// Text content types eligible for body capture.
    static let textContentTypes: Set<String> = [
        "application/json", "text/plain", "text/html", "text/xml",
        "application/xml", "application/x-www-form-urlencoded",
    ]

    /// Check if a content type is text-based and eligible for body capture.
    public static func isTextContentType(_ contentType: String?) -> Bool {
        guard let ct = contentType else { return false }
        let base = ct.components(separatedBy: ";").first?.trimmingCharacters(in: .whitespaces).lowercased() ?? ""
        return textContentTypes.contains(base) || base.hasPrefix("text/")
    }

    private init() {}

    func initialize(bundleId: String?, buffer: SdkEventBuffer) {
        lock.lock()
        self.bundleId = bundleId
        self.buffer = buffer
        lock.unlock()
    }

    /// Configure whether to capture request/response headers.
    public func setCaptureHeaders(_ capture: Bool) {
        lock.lock()
        _captureHeaders = capture
        lock.unlock()
    }

    /// Configure whether to capture request/response bodies.
    public func setCaptureBodies(_ capture: Bool) {
        lock.lock()
        _captureBodies = capture
        lock.unlock()
    }

    /// Configure maximum body bytes to capture (default: 32KB).
    /// Values <= 0 disable body capture truncation (uses 0, meaning no capture).
    public func setMaxBodyBytes(_ bytes: Int) {
        lock.lock()
        _maxBodyBytes = max(0, bytes)
        lock.unlock()
    }

    /// Create a URLProtocol class that intercepts and records network requests.
    /// Register it with URLSessionConfiguration.protocolClasses.
    public func protocolClass() -> AnyClass {
        return AutoMobileURLProtocol.self
    }

    /// Record a network request/response manually.
    /// Use this when you can't use the URLProtocol approach.
    public func recordRequest(
        url: String,
        method: String,
        requestHeaders: [String: String]? = nil,
        requestBodySize: Int? = nil,
        statusCode: Int? = nil,
        responseHeaders: [String: String]? = nil,
        responseBodySize: Int? = nil,
        durationMs: Double? = nil,
        error: String? = nil,
        requestBody: String? = nil,
        responseBody: String? = nil,
        contentType: String? = nil
    ) {
        guard AutoMobileSDK.shared.isEnabled else { return }

        lock.lock()
        let captureHeaders = _captureHeaders
        let captureBodies = _captureBodies
        let maxBytes = _maxBodyBytes
        let currentBuffer = buffer
        lock.unlock()

        // Truncate bodies if needed
        let finalRequestBody: String? = captureBodies ? requestBody.map { truncateBody($0, maxBytes: maxBytes) } : nil
        let finalResponseBody: String? = captureBodies ? responseBody.map { truncateBody($0, maxBytes: maxBytes) } : nil

        // Extract host and path from URL
        let urlComponents = URLComponents(string: url)

        let event = SdkNetworkRequestEvent(
            url: url,
            method: method,
            requestHeaders: captureHeaders ? requestHeaders : nil,
            requestBodySize: requestBodySize,
            statusCode: statusCode,
            responseHeaders: captureHeaders ? responseHeaders : nil,
            responseBodySize: responseBodySize,
            durationMs: durationMs,
            error: error,
            host: urlComponents?.host,
            path: urlComponents?.path,
            requestBody: finalRequestBody,
            responseBody: finalResponseBody,
            contentType: contentType
        )
        currentBuffer?.add(event)
    }

    private func truncateBody(_ body: String, maxBytes: Int) -> String {
        if body.utf8.count <= maxBytes { return body }
        // Truncate to maxBytes, respecting UTF-8 character boundaries
        let utf8 = body.utf8
        let truncatedBytes = utf8.prefix(maxBytes)
        // Walk backwards to find a valid UTF-8 boundary
        var endIndex = truncatedBytes.endIndex
        while endIndex > truncatedBytes.startIndex {
            if let result = String(utf8[truncatedBytes.startIndex..<endIndex]) {
                return result
            }
            endIndex = utf8.index(before: endIndex)
        }
        return ""
    }

    /// Decode data as UTF-8, walking backwards if truncated mid-character.
    static func utf8String(from data: Data) -> String? {
        if let str = String(data: data, encoding: .utf8) { return str }
        // Walk backwards to find a valid UTF-8 boundary
        var length = data.count
        while length > 0 {
            length -= 1
            if let str = String(data: data.prefix(length), encoding: .utf8) {
                return str
            }
        }
        return nil
    }

    /// Record a WebSocket frame event.
    public func recordWebSocketFrame(
        url: String,
        direction: WebSocketFrameDirection,
        frameType: WebSocketFrameType,
        payloadSize: Int? = nil
    ) {
        guard AutoMobileSDK.shared.isEnabled else { return }

        lock.lock()
        let currentBuffer = buffer
        lock.unlock()

        let event = SdkWebSocketFrameEvent(
            url: url,
            direction: direction,
            frameType: frameType,
            payloadSize: payloadSize
        )
        currentBuffer?.add(event)
    }

    // MARK: - Testing Support

    internal func reset() {
        lock.lock()
        bundleId = nil
        buffer = nil
        _captureHeaders = false
        _captureBodies = false
        lock.unlock()
    }
}

// MARK: - URLProtocol Implementation

/// A URLProtocol subclass that intercepts network requests for monitoring.
/// Register with: URLSessionConfiguration.default.protocolClasses = [AutoMobileURLProtocol.self]
public class AutoMobileURLProtocol: URLProtocol {
    private static let handledKey = "dev.jasonpearson.automobile.sdk.handled"
    private var startTime: Date?
    private var urlSession: URLSession?
    private var dataTask: URLSessionDataTask?
    private var receivedResponse: URLResponse?
    private var receivedData = Data()
    private var totalBytesReceived = 0

    private static let supportedSchemes: Set<String> = ["http", "https"]

    public override class func canInit(with request: URLRequest) -> Bool {
        guard let scheme = request.url?.scheme?.lowercased(),
              supportedSchemes.contains(scheme),
              URLProtocol.property(forKey: handledKey, in: request) == nil else {
            return false
        }
        return true
    }

    public override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    public override func startLoading() {
        startTime = Date()
        receivedData = Data()
        totalBytesReceived = 0

        guard let mutableRequest = (request as NSURLRequest).mutableCopy() as? NSMutableURLRequest else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        URLProtocol.setProperty(true, forKey: Self.handledKey, in: mutableRequest)

        // Use ephemeral config to avoid inheriting our own URLProtocol (infinite loop).
        // Ephemeral preserves standard HTTP semantics without persisting cookies/caches,
        // which is acceptable since we're replaying on behalf of the caller's session.
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = config.protocolClasses?.filter { $0 != AutoMobileURLProtocol.self }
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        urlSession = session
        dataTask = session.dataTask(with: mutableRequest as URLRequest)
        dataTask?.resume()
    }

    public override func stopLoading() {
        dataTask?.cancel()
        // Invalidate session to break the retain cycle (session -> delegate -> self)
        urlSession?.invalidateAndCancel()
        urlSession = nil
        dataTask = nil
    }
}

extension AutoMobileURLProtocol: URLSessionDataDelegate {
    public func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        receivedResponse = response
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        completionHandler(.allow)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        totalBytesReceived += data.count
        // Accumulate response data for body capture (up to configured limit)
        let maxBytes = AutoMobileNetwork.shared.maxBodyBytes
        if receivedData.count < maxBytes {
            receivedData.append(data.prefix(maxBytes - receivedData.count))
        }
        client?.urlProtocol(self, didLoad: data)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let durationMs = startTime.map { Date().timeIntervalSince($0) * 1000 }

        if let error = error {
            AutoMobileNetwork.shared.recordRequest(
                url: request.url?.absoluteString ?? "",
                method: request.httpMethod ?? "GET",
                durationMs: durationMs,
                error: error.localizedDescription
            )
            client?.urlProtocol(self, didFailWithError: error)
        } else {
            let httpResponse = receivedResponse as? HTTPURLResponse
            let contentType = httpResponse?.value(forHTTPHeaderField: "Content-Type")

            // Capture request body from original request
            let maxBytes = AutoMobileNetwork.shared.maxBodyBytes
            let requestBody: String? = request.httpBody.flatMap { data in
                AutoMobileNetwork.isTextContentType(request.value(forHTTPHeaderField: "Content-Type"))
                    ? AutoMobileNetwork.utf8String(from: data.prefix(maxBytes))
                    : nil
            }

            // Capture response body if text content type (already byte-truncated during streaming)
            let responseBody: String? = AutoMobileNetwork.isTextContentType(contentType) && !receivedData.isEmpty
                ? AutoMobileNetwork.utf8String(from: receivedData)
                : nil

            AutoMobileNetwork.shared.recordRequest(
                url: request.url?.absoluteString ?? "",
                method: request.httpMethod ?? "GET",
                requestHeaders: request.allHTTPHeaderFields,
                requestBodySize: request.httpBody?.count,
                statusCode: httpResponse?.statusCode,
                responseHeaders: httpResponse?.allHeaderFields as? [String: String],
                responseBodySize: totalBytesReceived,
                durationMs: durationMs,
                requestBody: requestBody,
                responseBody: responseBody,
                contentType: contentType
            )

            client?.urlProtocolDidFinishLoading(self)
        }
        // Break retain cycle after completion
        urlSession?.finishTasksAndInvalidate()
        urlSession = nil
        dataTask = nil
    }
}
