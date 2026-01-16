import Foundation
import Network

/// WebSocket server for exposing accessibility tree
public class WebSocketServer {

    public enum ServerError: Error {
        case failedToStart
        case invalidMessage
    }

    private let port: UInt16
    private var listener: NWListener?
    private let accessibilityProvider: AccessibilityTreeProvider
    private var connections: [NWConnection] = []

    /// Initializes the WebSocket server
    public init(port: UInt16 = 8080) {
        self.port = port
        self.accessibilityProvider = AccessibilityTreeProvider()
    }

    /// Starts the WebSocket server
    public func start() throws {
        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true

        do {
            listener = try NWListener(using: parameters, on: NWEndpoint.Port(integerLiteral: port))
        } catch {
            throw ServerError.failedToStart
        }

        listener?.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                print("WebSocket server listening on port \(self?.port ?? 0)")
            case .failed(let error):
                print("WebSocket server failed: \(error)")
            default:
                break
            }
        }

        listener?.newConnectionHandler = { [weak self] connection in
            self?.handleConnection(connection)
        }

        listener?.start(queue: .main)
    }

    /// Stops the WebSocket server
    public func stop() {
        connections.forEach { $0.cancel() }
        connections.removeAll()
        listener?.cancel()
        listener = nil
    }

    // MARK: - Private Methods

    private func handleConnection(_ connection: NWConnection) {
        connections.append(connection)

        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                self?.receiveMessage(on: connection)
            case .cancelled, .failed:
                self?.connections.removeAll { $0 === connection }
            default:
                break
            }
        }

        connection.start(queue: .main)
    }

    private func receiveMessage(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            if let data = data, !data.isEmpty {
                self?.handleMessage(data, on: connection)
            }

            if !isComplete {
                self?.receiveMessage(on: connection)
            }
        }
    }

    private func handleMessage(_ data: Data, on connection: NWConnection) {
        guard let message = try? JSONDecoder().decode(WebSocketMessage.self, from: data) else {
            sendError("Invalid message format", on: connection)
            return
        }

        switch message.command {
        case "getViewHierarchy":
            handleGetViewHierarchy(on: connection)
        case "findElement":
            handleFindElement(message.params, on: connection)
        default:
            sendError("Unknown command: \(message.command)", on: connection)
        }
    }

    private func handleGetViewHierarchy(on connection: NWConnection) {
        guard let hierarchy = accessibilityProvider.getViewHierarchy() else {
            sendError("Failed to retrieve view hierarchy", on: connection)
            return
        }

        sendResponse(hierarchy, on: connection)
    }

    private func handleFindElement(_ params: [String: String]?, on connection: NWConnection) {
        guard let params = params else {
            sendError("Missing parameters", on: connection)
            return
        }

        if let id = params["id"] {
            let element = accessibilityProvider.findElement(byId: id)
            sendResponse(element, on: connection)
        } else if let text = params["text"] {
            let elements = accessibilityProvider.findElements(byText: text)
            sendResponse(elements, on: connection)
        } else {
            sendError("Missing id or text parameter", on: connection)
        }
    }

    private func sendResponse<T: Encodable>(_ data: T, on connection: NWConnection) {
        guard let responseData = try? JSONEncoder().encode(data) else {
            sendError("Failed to encode response", on: connection)
            return
        }

        connection.send(content: responseData, completion: .idempotent)
    }

    private func sendError(_ message: String, on connection: NWConnection) {
        let error = ["error": message]
        guard let errorData = try? JSONEncoder().encode(error) else {
            return
        }

        connection.send(content: errorData, completion: .idempotent)
    }
}

// MARK: - Message Types

struct WebSocketMessage: Codable {
    let command: String
    let params: [String: String]?
}
