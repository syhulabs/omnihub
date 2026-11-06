import Foundation
import UIKit
import UserNotifications
import Capacitor

/// iOS counterpart of android/.../alarm/ (AlarmPlugin, AlarmStore, AlarmScheduler).
///
/// iOS has no AlarmManager and an app cannot ring on its own in the background, so alarms here are
/// time-sensitive local notifications: the device ringtone (capped at 30 s by iOS), shown even in
/// most Focus modes thanks to the time-sensitive entitlement. Records are kept in UserDefaults with
/// the same JSON shape as AlarmData.java, so the JS side and cloud sync see identical data on both
/// platforms.
///
/// Scheduling model:
///  - "today": one non-repeating calendar trigger. Once its time has passed the record is marked
///    disabled, like AlarmReceiver does at fire time on Android (iOS gives no hook at fire time, so
///    it happens when the user acts on the notification or the app next becomes active).
///  - "daily" / "weekdays" / "weekend": repeating calendar triggers (one per weekday), which keep
///    firing even if the app is not opened for days.
///  - backups ("ring again if ignored"): one-shot notifications at the next ring's offsets. They are
///    cancelled when the main ring is tapped, snoozed, stopped or swiped away (unless the alarm's
///    persist flags say otherwise), and re-armed for the following ring when the user acts on an
///    alarm notification or the app becomes active.
@objc(AlarmPlugin)
public class AlarmPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "AlarmPlugin"
    public let jsName = "AlarmPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "applyFromSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkExactAlarmPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestExactAlarmPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickRingtone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listRingtones", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previewSound", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importCustomAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCrashLog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearCrashLog", returnType: CAPPluginReturnPromise)
    ]

    static let categoryId = "OMNIHUB_ALARM"
    static let actionSnooze = "OMNIHUB_ALARM_SNOOZE"
    static let actionStop = "OMNIHUB_ALARM_STOP"

    private static let prefix = LocalNotificationHub.alarmPrefix
    private static let snoozeMinutes = 10
    private static let maxBackups = 5
    private static let minBackupOffsetMin = 1
    private static let maxBackupOffsetMin = 180
    private static let defaultBackupOffsetsMin = [5, 10, 30]
    /// Bookkeeping key kept in the stored record and stripped before records reach JS.
    private static let nextFireKey = "iosNextFireAt"

    private let store = AlarmStore()
    private let center = UNUserNotificationCenter.current()
    private var activeObserver: NSObjectProtocol?

    public override func load() {
        activeObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.rearmAll()
        }
        rearmAll()
    }

    deinit {
        if let observer = activeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    static func notificationCategories() -> Set<UNNotificationCategory> {
        let snooze = UNNotificationAction(identifier: actionSnooze, title: "Snooze \(snoozeMinutes) min", options: [])
        let stop = UNNotificationAction(identifier: actionStop, title: "Stop", options: [.destructive])
        let category = UNNotificationCategory(
            identifier: categoryId,
            actions: [snooze, stop],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )
        return [category]
    }

    // MARK: - Plugin methods

    @objc func schedule(_ call: CAPPluginCall) {
        guard let hour = call.getInt("hour"), let minute = call.getInt("minute") else {
            call.reject("hour and minute are required")
            return
        }
        let requestedId = call.getString("id") ?? ""
        let id = requestedId.isEmpty ? UUID().uuidString.lowercased() : requestedId

        var alarm = buildAlarm(call, id: id, hour: hour, minute: minute)
        let now = Self.nowMillis()
        // A genuine local edit keeps createdAt and bumps updatedAt to now. applyFromSync below does
        // the opposite and preserves the incoming timestamps (see the Android plugin for why).
        alarm["createdAt"] = Self.int64(store.find(id)?["createdAt"]) ?? now
        alarm["updatedAt"] = now
        commit(alarm, call)
    }

    @objc func applyFromSync(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let hour = call.getInt("hour"),
              let minute = call.getInt("minute"),
              let updatedAt = Self.int64(call.getAny("updatedAt")) else {
            call.reject("id, hour, minute, and updatedAt are required")
            return
        }
        var alarm = buildAlarm(call, id: id, hour: hour, minute: minute)
        alarm["createdAt"] = Self.int64(call.getAny("createdAt")) ?? Self.nowMillis()
        alarm["updatedAt"] = updatedAt
        commit(alarm, call)
    }

    private func commit(_ incoming: [String: Any], _ call: CAPPluginCall) {
        var alarm = incoming
        let id = Self.string(alarm["id"])
        var armed = false
        if Self.bool(alarm["enabled"], true) {
            armed = arm(&alarm)
        } else {
            disarm(id: id, includeSnooze: true, includeBackups: true)
            alarm[Self.nextFireKey] = nil
        }
        store.upsert(alarm)
        call.resolve(["id": id, "armed": armed])
    }

    private func buildAlarm(_ call: CAPPluginCall, id: String, hour: Int, minute: Int) -> [String: Any] {
        var alarm: [String: Any] = [:]
        alarm["id"] = id
        alarm["hour"] = hour
        alarm["minute"] = minute
        alarm["label"] = call.getString("label") ?? ""
        alarm["repeatMode"] = call.getString("repeatMode") ?? "today"
        alarm["enabled"] = call.getBool("enabled") ?? true
        alarm["soundUri"] = Self.orNull(call.getString("soundUri"))
        alarm["soundName"] = Self.orNull(call.getString("soundName"))
        alarm["backupEnabled"] = call.getBool("backupEnabled") ?? false
        alarm["backupOffsetsMin"] = Self.parseOffsets(call.getArray("backupOffsetsMin"))
        alarm["backupPersistOnSnooze"] = call.getBool("backupPersistOnSnooze") ?? false
        alarm["backupPersistOnStop"] = call.getBool("backupPersistOnStop") ?? false
        return alarm
    }

    /// Clamps each value to [1,180] min, dedupes, sorts ascending, caps at maxBackups entries.
    private static func parseOffsets(_ raw: JSArray?) -> [Int] {
        guard let raw = raw, !raw.isEmpty else { return defaultBackupOffsetsMin }
        var values: [Int] = []
        for item in raw {
            if values.count >= maxBackups { break }
            guard let number = item as? NSNumber else { continue }
            let clamped = max(minBackupOffsetMin, min(maxBackupOffsetMin, number.intValue))
            if !values.contains(clamped) {
                values.append(clamped)
            }
        }
        return values.isEmpty ? defaultBackupOffsetsMin : values.sorted()
    }

    @objc func cancel(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("id is required")
            return
        }
        disarm(id: id, includeSnooze: true, includeBackups: true)
        store.remove(id)
        call.resolve()
    }

    @objc func list(_ call: CAPPluginCall) {
        let alarms = store.loadAll().map(Self.publicRecord)
        call.resolve(["alarms": alarms])
    }

    private static func publicRecord(_ alarm: [String: Any]) -> [String: Any] {
        var copy = alarm
        copy[nextFireKey] = nil
        return copy
    }

    @objc func checkNotificationPermission(_ call: CAPPluginCall) {
        center.getNotificationSettings { settings in
            call.resolve(["granted": Self.isGranted(settings.authorizationStatus)])
        }
    }

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            call.resolve(["granted": granted])
        }
    }

    private static func isGranted(_ status: UNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
    }

    // iOS has no exact-alarm permission; local notifications are always allowed to be scheduled.
    @objc func checkExactAlarmPermission(_ call: CAPPluginCall) {
        call.resolve(["granted": true])
    }

    @objc func requestExactAlarmPermission(_ call: CAPPluginCall) {
        call.resolve()
    }

    // Alarm sounds: iOS notifications can only play the device ringtone or a sound bundled with
    // the app, so the ringtone picker and custom audio import are hidden on iOS
    // (src/tools/alarm/AlarmEditor.tsx, Alarm.tsx). These answer the way the picker expects.
    @objc func pickRingtone(_ call: CAPPluginCall) {
        call.resolve(["cancelled": true])
    }

    @objc func listRingtones(_ call: CAPPluginCall) {
        let sound: [String: Any] = ["uri": "default", "name": "Default Ringtone", "isDefault": true]
        call.resolve(["sounds": [sound]])
    }

    @objc func previewSound(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func stopPreview(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func importCustomAudio(_ call: CAPPluginCall) {
        call.resolve(["cancelled": true])
    }

    // The Android ring service's crash log has no iOS equivalent (nothing runs natively at ring time).
    @objc func getCrashLog(_ call: CAPPluginCall) {
        call.resolve(["log": ""])
    }

    @objc func clearCrashLog(_ call: CAPPluginCall) {
        call.resolve()
    }

    // MARK: - Scheduling

    private static func mainId(_ id: String, _ weekday: Int) -> String {
        return "\(prefix)\(id):main:\(weekday)"
    }

    private static func backupId(_ id: String, _ index: Int) -> String {
        return "\(prefix)\(id):backup:\(index)"
    }

    private static func snoozeId(_ id: String) -> String {
        return "\(prefix)\(id):snooze"
    }

    private static func mainIds(_ id: String) -> [String] {
        return (0...7).map { mainId(id, $0) }
    }

    private static func backupIds(_ id: String) -> [String] {
        return (1...maxBackups).map { backupId(id, $0) }
    }

    private func disarm(id: String, includeSnooze: Bool, includeBackups: Bool) {
        var ids = Self.mainIds(id)
        if includeBackups {
            ids += Self.backupIds(id)
        }
        if includeSnooze {
            ids.append(Self.snoozeId(id))
        }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    /// Schedules the alarm's main notification(s) and, unless a ring is in progress whose backups
    /// must be left alone, the backups for the next ring. Returns false when there is no next ring.
    @discardableResult
    private func arm(_ alarm: inout [String: Any], keepPendingBackups: Bool = false) -> Bool {
        let id = Self.string(alarm["id"])
        disarm(id: id, includeSnooze: false, includeBackups: !keepPendingBackups)
        guard let next = Self.nextFireDate(alarm, after: Date()) else { return false }

        let content = makeContent(alarm, body: Self.timeLabel(next))
        let mode = Self.string(alarm["repeatMode"])
        var components = DateComponents()
        components.hour = Self.int(alarm["hour"])
        components.minute = Self.int(alarm["minute"])

        switch mode {
        case "daily":
            add(Self.mainId(id, 0), content, UNCalendarNotificationTrigger(dateMatching: components, repeats: true))
        case "weekdays", "weekend":
            let weekdays = mode == "weekdays" ? [2, 3, 4, 5, 6] : [1, 7]
            for weekday in weekdays {
                var weekly = components
                weekly.weekday = weekday
                add(Self.mainId(id, weekday), content, UNCalendarNotificationTrigger(dateMatching: weekly, repeats: true))
            }
        default: // "today": one ring at the next occurrence of the time
            let once = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: next)
            add(Self.mainId(id, 0), content, UNCalendarNotificationTrigger(dateMatching: once, repeats: false))
        }

        if !keepPendingBackups {
            alarm[Self.nextFireKey] = Self.millis(next)
            scheduleBackups(alarm, ringAt: next)
        }
        return true
    }

    private func scheduleBackups(_ alarm: [String: Any], ringAt ring: Date) {
        guard Self.bool(alarm["backupEnabled"], false) else { return }
        let id = Self.string(alarm["id"])
        for (index, offset) in Self.offsets(alarm).prefix(Self.maxBackups).enumerated() {
            let fireAt = ring.addingTimeInterval(TimeInterval(offset * 60))
            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fireAt)
            let content = makeContent(alarm, body: "Still ringing · backup \(index + 1) for your \(Self.timeLabel(ring)) alarm")
            add(Self.backupId(id, index + 1), content, UNCalendarNotificationTrigger(dateMatching: components, repeats: false))
        }
    }

    private func scheduleSnooze(_ alarm: [String: Any]) {
        let id = Self.string(alarm["id"])
        let seconds = TimeInterval(Self.snoozeMinutes * 60)
        let content = makeContent(alarm, body: "Snoozed · rings again at \(Self.timeLabel(Date().addingTimeInterval(seconds)))")
        add(Self.snoozeId(id), content, UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false))
    }

    private func add(_ identifier: String, _ content: UNNotificationContent, _ trigger: UNNotificationTrigger) {
        center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    }

    private func makeContent(_ alarm: [String: Any], body: String) -> UNMutableNotificationContent {
        let id = Self.string(alarm["id"])
        let label = Self.string(alarm["label"])
        let content = UNMutableNotificationContent()
        content.title = label.isEmpty ? "Alarm" : label
        content.body = body
        content.sound = Self.alarmSound()
        content.categoryIdentifier = Self.categoryId
        content.threadIdentifier = "alarm-\(id)"
        content.interruptionLevel = .timeSensitive
        content.userInfo = ["alarmId": id]
        return content
    }

    private static func alarmSound() -> UNNotificationSound {
        if #available(iOS 15.2, *) {
            return .defaultRingtone
        }
        return .default
    }

    /// The next moment this alarm should ring after `now`, or nil if it is disabled. Mirrors
    /// AlarmScheduler.nextTriggerMillis.
    static func nextFireDate(_ alarm: [String: Any], after now: Date) -> Date? {
        guard bool(alarm["enabled"], true) else { return nil }
        let calendar = Calendar.current
        var components = calendar.dateComponents([.year, .month, .day], from: now)
        components.hour = int(alarm["hour"])
        components.minute = int(alarm["minute"])
        components.second = 0
        guard var candidate = calendar.date(from: components) else { return nil }
        if candidate <= now {
            candidate = calendar.date(byAdding: .day, value: 1, to: candidate) ?? candidate
        }

        let mode = string(alarm["repeatMode"])
        var steps = 0
        while steps < 7 {
            let weekday = calendar.component(.weekday, from: candidate)
            let isWeekend = weekday == 1 || weekday == 7
            let skip = (mode == "weekend" && !isWeekend) || (mode == "weekdays" && isWeekend)
            if !skip { break }
            candidate = calendar.date(byAdding: .day, value: 1, to: candidate) ?? candidate
            steps += 1
        }
        return candidate
    }

    /// Re-arms every enabled alarm from the store: on launch, whenever the app becomes active, and
    /// after an alarm notification is acted on.
    private func rearmAll() {
        let now = Date()
        var alarms = store.loadAll()
        for index in alarms.indices {
            var alarm = alarms[index]
            guard Self.bool(alarm["enabled"], true) else { continue }

            if let lastRing = Self.date(alarm[Self.nextFireKey]), lastRing <= now {
                let inProgress = now < lastRing.addingTimeInterval(Self.ringWindowSeconds(alarm))
                if Self.string(alarm["repeatMode"]) == "today" {
                    // One-shot alarms switch themselves off once they have rung. Pending backups
                    // and a snooze stay in place while the ring window is still open.
                    alarm["enabled"] = false
                    if !inProgress {
                        alarm[Self.nextFireKey] = nil
                        disarm(id: Self.string(alarm["id"]), includeSnooze: false, includeBackups: true)
                    }
                    alarms[index] = alarm
                    continue
                }
                if inProgress {
                    // A repeating alarm is mid-ring: its repeating triggers are already in place
                    // and its backups must keep their chance to fire. Nothing to do yet.
                    continue
                }
            }

            arm(&alarm)
            alarms[index] = alarm
        }
        store.saveAll(alarms)
    }

    /// How long after a ring its backups and snooze may still be pending.
    private static func ringWindowSeconds(_ alarm: [String: Any]) -> TimeInterval {
        let longestBackup = bool(alarm["backupEnabled"], false) ? (offsets(alarm).max() ?? 0) : 0
        return TimeInterval((max(longestBackup, snoozeMinutes) + 1) * 60)
    }

    private static func offsets(_ alarm: [String: Any]) -> [Int] {
        if let raw = alarm["backupOffsetsMin"] as? [Any] {
            let values = raw.compactMap { ($0 as? NSNumber)?.intValue }
            if !values.isEmpty { return values }
        }
        return defaultBackupOffsetsMin
    }

    // MARK: - NotificationHandlerProtocol

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        return [.banner, .sound, .list]
    }

    public func didReceive(response: UNNotificationResponse) {
        guard let id = response.notification.request.content.userInfo["alarmId"] as? String,
              var alarm = store.find(id) else { return }

        let action = response.actionIdentifier
        let snoozed = action == Self.actionSnooze
        let persist = Self.bool(alarm[snoozed ? "backupPersistOnSnooze" : "backupPersistOnStop"], false)

        if !persist {
            center.removePendingNotificationRequests(withIdentifiers: Self.backupIds(id))
        }
        if snoozed {
            scheduleSnooze(alarm)
        } else if action == Self.actionStop {
            center.removePendingNotificationRequests(withIdentifiers: [Self.snoozeId(id)])
        }
        // A tap (default action) and a swipe-away (custom dismiss action) end the ring like Stop
        // does, minus cancelling a snooze the user asked for earlier.

        if Self.string(alarm["repeatMode"]) == "today" {
            alarm["enabled"] = false
        } else if !persist, let next = Self.nextFireDate(alarm, after: Date()) {
            // Arm the next ring's backups right away so they do not depend on the app being opened.
            alarm[Self.nextFireKey] = Self.millis(next)
            scheduleBackups(alarm, ringAt: next)
        }
        store.upsert(alarm)
    }

    // MARK: - Value helpers

    private static func string(_ value: Any?) -> String {
        return value as? String ?? ""
    }

    private static func int(_ value: Any?) -> Int {
        return (value as? NSNumber)?.intValue ?? 0
    }

    private static func int64(_ value: Any?) -> Int64? {
        return (value as? NSNumber)?.int64Value
    }

    private static func bool(_ value: Any?, _ fallback: Bool) -> Bool {
        return (value as? Bool) ?? fallback
    }

    private static func orNull(_ value: String?) -> Any {
        if let value = value { return value }
        return NSNull()
    }

    private static func millis(_ date: Date) -> Int64 {
        return Int64((date.timeIntervalSince1970 * 1000).rounded())
    }

    private static func nowMillis() -> Int64 {
        return millis(Date())
    }

    private static func date(_ millis: Any?) -> Date? {
        guard let value = int64(millis), value > 0 else { return nil }
        return Date(timeIntervalSince1970: TimeInterval(value) / 1000)
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter
    }()

    private static func timeLabel(_ date: Date) -> String {
        return timeFormatter.string(from: date)
    }
}

