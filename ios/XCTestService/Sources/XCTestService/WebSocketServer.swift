import Foundation
import Network

/// WebSocket server for XCTestService
/// Implements RFC 6455 WebSocket protocol over TCP
public class WebSocketServer: WebSocketServing {

    public enum ServerError: Error {
        case alreadyRunning
        case failedToStart(Error)
        case encodingError
    }

    private var listener: NWListener?
    private var connections: [Int: WebSocketConnection] = [:]
    private var nextConnectionId = 1
    private let port: UInt16
    private let commandHandler: CommandHandler
    private let queue = DispatchQueue(label: "com.xctestservice.server")

    public var isRunning: Bool {
        listener != nil
    }

    public init(port: UInt16 = 8765, commandHandler: CommandHandler) {
        self.port = port
        self.commandHandler = commandHandler
    }

    /// Starts the server
    public func start() throws {
        guard listener == nil else {
            throw ServerError.alreadyRunning
        }

        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true

        do {
            listener = try NWListener(using: parameters, on: NWEndpoint.Port(integerLiteral: port))
        } catch {
            throw ServerError.failedToStart(error)
        }

        listener?.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                print("[WebSocketServer] Server ready on port \(self?.port ?? 0)")
            case .failed(let error):
                print("[WebSocketServer] Server failed: \(error)")
                self?.stop()
            case .cancelled:
                print("[WebSocketServer] Server cancelled")
            default:
                break
            }
        }

        listener?.newConnectionHandler = { [weak self] connection in
            self?.handleNewConnection(connection)
        }

        listener?.start(queue: queue)
        print("[WebSocketServer] Starting server on port \(port)...")
    }

    /// Stops the server
    public func stop() {
        connections.values.forEach { $0.close() }
        connections.removeAll()
        listener?.cancel()
        listener = nil
        print("[WebSocketServer] Server stopped")
    }

    // MARK: - Connection Handling

    private func handleNewConnection(_ nwConnection: NWConnection) {
        let connectionId = nextConnectionId
        nextConnectionId += 1

        print("[WebSocketServer] New connection #\(connectionId) from \(nwConnection.endpoint)")

        let connection = WebSocketConnection(
            id: connectionId,
            connection: nwConnection,
            queue: queue
        ) { [weak self] message in
            self?.handleMessage(message, connectionId: connectionId)
        } onClose: { [weak self] in
            self?.connections.removeValue(forKey: connectionId)
            print("[WebSocketServer] Connection #\(connectionId) closed")
        }

        connections[connectionId] = connection
        connection.start()
    }

    private func handleMessage(_ data: Data, connectionId: Int) {
        guard let connection = connections[connectionId] else { return }

        do {
            let request = try JSONDecoder().decode(WebSocketRequest.self, from: data)
            print("[WebSocketServer] Received: \(request.type)")

            let startTime = Date()
            let response = commandHandler.handle(request)
            let totalTimeMs = Int64(Date().timeIntervalSince(startTime) * 1000)

            // Encode and send response
            let responseData = try encodeResponse(response, totalTimeMs: totalTimeMs)
            connection.send(responseData)

        } catch {
            print("[WebSocketServer] Error handling message: \(error)")
            let errorResponse = WebSocketResponse.error(
                type: "error",
                requestId: nil,
                error: error.localizedDescription
            )
            if let data = try? JSONEncoder().encode(errorResponse) {
                connection.send(data)
            }
        }
    }

    private func encodeResponse(_ response: Any, totalTimeMs: Int64) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys

        if let wsResponse = response as? WebSocketResponse {
            return try encoder.encode(wsResponse)
        } else if let hierarchyResponse = response as? HierarchyUpdateResponse {
            return try encoder.encode(hierarchyResponse)
        } else if let screenshotResponse = response as? ScreenshotResponse {
            return try encoder.encode(screenshotResponse)
        } else if let encodable = response as? Encodable {
            return try encoder.encode(AnyEncodable(encodable))
        } else {
            throw ServerError.encodingError
        }
    }

    /// Broadcast a message to all connected clients
    public func broadcast(_ data: Data) {
        for connection in connections.values {
            connection.send(data)
        }
    }
}

