import Foundation

/// Protocol for event broadcasting to allow faking in tests.
public protocol EventBroadcasting: Sendable {
    func broadcastBatch(bundleId: String?, events: [any SdkEvent])
}

/// Broadcasts SDK event batches via NotificationCenter for in-process communication
/// and Darwin notifications for cross-process communication.
public final class SdkEventBroadcaster: EventBroadcasting, @unchecked Sendable {

    public static let eventBatchNotification = Notification.Name(
        "dev.jasonpearson.automobile.sdk.EVENT_BATCH"
    )

    public static let eventBatchUserInfoKey = "eventBatch"

    public static let shared = SdkEventBroadcaster()

    private init() {}

    public func broadcastBatch(bundleId: String?, events: [any SdkEvent]) {
        guard !events.isEmpty else { return }

        let envelopes = events.compactMap { event -> SdkEventEnvelope? in
            try? SdkEventEnvelope(event)
        }
        guard !envelopes.isEmpty else { return }

        let batch = SdkEventBatch(
            bundleId: bundleId,
            events: envelopes
        )

        guard let data = try? JSONEncoder().encode(batch) else { return }

        NotificationCenter.default.post(
            name: Self.eventBatchNotification,
            object: nil,
            userInfo: [Self.eventBatchUserInfoKey: data]
        )
    }
}
