import Foundation
import Network

/// WebSocket client for communicating with iOS Accessibility Service
public class WebSocketClient {

    public enum ClientError: Error {
        case connectionFailed
        case sendFailed
        case receiveFailed
        case invalidResponse
    }

    private let host: String
    private let port: Int
    private var connection: NWConnection?

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
    public func sendCommand(_ command: [String: Any]) async throws -> [String: Any] {
        guard let connection = connection else {
            throw ClientError.connectionFailed
        }

        let data = try JSONSerialization.data(withJSONObject: command)

        return try await withCheckedThrowingContinuation { continuation in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, _, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                        return
                    }

                    guard let data = data,
                          let response = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                        continuation.resume(throwing: ClientError.invalidResponse)
                        return
                    }

                    continuation.resume(returning: response)
                }
            })
        }
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
