import Foundation
#if canImport(UserNotifications)
import UserNotifications
#endif

/// Notification style for test notifications.
public enum NotificationStyle: String, Sendable {
    case `default`
    case bigText
    case bigPicture
}

/// An action button attached to a notification.
public struct NotificationAction: Sendable {
    public let label: String
    public let actionId: String

    public init(label: String, actionId: String) {
        self.label = label
        self.actionId = actionId
    }
}

/// Post local notifications for testing.
/// iOS equivalent of Android's AutoMobileNotifications.
public final class AutoMobileNotifications: @unchecked Sendable {
    public static let shared = AutoMobileNotifications()

    /// Category identifier used for notifications with actions.
    public static let categoryIdentifier = "dev.jasonpearson.automobile.sdk.NOTIFICATION"

    /// Notification posted when a notification action is tapped.
    public static let actionNotification = Notification.Name(
        "dev.jasonpearson.automobile.sdk.NOTIFICATION_ACTION"
    )

    private init() {}

    /// Post a local notification.
    /// Returns true if the notification was scheduled successfully.
    #if canImport(UserNotifications)
    public func post(
        title: String,
        body: String,
        style: NotificationStyle = .default,
        imagePath: String? = nil,
        actions: [NotificationAction] = [],
        categoryId: String? = nil
    ) async -> Bool {
        let center = UNUserNotificationCenter.current()

        // Request authorization if needed
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        // Handle image attachment (download remote images to temp file first)
        if let imagePath = imagePath, let url = await resolveImageURL(from: imagePath) {
            if let attachment = try? UNNotificationAttachment(identifier: "image", url: url) {
                content.attachments = [attachment]
            }
        }

        // Register actions if provided
        if !actions.isEmpty {
            let category = categoryId ?? Self.categoryIdentifier
            let unActions = actions.map { action in
                UNNotificationAction(
                    identifier: action.actionId,
                    title: action.label,
                    options: .foreground
                )
            }
            let notificationCategory = UNNotificationCategory(
                identifier: category,
                actions: unActions,
                intentIdentifiers: []
            )
            // Merge with existing categories to avoid clobbering app-registered ones
            let existing = await center.notificationCategories()
            var merged = existing.filter { $0.identifier != category }
            merged.insert(notificationCategory)
            center.setNotificationCategories(merged)
            content.categoryIdentifier = category
        }

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        )

        do {
            try await center.add(request)
            return true
        } catch {
            return false
        }
    }

    /// Resolve an image path to a local file URL suitable for UNNotificationAttachment.
    /// Downloads remote images to a temp file since attachments require local URLs.
    private func resolveImageURL(from path: String) async -> URL? {
        if path.hasPrefix("http://") || path.hasPrefix("https://") {
            guard let remoteURL = URL(string: path) else { return nil }
            do {
                let (data, _) = try await URLSession.shared.data(from: remoteURL)
                let ext = remoteURL.pathExtension.isEmpty ? "jpg" : remoteURL.pathExtension
                let tempURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString)
                    .appendingPathExtension(ext)
                try data.write(to: tempURL)
                return tempURL
            } catch {
                return nil
            }
        }
        let url = URL(fileURLWithPath: path)
        return FileManager.default.fileExists(atPath: path) ? url : nil
    }

    /// Install a delegate handler that posts `actionNotification` when a notification
    /// action button is tapped. Chains to any existing delegate to avoid clobbering
    /// app-installed handlers. Call this once during app setup.
    /// Returns the delegate object (retain it to keep it active).
    public func installActionHandler(on center: UNUserNotificationCenter = .current()) -> UNUserNotificationCenterDelegate {
        let handler = NotificationActionHandler(previousDelegate: center.delegate)
        center.delegate = handler
        return handler
    }
    #endif
}

#if canImport(UserNotifications)
/// Delegate that forwards notification action taps to NotificationCenter.
/// Chains to any previously installed delegate to avoid clobbering app behavior.
final class NotificationActionHandler: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    private weak var previousDelegate: UNUserNotificationCenterDelegate?

    init(previousDelegate: UNUserNotificationCenterDelegate? = nil) {
        self.previousDelegate = previousDelegate
        super.init()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let actionId = response.actionIdentifier
        if actionId != UNNotificationDefaultActionIdentifier,
           actionId != UNNotificationDismissActionIdentifier,
           AutoMobileSDK.shared.isEnabled {
            // Post to NotificationCenter so SDK consumers can observe
            NotificationCenter.default.post(
                name: AutoMobileNotifications.actionNotification,
                object: nil,
                userInfo: [
                    "actionId": actionId,
                    "notificationTitle": response.notification.request.content.title,
                ]
            )

            // Emit as SDK event (respecting global enabled flag)
            if AutoMobileSDK.shared.isEnabled {
                let event = SdkNotificationActionEvent(
                    actionId: actionId,
                    notificationTitle: response.notification.request.content.title
                )
                AutoMobileSDK.shared.getEventBuffer()?.add(event)
            }
        }

        // Chain to previous delegate
        if let prev = previousDelegate,
           prev.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
            prev.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
        } else {
            completionHandler()
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Chain to previous delegate for foreground presentation
        if let prev = previousDelegate,
           prev.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
            prev.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
        } else {
            completionHandler([.banner, .sound])
        }
    }
}
#endif
