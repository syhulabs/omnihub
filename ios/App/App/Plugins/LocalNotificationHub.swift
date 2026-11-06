import Foundation
import UserNotifications
import Capacitor

/// Single handler for the app's own local notifications. Capacitor's NotificationRouter has one
/// slot for a local-notification handler, and both the Alarm and Sleep Mode plugins need it, so
/// this hub owns the slot and forwards by identifier prefix.
final class LocalNotificationHub: NSObject, NotificationHandlerProtocol {
    static let shared = LocalNotificationHub()

    static let alarmPrefix = "alarm:"
    static let sleepPrefix = "sleep:"

    weak var alarmHandler: NotificationHandlerProtocol?
    weak var sleepHandler: NotificationHandlerProtocol?

    /// Registers both plugins' categories in one call: setNotificationCategories replaces the
    /// whole set, so each plugin registering its own would drop the other's.
    func registerCategories() {
        let categories = AlarmPlugin.notificationCategories().union(SleepModePlugin.notificationCategories())
        UNUserNotificationCenter.current().setNotificationCategories(categories)
    }

    func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        let id = notification.request.identifier
        if id.hasPrefix(Self.alarmPrefix), let handler = alarmHandler {
            return handler.willPresent(notification: notification)
        }
        if id.hasPrefix(Self.sleepPrefix), let handler = sleepHandler {
            return handler.willPresent(notification: notification)
        }
        return [.banner, .sound, .list]
    }

    func didReceive(response: UNNotificationResponse) {
        let id = response.notification.request.identifier
        if id.hasPrefix(Self.alarmPrefix) {
            alarmHandler?.didReceive(response: response)
        } else if id.hasPrefix(Self.sleepPrefix) {
            sleepHandler?.didReceive(response: response)
        }
    }
}
