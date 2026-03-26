import XCTest
@testable import AutoMobileSDK

final class AutoMobileBiometricsTests: XCTestCase {
    override func tearDown() {
        AutoMobileBiometrics.shared.reset()
        super.tearDown()
    }

    func testOverrideAndConsume() {
        AutoMobileBiometrics.shared.overrideResult(.success)
        XCTAssertTrue(AutoMobileBiometrics.shared.hasOverride)

        let result = AutoMobileBiometrics.shared.consumeOverride()
        XCTAssertEqual(result, .success)
        XCTAssertFalse(AutoMobileBiometrics.shared.hasOverride)
    }

    func testConsumeWithoutOverrideReturnsNil() {
        XCTAssertNil(AutoMobileBiometrics.shared.consumeOverride())
    }

    func testConsumeIsOneShot() {
        AutoMobileBiometrics.shared.overrideResult(.failure)

        let first = AutoMobileBiometrics.shared.consumeOverride()
        let second = AutoMobileBiometrics.shared.consumeOverride()

        XCTAssertEqual(first, .failure)
        XCTAssertNil(second)
    }

    func testClearOverride() {
        AutoMobileBiometrics.shared.overrideResult(.cancel)
        XCTAssertTrue(AutoMobileBiometrics.shared.hasOverride)

        AutoMobileBiometrics.shared.clearOverride()
        XCTAssertFalse(AutoMobileBiometrics.shared.hasOverride)
        XCTAssertNil(AutoMobileBiometrics.shared.consumeOverride())
    }

    func testExpiredOverrideReturnsNil() {
        // Set override with very short TTL
        AutoMobileBiometrics.shared.overrideResult(.success, ttlMs: 1)

        // Wait for expiry
        Thread.sleep(forTimeInterval: 0.01)

        XCTAssertNil(AutoMobileBiometrics.shared.consumeOverride())
    }

    func testErrorResult() {
        AutoMobileBiometrics.shared.overrideResult(.error(code: 7, message: "Too many attempts"))

        let result = AutoMobileBiometrics.shared.consumeOverride()
        XCTAssertEqual(result, .error(code: 7, message: "Too many attempts"))
    }

    func testOverrideNotificationPosted() {
        let expectation = XCTestExpectation(description: "notification posted")

        let observer = NotificationCenter.default.addObserver(
            forName: AutoMobileBiometrics.overrideNotification,
            object: nil,
            queue: .main
        ) { _ in
            expectation.fulfill()
        }

        AutoMobileBiometrics.shared.overrideResult(.success)
        wait(for: [expectation], timeout: 1.0)

        NotificationCenter.default.removeObserver(observer)
    }
}
