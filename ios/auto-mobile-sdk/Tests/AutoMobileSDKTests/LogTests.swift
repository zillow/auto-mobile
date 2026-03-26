import XCTest
@testable import AutoMobileSDK

final class AutoMobileLogTests: XCTestCase {
    override func tearDown() {
        AutoMobileLog.shared.reset()
        super.tearDown()
    }

    func testAddAndRemoveFilter() {
        XCTAssertEqual(AutoMobileLog.shared.filterCount, 0)
        AutoMobileLog.shared.addFilter(name: "test", tagPattern: "Network")
        XCTAssertEqual(AutoMobileLog.shared.filterCount, 1)
        AutoMobileLog.shared.removeFilter(name: "test")
        XCTAssertEqual(AutoMobileLog.shared.filterCount, 0)
    }

    func testClearFilters() {
        AutoMobileLog.shared.addFilter(name: "a", tagPattern: nil as NSRegularExpression?)
        AutoMobileLog.shared.addFilter(name: "b", tagPattern: nil as NSRegularExpression?)
        XCTAssertEqual(AutoMobileLog.shared.filterCount, 2)
        AutoMobileLog.shared.clearFilters()
        XCTAssertEqual(AutoMobileLog.shared.filterCount, 0)
    }

    func testLogMatchesTagFilter() {
        // Test the filter matching logic directly
        let filter = LogFilter(
            name: "network",
            tagPattern: try? NSRegularExpression(pattern: "Network"),
            messagePattern: nil,
            minLevel: .verbose
        )

        XCTAssertTrue(filter.matches(level: .info, tag: "NetworkManager", message: "request sent"))
        XCTAssertFalse(filter.matches(level: .info, tag: "Database", message: "query"))
    }

    func testLogFilterMinLevel() {
        let filter = LogFilter(
            name: "errors",
            tagPattern: nil,
            messagePattern: nil,
            minLevel: .error
        )

        XCTAssertFalse(filter.matches(level: .verbose, tag: nil, message: "test"))
        XCTAssertFalse(filter.matches(level: .debug, tag: nil, message: "test"))
        XCTAssertFalse(filter.matches(level: .info, tag: nil, message: "test"))
        XCTAssertFalse(filter.matches(level: .warning, tag: nil, message: "test"))
        XCTAssertTrue(filter.matches(level: .error, tag: nil, message: "test"))
        XCTAssertTrue(filter.matches(level: .fault, tag: nil, message: "test"))
    }

    func testLogFilterMessagePattern() {
        let filter = LogFilter(
            name: "errors",
            tagPattern: nil,
            messagePattern: try? NSRegularExpression(pattern: "failed|error"),
            minLevel: .verbose
        )

        XCTAssertTrue(filter.matches(level: .info, tag: nil, message: "request failed"))
        XCTAssertTrue(filter.matches(level: .info, tag: nil, message: "connection error"))
        XCTAssertFalse(filter.matches(level: .info, tag: nil, message: "success"))
    }

    func testLogFilterRequiresTagWhenPatternSet() {
        let filter = LogFilter(
            name: "tagged",
            tagPattern: try? NSRegularExpression(pattern: "App"),
            messagePattern: nil,
            minLevel: .verbose
        )

        XCTAssertFalse(filter.matches(level: .info, tag: nil, message: "test"))
        XCTAssertTrue(filter.matches(level: .info, tag: "AppDelegate", message: "test"))
    }

    func testNoFiltersNoRecording() {
        // With no filters, logging should be a no-op (fast path)
        AutoMobileLog.shared.d("tag", "message")
        // No crash = success. The fast path exits when filters.isEmpty.
    }
}
