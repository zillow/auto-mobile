import Foundation
import Darwin

/// Simple performance timing utility for debugging test execution
public struct PerfTimer {
    private static let startTime = Date()

    /// Returns elapsed time since process start in milliseconds
    public static func elapsed() -> Int {
        return Int(Date().timeIntervalSince(startTime) * 1000)
    }

    /// Log a message with elapsed time prefix (uses stderr for immediate unbuffered output)
    public static func log(_ message: String) {
        let ms = elapsed()
        let line = "[PERF +\(ms)ms] \(message)\n"
        fputs(line, stderr)
    }

    /// Measure a block and log its duration
    public static func measure<T>(_ label: String, block: () throws -> T) rethrows -> T {
        let start = Date()
        log("\(label) START")
        let result = try block()
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)
        log("\(label) END (\(durationMs)ms)")
        return result
    }

    /// Measure an async block and log its duration
    public static func measureAsync<T>(_ label: String, block: () async throws -> T) async rethrows -> T {
        let start = Date()
        log("\(label) START")
        let result = try await block()
        let durationMs = Int(Date().timeIntervalSince(start) * 1000)
        log("\(label) END (\(durationMs)ms)")
        return result
    }
}