// MARK: - WebSocket Connection

/// Handles a single WebSocket connection with handshake and framing
class WebSocketConnection {
    let id: Int
    private let connection: NWConnection
    private let queue: DispatchQueue
    private let onMessage: (Data) -> Void
    private let onClose: () -> Void
    private var isWebSocketUpgraded = false

    init(
        id: Int,
        connection: NWConnection,
        queue: DispatchQueue,
        onMessage: @escaping (Data) -> Void,
        onClose: @escaping () -> Void
    ) {
        self.id = id
        self.connection = connection
        self.queue = queue
        self.onMessage = onMessage
        self.onClose = onClose
    }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                self?.receiveHTTPUpgrade()
            case .failed, .cancelled:
                self?.onClose()
            default:
                break
            }
        }

        connection.start(queue: queue)
    }

    func close() {
        connection.cancel()
    }

    func send(_ data: Data) {
        let frame = createWebSocketFrame(data: data, opcode: 0x01) // Text frame
        connection.send(content: frame, completion: .contentProcessed { error in
            if let error = error {
                print("[WebSocketConnection] Send error: \(error)")
            }
        })
    }

    // MARK: - WebSocket Handshake

    private func receiveHTTPUpgrade() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }

            if let error = error {
                print("[WebSocketConnection] Error: \(error)")
                self.onClose()
                return
            }

            if isComplete {
                self.onClose()
                return
            }

            guard let data = data, let request = String(data: data, encoding: .utf8) else {
                self.receiveHTTPUpgrade()
                return
            }

            if request.contains("Upgrade: websocket") || request.contains("upgrade: websocket") {
                self.handleWebSocketUpgrade(request)
            } else if request.contains("GET /health") {
                self.handleHealthCheck()
            } else {
                // Not a WebSocket request, try again
                self.receiveHTTPUpgrade()
            }
        }
    }

    private func handleHealthCheck() {
        let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 15\r\n\r\n{\"status\":\"ok\"}"
        connection.send(content: response.data(using: .utf8), completion: .contentProcessed { [weak self] _ in
            self?.connection.cancel()
        })
    }

    private func handleWebSocketUpgrade(_ request: String) {
        // Extract Sec-WebSocket-Key
        guard let keyLine = request.split(separator: "\r\n").first(where: { $0.lowercased().hasPrefix("sec-websocket-key:") }),
              let key = keyLine.split(separator: ":").last?.trimmingCharacters(in: .whitespaces) else {
            print("[WebSocketConnection] Missing Sec-WebSocket-Key")
            connection.cancel()
            return
        }

        // Calculate accept key
        let magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        let acceptKey = (key + magic).data(using: .utf8)!.sha1().base64EncodedString()

        // Send upgrade response
        let response = """
        HTTP/1.1 101 Switching Protocols\r
        Upgrade: websocket\r
        Connection: Upgrade\r
        Sec-WebSocket-Accept: \(acceptKey)\r
        \r

        """

        connection.send(content: response.data(using: .utf8), completion: .contentProcessed { [weak self] error in
            if let error = error {
                print("[WebSocketConnection] Upgrade send error: \(error)")
                self?.onClose()
                return
            }

            self?.isWebSocketUpgraded = true
            self?.sendConnectedEvent()
            self?.receiveWebSocketFrame()
        })
    }

    private func sendConnectedEvent() {
        let event = ConnectedEvent(id: id)
        if let data = try? JSONEncoder().encode(event) {
            send(data)
        }
    }

    // MARK: - WebSocket Frame Handling

    private func receiveWebSocketFrame() {
        // Read first 2 bytes (header)
        connection.receive(minimumIncompleteLength: 2, maximumLength: 2) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }

            if let error = error {
                print("[WebSocketConnection] Frame error: \(error)")
                self.onClose()
                return
            }

            if isComplete {
                self.onClose()
                return
            }

            guard let headerData = data, headerData.count == 2 else {
                self.receiveWebSocketFrame()
                return
            }

            self.parseWebSocketFrame(headerData)
        }
    }

    private func parseWebSocketFrame(_ header: Data) {
        let byte0 = header[0]
        let byte1 = header[1]

        let opcode = byte0 & 0x0F
        let isMasked = (byte1 & 0x80) != 0
        var payloadLength = UInt64(byte1 & 0x7F)

        // Handle close frame
        if opcode == 0x08 {
            sendCloseFrame()
            onClose()
            return
        }

        // Handle ping
        if opcode == 0x09 {
            // Send pong
            let pongFrame = createWebSocketFrame(data: Data(), opcode: 0x0A)
            connection.send(content: pongFrame, completion: .contentProcessed { _ in })
            receiveWebSocketFrame()
            return
        }

        // Read extended length if needed
        if payloadLength == 126 {
            readExtendedLength(2, isMasked: isMasked, opcode: opcode)
        } else if payloadLength == 127 {
            readExtendedLength(8, isMasked: isMasked, opcode: opcode)
        } else {
            readPayload(length: payloadLength, isMasked: isMasked, opcode: opcode)
        }
    }

    private func readExtendedLength(_ bytes: Int, isMasked: Bool, opcode: UInt8) {
        connection.receive(minimumIncompleteLength: bytes, maximumLength: bytes) { [weak self] data, _, _, error in
            guard let self = self, let data = data else {
                self?.onClose()
                return
            }

            var length: UInt64 = 0
            for byte in data {
                length = length << 8 | UInt64(byte)
            }

            self.readPayload(length: length, isMasked: isMasked, opcode: opcode)
        }
    }

    private func readPayload(length: UInt64, isMasked: Bool, opcode: UInt8) {
        let maskLength = isMasked ? 4 : 0
        let totalLength = Int(length) + maskLength

        guard totalLength > 0 else {
            receiveWebSocketFrame()
            return
        }

        connection.receive(minimumIncompleteLength: totalLength, maximumLength: totalLength) { [weak self] data, _, _, error in
            guard let self = self, let data = data else {
                self?.onClose()
                return
            }

            var payload: Data
            if isMasked {
                let mask = Array(data.prefix(4))
                let maskedData = data.suffix(from: 4)
                var unmasked = Data()
                for (i, byte) in maskedData.enumerated() {
                    unmasked.append(byte ^ mask[i % 4])
                }
                payload = unmasked
            } else {
                payload = data
            }

            // Handle text or binary frame
            if opcode == 0x01 || opcode == 0x02 {
                self.onMessage(payload)
            }

            self.receiveWebSocketFrame()
        }
    }

    private func createWebSocketFrame(data: Data, opcode: UInt8) -> Data {
        var frame = Data()

        // FIN + opcode
        frame.append(0x80 | opcode)

        // Payload length (server doesn't mask)
        if data.count < 126 {
            frame.append(UInt8(data.count))
        } else if data.count < 65536 {
            frame.append(126)
            frame.append(UInt8((data.count >> 8) & 0xFF))
            frame.append(UInt8(data.count & 0xFF))
        } else {
            frame.append(127)
            for i in (0..<8).reversed() {
                frame.append(UInt8((data.count >> (i * 8)) & 0xFF))
            }
        }

        frame.append(data)
        return frame
    }

    private func sendCloseFrame() {
        let frame = createWebSocketFrame(data: Data(), opcode: 0x08)
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }
}

// MARK: - SHA1 Extension

extension Data {
    func sha1() -> Data {
        var digest = [UInt8](repeating: 0, count: 20)
        _ = self.withUnsafeBytes { bytes in
            CC_SHA1(bytes.baseAddress, CC_LONG(self.count), &digest)
        }
        return Data(digest)
    }
}

// CommonCrypto import for SHA1
import CommonCrypto

// MARK: - AnyEncodable Helper

struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void

    init<T: Encodable>(_ wrapped: T) {
        _encode = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}
