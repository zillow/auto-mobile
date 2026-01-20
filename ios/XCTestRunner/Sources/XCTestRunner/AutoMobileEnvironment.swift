import Foundation
import Darwin

struct AutoMobileEnvironment {
    private let values: [String: String]

    init(values: [String: String] = ProcessInfo.processInfo.environment) {
        self.values = values
    }

    func firstNonEmpty(_ keys: [String]) -> String? {
        for key in keys {
            if let value = values[key], !value.isEmpty {
                return value
            }
        }
        return nil
    }

    func intValue(_ keys: [String]) -> Int? {
        if let stringValue = firstNonEmpty(keys) {
            return Int(stringValue)
        }
        return nil
    }

    func doubleValue(_ keys: [String]) -> Double? {
        if let stringValue = firstNonEmpty(keys) {
            return Double(stringValue)
        }
        return nil
    }

    func boolValue(_ keys: [String]) -> Bool? {
        guard let value = firstNonEmpty(keys) else {
            return nil
        }
        return ["1", "true", "yes", "y"].contains(value.lowercased())
    }
}

enum AutoMobileDaemonSocket {
    static var defaultPath: String {
        let uid = String(getuid())
        return "/tmp/auto-mobile-daemon-\(uid).sock"
    }
}

enum SimulatorDetection {
    static func hasAvailableSimulator() -> Bool {
        PerfTimer.log("hasAvailableSimulator: starting xcrun simctl")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
        process.arguments = ["simctl", "list", "devices", "available", "--json"]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            PerfTimer.log("hasAvailableSimulator: waiting for simctl to complete")
            process.waitUntilExit()

            guard process.terminationStatus == 0 else {
                PerfTimer.log("hasAvailableSimulator: simctl failed with status \(process.terminationStatus)")
                return false
            }

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            PerfTimer.log("hasAvailableSimulator: parsing \(data.count) bytes of JSON")
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let devices = json["devices"] as? [String: [[String: Any]]] else {
                PerfTimer.log("hasAvailableSimulator: failed to parse JSON")
                return false
            }

            var availableCount = 0
            for (_, deviceList) in devices {
                for device in deviceList {
                    if let isAvailable = device["isAvailable"] as? Bool, isAvailable {
                        availableCount += 1
                    }
                }
            }
            PerfTimer.log("hasAvailableSimulator: found \(availableCount) available simulators")
            return availableCount > 0
        } catch {
            PerfTimer.log("hasAvailableSimulator: ERROR - \(error)")
            return false
        }
    }
}

public enum DaemonManager {
    public struct PidFileData: Decodable {
        public let pid: Int
        public let port: Int?
        public let socketPath: String?
        public let startedAt: Int64?
        public let version: String?
    }

    public static var pidFilePath: String {
        let uid = String(getuid())
        return ProcessInfo.processInfo.environment["AUTOMOBILE_DAEMON_PID_FILE_PATH"]
            ?? ProcessInfo.processInfo.environment["AUTO_MOBILE_DAEMON_PID_FILE_PATH"]
            ?? "/tmp/auto-mobile-daemon-\(uid).pid"
    }

    public static var socketPath: String {
        let uid = String(getuid())
        return ProcessInfo.processInfo.environment["AUTOMOBILE_DAEMON_SOCKET_PATH"]
            ?? ProcessInfo.processInfo.environment["AUTO_MOBILE_DAEMON_SOCKET_PATH"]
            ?? "/tmp/auto-mobile-daemon-\(uid).sock"
    }

    public static func isDaemonRunning() -> Bool {
        guard FileManager.default.fileExists(atPath: pidFilePath) else {
            return false
        }
        guard let data = FileManager.default.contents(atPath: pidFilePath),
              let pidData = try? JSONDecoder().decode(PidFileData.self, from: data) else {
            return false
        }
        return isProcessRunning(pid: pidData.pid)
    }

    public static func isProcessRunning(pid: Int) -> Bool {
        return kill(Int32(pid), 0) == 0
    }

