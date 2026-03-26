import Foundation
import os.log

/// Log filtering and recording.
/// Drop-in companion for os.Logger that records matching log entries to the event buffer.
public final class AutoMobileLog: @unchecked Sendable {
    public static let shared = AutoMobileLog()

    private let lock = NSLock()
    private var filters: [String: LogFilter] = [:]
    private var bundleId: String?
    private weak var buffer: SdkEventBuffer?

    private init() {}

    func initialize(bundleId: String?, buffer: SdkEventBuffer) {
        lock.lock()
        self.bundleId = bundleId
        self.buffer = buffer
        lock.unlock()
    }

    // MARK: - Filter Management

    /// Add a log filter. Logs matching the filter's patterns are recorded to the event buffer.
    public func addFilter(
        name: String,
        tagPattern: NSRegularExpression? = nil,
        messagePattern: NSRegularExpression? = nil,
        minLevel: LogLevel = .verbose
    ) {
        lock.lock()
        defer { lock.unlock() }
        filters[name] = LogFilter(
            name: name,
            tagPattern: tagPattern,
            messagePattern: messagePattern,
            minLevel: minLevel
        )
    }

    /// Convenience: add a filter with string regex patterns.
    /// Returns false and does not register the filter if a pattern is invalid.
    @discardableResult
    public func addFilter(
        name: String,
        tagPattern: String? = nil,
        messagePattern: String? = nil,
        minLevel: LogLevel = .verbose
    ) -> Bool {
        var tagRegex: NSRegularExpression?
        var messageRegex: NSRegularExpression?

        if let pattern = tagPattern {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
            tagRegex = regex
        }
        if let pattern = messagePattern {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
            messageRegex = regex
        }

        addFilter(name: name, tagPattern: tagRegex, messagePattern: messageRegex, minLevel: minLevel)
        return true
    }

    /// Remove a filter by name.
    public func removeFilter(name: String) {
        lock.lock()
        defer { lock.unlock() }
        filters.removeValue(forKey: name)
    }

    /// Remove all filters.
    public func clearFilters() {
        lock.lock()
        defer { lock.unlock() }
        filters.removeAll()
    }

    /// Number of active filters.
    public var filterCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return filters.count
    }

    // MARK: - Log Methods

    public func v(_ tag: String? = nil, _ message: String) {
        log(level: .verbose, tag: tag, message: message)
    }

    public func d(_ tag: String? = nil, _ message: String) {
        log(level: .debug, tag: tag, message: message)
    }

    public func i(_ tag: String? = nil, _ message: String) {
        log(level: .info, tag: tag, message: message)
    }

    public func w(_ tag: String? = nil, _ message: String) {
        log(level: .warning, tag: tag, message: message)
    }

    public func e(_ tag: String? = nil, _ message: String) {
        log(level: .error, tag: tag, message: message)
    }

    public func fault(_ tag: String? = nil, _ message: String) {
        log(level: .fault, tag: tag, message: message)
    }

    // MARK: - Internal

    private func log(level: LogLevel, tag: String?, message: String) {
        guard AutoMobileSDK.shared.isEnabled else { return }

        lock.lock()
        guard !filters.isEmpty else {
            lock.unlock()
            return
        }
        let currentFilters = Array(filters.values)
        let currentBuffer = buffer
        lock.unlock()

        for filter in currentFilters {
            if filter.matches(level: level, tag: tag, message: message) {
                let event = SdkLogEvent(
                    level: level,
                    tag: tag,
                    message: message,
                    filterName: filter.name
                )
                currentBuffer?.add(event)
            }
        }
    }

    // MARK: - Testing Support

    internal func reset() {
        lock.lock()
        filters.removeAll()
        bundleId = nil
        buffer = nil
        lock.unlock()
    }
}

// MARK: - LogFilter

struct LogFilter: Sendable {
    let name: String
    let tagPattern: NSRegularExpression?
    let messagePattern: NSRegularExpression?
    let minLevel: LogLevel

    func matches(level: LogLevel, tag: String?, message: String) -> Bool {
        guard level >= minLevel else { return false }

        if let tagPattern = tagPattern {
            guard let tag = tag else { return false }
            let range = NSRange(tag.startIndex..., in: tag)
            guard tagPattern.firstMatch(in: tag, range: range) != nil else { return false }
        }

        if let messagePattern = messagePattern {
            let range = NSRange(message.startIndex..., in: message)
            guard messagePattern.firstMatch(in: message, range: range) != nil else { return false }
        }

        return true
    }
}
