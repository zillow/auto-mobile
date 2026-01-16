import Foundation
import Network

/// WebSocket client for communicating with iOS Accessibility Service
public class WebSocketClient {

    public enum ClientError: Error {
        case connectionFailed
        case sendFailed
        case receiveFailed
        case invalidResponse
        case messageTooLarge
    }

    private let host: String
    private let port: Int
    private var connection: NWConnection?

    /// Maximum message size (16MB) to prevent memory exhaustion
    private static let maxMessageSize: UInt32 = 16 * 1024 * 1024

    public init(host: String, port: Int) {
        self.host = host
        self.port = port
    }

    /// Connects to the WebSocket server
    public func connect() async throws {
        let endpoint = NWEndpoint.hostPort(
            host: NWEndpoint.Host(host),
            port: NWEndpoint.Port(integerLiteral: UInt16(port))
        )

        connection = NWConnection(to: endpoint, using: .tcp)

        return try await withCheckedThrowingContinuation { continuation in
            connection?.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    continuation.resume()
                case .failed(let error):
                    continuation.resume(throwing: error)
                default:
                    break
                }
            }

            connection?.start(queue: .main)
        }
    }

    /// Disconnects from the WebSocket server
    public func disconnect() {
        connection?.cancel()
        connection = nil
    }

    /// Sends a command and receives the response
    /// Uses 4-byte length prefix framing to handle message fragmentation
    public func sendCommand(_ command: [String: Any]) async throws -> [String: Any] {
        guard let connection = connection else {
            throw ClientError.connectionFailed
        }

        let jsonData = try JSONSerialization.data(withJSONObject: command)

        // Create length-prefixed message (4-byte big-endian length + payload)
        var length = UInt32(jsonData.count).bigEndian
        var framedData = Data(bytes: &length, count: 4)
        framedData.append(jsonData)

        // Send the framed message
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: framedData, completion: .contentProcessed { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }

        // Receive the response with length-prefix framing
        let responseData = try await receiveFramedMessage(connection: connection)

        guard let response = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any] else {
            throw ClientError.invalidResponse
        }

        return response
    }

    /// Receives a complete length-prefixed message, handling TCP fragmentation
    private func receiveFramedMessage(connection: NWConnection) async throws -> Data {
        // First, read the 4-byte length prefix
        let lengthData = try await receiveExactly(connection: connection, count: 4)
        let length = lengthData.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }

        guard length <= Self.maxMessageSize else {
            throw ClientError.messageTooLarge
        }

        // Then read the message payload
        return try await receiveExactly(connection: connection, count: Int(length))
    }

    /// Receives exactly the specified number of bytes, accumulating fragments as needed
    private func receiveExactly(connection: NWConnection, count: Int) async throws -> Data {
        var accumulated = Data()
        accumulated.reserveCapacity(count)

        while accumulated.count < count {
            let remaining = count - accumulated.count
            let chunk = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
                connection.receive(minimumIncompleteLength: 1, maximumLength: remaining) { data, _, _, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                        return
                    }

                    guard let data = data, !data.isEmpty else {
                        continuation.resume(throwing: ClientError.receiveFailed)
                        return
                    }

                    continuation.resume(returning: data)
                }
            }
            accumulated.append(chunk)
        }

        return accumulated
    }

    /// Gets the view hierarchy from the iOS app
    public func getViewHierarchy() async throws -> [String: Any] {
        let command: [String: Any] = ["command": "getViewHierarchy"]
        return try await sendCommand(command)
    }

    /// Finds an element by its accessibility identifier
    public func findElement(byId id: String) async throws -> [String: Any] {
        let command: [String: Any] = [
            "command": "findElement",
            "params": ["id": id]
        ]
        return try await sendCommand(command)
    }

    /// Finds elements by their text content
    public func findElements(byText text: String) async throws -> [[String: Any]] {
        let command: [String: Any] = [
            "command": "findElement",
            "params": ["text": text]
        ]
        let response = try await sendCommand(command)

        guard let elements = response["elements"] as? [[String: Any]] else {
            throw ClientError.invalidResponse
        }

        return elements
    }
}