    public static func startDaemon(repoRoot: String? = nil) -> Bool {
        PerfTimer.log("startDaemon: looking for repo root")
        let root = repoRoot ?? findRepoRoot()
        guard let root = root else {
            PerfTimer.log("startDaemon: ERROR - could not find repo root")
            return false
        }

        PerfTimer.log("startDaemon: found repo root at \(root)")

        let process = Process()
        process.currentDirectoryURL = URL(fileURLWithPath: root)

        // Inherit essential environment variables for device discovery
        var env = ProcessInfo.processInfo.environment
        // Ensure PATH includes /usr/bin for xcrun/simctl
        let currentPath = env["PATH"] ?? ""
        if !currentPath.contains("/usr/bin") {
            env["PATH"] = "/usr/bin:/usr/local/bin:\(currentPath)"
        }
        process.environment = env

        PerfTimer.log("startDaemon: searching for bun executable")
        if let bunPath = findExecutable("bun") {
            PerfTimer.log("startDaemon: found bun at \(bunPath)")
            process.executableURL = URL(fileURLWithPath: bunPath)
            process.arguments = ["run", "--cwd", root, "src/index.ts", "--daemon", "start"]
        } else {
            PerfTimer.log("startDaemon: bun not found, searching for npx")
            if let npxPath = findExecutable("npx") {
                PerfTimer.log("startDaemon: found npx at \(npxPath)")
                process.executableURL = URL(fileURLWithPath: npxPath)
                process.arguments = ["--yes", "tsx", "src/index.ts", "--daemon", "start"]
            } else {
                PerfTimer.log("startDaemon: ERROR - neither bun nor npx found in PATH")
                return false
            }
        }

        PerfTimer.log("startDaemon: launching process with args: \(process.arguments ?? [])")
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            PerfTimer.log("startDaemon: process launched, waiting for exit")
            process.waitUntilExit()
            let status = process.terminationStatus
            PerfTimer.log("startDaemon: process exited with status \(status)")
            return status == 0
        } catch {
            PerfTimer.log("startDaemon: ERROR - failed to run process: \(error)")
            return false
        }
    }

    public static func ensureDaemonRunning(repoRoot: String? = nil, timeoutSeconds: TimeInterval = 15) -> Bool {
        PerfTimer.log("ensureDaemonRunning: checking isDaemonRunning")
        if isDaemonRunning() {
            PerfTimer.log("ensureDaemonRunning: daemon already running")
            return true
        }

        PerfTimer.log("ensureDaemonRunning: starting daemon")
        guard startDaemon(repoRoot: repoRoot) else {
            PerfTimer.log("ensureDaemonRunning: startDaemon failed")
            return false
        }

        PerfTimer.log("ensureDaemonRunning: waiting for daemon")
        return waitForDaemon(timeoutSeconds: timeoutSeconds)
    }

    public static func waitForDaemon(timeoutSeconds: TimeInterval) -> Bool {
        PerfTimer.log("waitForDaemon: timeout=\(timeoutSeconds)s")
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        var pollCount = 0
        while Date() < deadline {
            pollCount += 1
            if isDaemonRunning() && FileManager.default.fileExists(atPath: socketPath) {
                PerfTimer.log("waitForDaemon: ready after \(pollCount) polls")
                return true
            }
            Thread.sleep(forTimeInterval: 0.2)
        }
        PerfTimer.log("waitForDaemon: TIMEOUT after \(pollCount) polls")
        return false
    }

    private static func findRepoRoot() -> String? {
        var current = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        for _ in 0..<10 {
            let packageJson = current.appendingPathComponent("package.json")
            let srcIndex = current.appendingPathComponent("src/index.ts")
            if FileManager.default.fileExists(atPath: packageJson.path) &&
               FileManager.default.fileExists(atPath: srcIndex.path) {
                return current.path
            }
            current = current.deletingLastPathComponent()
        }
        return nil
    }

    private static func findExecutable(_ name: String) -> String? {
        let commonPaths = [
            "/usr/local/bin/\(name)",
            "/opt/homebrew/bin/\(name)",
            "/usr/bin/\(name)",
            "\(NSHomeDirectory())/.bun/bin/\(name)",
            "\(NSHomeDirectory())/.local/bin/\(name)"
        ]
        for path in commonPaths {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        process.arguments = [name]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            if process.terminationStatus == 0 {
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                if let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !path.isEmpty {
                    return path
                }
            }
        } catch {}
        return nil
    }

    public struct RefreshDevicesResult {
        public let success: Bool
        public let addedDevices: Int
        public let totalDevices: Int
        public let availableDevices: Int
    }

    public static func releaseSession(_ sessionId: String) -> Bool {
        guard isDaemonRunning() else {
            print("[AutoMobile] Cannot release session: daemon not running")
            return false
        }

        let requestId = UUID().uuidString
        let request: [String: Any] = [
            "id": requestId,
            "type": "daemon_request",
            "method": "daemon/releaseSession",
            "params": ["sessionId": sessionId]
        ]

        guard let requestData = try? JSONSerialization.data(withJSONObject: request),
              var requestLine = String(data: requestData, encoding: .utf8) else {
            print("[AutoMobile] Failed to serialize release session request")
            return false
        }
        requestLine.append("\n")

        let result = sendDaemonRequest(requestLine, timeoutSeconds: 5)
        if let result = result, let success = result["success"] as? Bool, success {
            if let resultData = result["result"] as? [String: Any],
               let alreadyReleased = resultData["alreadyReleased"] as? Bool,
               alreadyReleased {
                print("[AutoMobile] Session \(sessionId) was already released (auto-released by daemon)")
            } else {
                print("[AutoMobile] Session \(sessionId) released")
            }
            return true
        }
        if let result = result, let error = result["error"] as? String {
            print("[AutoMobile] Failed to release session \(sessionId): \(error)")
        } else {
            print("[AutoMobile] Failed to release session \(sessionId)")
        }
        return false
    }

    public static func refreshDevicePool(timeoutSeconds: TimeInterval = 30) -> RefreshDevicesResult {
        PerfTimer.log("refreshDevicePool START")
        guard isDaemonRunning() else {
            PerfTimer.log("refreshDevicePool: daemon not running")
            return RefreshDevicesResult(success: false, addedDevices: 0, totalDevices: 0, availableDevices: 0)
        }

        let requestId = UUID().uuidString
        let request: [String: Any] = [
            "id": requestId,
            "type": "daemon_request",
            "method": "daemon/refreshDevices",
            "params": [String: Any]()
        ]

        guard let requestData = try? JSONSerialization.data(withJSONObject: request),
              var requestLine = String(data: requestData, encoding: .utf8) else {
            PerfTimer.log("refreshDevicePool: failed to serialize request")
            return RefreshDevicesResult(success: false, addedDevices: 0, totalDevices: 0, availableDevices: 0)
        }
        requestLine.append("\n")

        PerfTimer.log("refreshDevicePool: sending daemon request")
        let result = sendDaemonRequest(requestLine, timeoutSeconds: timeoutSeconds)
        guard let result = result,
              let success = result["success"] as? Bool, success,
              let resultData = result["result"] as? [String: Any] else {
            PerfTimer.log("refreshDevicePool: request failed")
            return RefreshDevicesResult(success: false, addedDevices: 0, totalDevices: 0, availableDevices: 0)
        }

        let addedDevices = resultData["addedDevices"] as? Int ?? 0
        let totalDevices = resultData["totalDevices"] as? Int ?? 0
        let availableDevices = resultData["availableDevices"] as? Int ?? 0

        PerfTimer.log("refreshDevicePool END: +\(addedDevices) devices, \(availableDevices)/\(totalDevices) available")
        return RefreshDevicesResult(success: true, addedDevices: addedDevices, totalDevices: totalDevices, availableDevices: availableDevices)
    }

    private static func sendDaemonRequest(_ request: String, timeoutSeconds: TimeInterval) -> [String: Any]? {
        let socketFd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard socketFd >= 0 else {
            print("[AutoMobile] Failed to create socket")
            return nil
        }
        defer { Darwin.close(socketFd) }

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        socketPath.withCString { cString in
            _ = withUnsafeMutablePointer(to: &addr.sun_path.0) { ptr in
                strcpy(ptr, cString)
            }
        }

        let connectResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                Darwin.connect(socketFd, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }

        guard connectResult == 0 else {
            print("[AutoMobile] Failed to connect to daemon socket: \(errno)")
            return nil
        }

        // Set socket timeout
        var tv = timeval(tv_sec: Int(timeoutSeconds), tv_usec: 0)
        setsockopt(socketFd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

        guard let requestData = request.data(using: .utf8) else {
            return nil
        }
        let written = requestData.withUnsafeBytes { ptr in
            Darwin.write(socketFd, ptr.baseAddress, ptr.count)
        }
        guard written == requestData.count else {
            print("[AutoMobile] Failed to write request to socket")
            return nil
        }

        var buffer = Data()
        let readBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
        defer { readBuffer.deallocate() }

        while true {
            let bytesRead = Darwin.read(socketFd, readBuffer, 4096)
            if bytesRead > 0 {
                buffer.append(readBuffer, count: bytesRead)
                if let responseStr = String(data: buffer, encoding: .utf8),
                   responseStr.contains("\n") {
                    let lines = responseStr.split(separator: "\n", maxSplits: 1)
                    if let firstLine = lines.first,
                       let lineData = String(firstLine).data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any] {
                        return json
                    }
                }
            } else {
                break
            }
        }

        print("[AutoMobile] Timeout or error waiting for daemon response")
        return nil
    }
}