/// Alarm records in UserDefaults, as a JSON array with the AlarmData.java field names.
final class AlarmStore {
    private static let key = "omnihub.alarms"
    private let defaults = UserDefaults.standard
    private let lock = NSLock()

    func loadAll() -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return readUnlocked()
    }

    func saveAll(_ alarms: [[String: Any]]) {
        lock.lock()
        defer { lock.unlock() }
        writeUnlocked(alarms)
    }

    func find(_ id: String) -> [String: Any]? {
        return loadAll().first { ($0["id"] as? String) == id }
    }

    func upsert(_ alarm: [String: Any]) {
        lock.lock()
        defer { lock.unlock() }
        var all = readUnlocked()
        let id = alarm["id"] as? String
        if let index = all.firstIndex(where: { ($0["id"] as? String) == id }) {
            all[index] = alarm
        } else {
            all.append(alarm)
        }
        writeUnlocked(all)
    }

    func remove(_ id: String) {
        lock.lock()
        defer { lock.unlock() }
        writeUnlocked(readUnlocked().filter { ($0["id"] as? String) != id })
    }

    private func readUnlocked() -> [[String: Any]] {
        guard let data = defaults.data(forKey: Self.key),
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        return parsed
    }

    private func writeUnlocked(_ alarms: [[String: Any]]) {
        guard JSONSerialization.isValidJSONObject(alarms),
              let data = try? JSONSerialization.data(withJSONObject: alarms) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
