import XCTest
@testable import AutoMobileSDK

final class ViewBodyTrackerTests: XCTestCase {
    override func tearDown() {
        ViewBodyTracker.shared.reset()
        super.tearDown()
    }

    func testDisabledByDefault() {
        XCTAssertFalse(ViewBodyTracker.shared.isEnabled)
    }

    func testRecordingWhenDisabledIsNoOp() {
        ViewBodyTracker.shared.recordBodyEvaluation(id: "test", viewName: "TestView")
        let snapshots = ViewBodyTracker.shared.getSnapshots()
        XCTAssertTrue(snapshots.isEmpty)
    }

    func testRecordBodyEvaluation() {
        let fakeTimer = FakeTimer()
        ViewBodyTracker.shared.setEnabled(true, timerFactory: { fakeTimer })

        ViewBodyTracker.shared.recordBodyEvaluation(id: "home", viewName: "HomeView")
        ViewBodyTracker.shared.recordBodyEvaluation(id: "home", viewName: "HomeView")
        ViewBodyTracker.shared.recordBodyEvaluation(id: "home", viewName: "HomeView")

        let snapshots = ViewBodyTracker.shared.getSnapshots()
        XCTAssertEqual(snapshots.count, 1)
        XCTAssertEqual(snapshots.first?.id, "home")
        XCTAssertEqual(snapshots.first?.viewName, "HomeView")
        XCTAssertEqual(snapshots.first?.totalCount, 3)
    }

    func testRecordDuration() {
        let fakeTimer = FakeTimer()
        ViewBodyTracker.shared.setEnabled(true, timerFactory: { fakeTimer })

        ViewBodyTracker.shared.recordBodyEvaluation(id: "view1", viewName: "View1")
        ViewBodyTracker.shared.recordDuration(id: "view1", durationMs: 10.0)
        ViewBodyTracker.shared.recordDuration(id: "view1", durationMs: 20.0)

        let snapshots = ViewBodyTracker.shared.getSnapshots()
        XCTAssertEqual(snapshots.first?.averageDurationMs, 15.0)
    }

    func testMultipleViews() {
        let fakeTimer = FakeTimer()
        ViewBodyTracker.shared.setEnabled(true, timerFactory: { fakeTimer })

        ViewBodyTracker.shared.recordBodyEvaluation(id: "a", viewName: "ViewA")
        ViewBodyTracker.shared.recordBodyEvaluation(id: "b", viewName: "ViewB")
        ViewBodyTracker.shared.recordBodyEvaluation(id: "a", viewName: "ViewA")

        let snapshots = ViewBodyTracker.shared.getSnapshots()
        XCTAssertEqual(snapshots.count, 2)

        let viewA = snapshots.first { $0.id == "a" }
        let viewB = snapshots.first { $0.id == "b" }
        XCTAssertEqual(viewA?.totalCount, 2)
        XCTAssertEqual(viewB?.totalCount, 1)
    }
}
