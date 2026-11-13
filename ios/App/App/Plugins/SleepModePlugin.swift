import Foundation
import UIKit
import AVFoundation
import UserNotifications
import Capacitor

/// iOS counterpart of android/.../sleepmode/ (SleepModePlugin, SleepModeScheduler, SleepModeStore,
/// SleepModeSpeakService).
///
/// Android runs a nightly loop in the background and only nags while the screen is on. iOS lets an
/// app do neither, so Sleep Mode here is a short run of local notifications per night: one at
/// bedtime and up to three follow-ups at the chosen interval, escalating through the message bank's
/// tiers, then silence until the next night. The next seven nights are scheduled ahead so reminders
/// keep coming even if the app is not opened. When a reminder arrives while Omni Hub is in the
/// foreground it is also spoken aloud at the configured volume, like the Android version.
///
/// "Snooze" and "Stop for tonight" on the notification work like their Android counterparts.
/// Sleep Insights only ever gets real data: a night is recorded with the reminders the user
/// actually saw in the app or acted on; nights the app never learned about are left out.
@objc(SleepModePlugin)
public class SleepModePlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "SleepModePlugin"
    public let jsName = "SleepModePlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previewMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speakTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkExactAlarmPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestExactAlarmPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkFullScreenIntentPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestFullScreenIntentPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkOverlayPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestOverlayPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAiMessages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAiMessagesInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAiAudioClips", returnType: CAPPluginReturnPromise)
    ]

    static let categoryId = "OMNIHUB_SLEEP"
    static let actionSnooze = "OMNIHUB_SLEEP_SNOOZE"
    static let actionStop = "OMNIHUB_SLEEP_STOP"

    private static let prefix = LocalNotificationHub.sleepPrefix
    private static let maxBeatsPerNight = 4
    private static let nightsAhead = 7
    private static let snoozeMinutes = 30
    private static let tierCount = SleepMessageBank.tierCount

    private let store = SleepModeStore()
    private let center = UNUserNotificationCenter.current()
    private let synthesizer = AVSpeechSynthesizer()
    private var activeObserver: NSObjectProtocol?

    public override func load() {
        activeObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.refresh()
        }
        refresh()
    }

    deinit {
        if let observer = activeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    static func notificationCategories() -> Set<UNNotificationCategory> {
        let snooze = UNNotificationAction(identifier: actionSnooze, title: "Snooze \(snoozeMinutes) min", options: [])
        let stop = UNNotificationAction(identifier: actionStop, title: "Stop for tonight", options: [.destructive])
        let category = UNNotificationCategory(identifier: categoryId, actions: [snooze, stop], intentIdentifiers: [], options: [])
        return [category]
    }

    // MARK: - Plugin methods

    @objc func configure(_ call: CAPPluginCall) {
        var data = SleepModeStore.fresh()
        data["enabled"] = call.getBool("enabled", false)
        data["bedtimeHour"] = call.getInt("bedtimeHour", 22)
        data["bedtimeMinute"] = call.getInt("bedtimeMinute", 30)
        data["wakeHour"] = call.getInt("wakeHour", 7)
        data["wakeMinute"] = call.getInt("wakeMinute", 0)
        data["intervalMin"] = call.getInt("intervalMin", 30)
        data["volumePercent"] = call.getInt("volumePercent", 85)
        data["personality"] = call.getString("personality", "friendly")
        data["mode"] = call.getString("mode", "normal")
        data["callName"] = Self.orNull(call.getString("callName"))
        data["workSchoolRoutine"] = Self.orNull(call.getString("workSchoolRoutine"))
        data["relationshipStatus"] = Self.orNull(call.getString("relationshipStatus"))
        data["interests"] = Self.orNull(call.getString("interests"))
        data["customNotes"] = Self.orNull(call.getString("customNotes"))

        // A settings change always restarts scheduling from now (same as Android), keeping the
        // previously scheduled identifiers so they can be removed.
        let previous = store.load()
        data["iosScheduledIds"] = previous["iosScheduledIds"] ?? [String]()
        data["iosGeneration"] = previous["iosGeneration"] ?? 0

        // During a running night a settings change must not restart it: that fired a reminder a
        // second later for every tweak and undid "Stop for tonight" (same rule as Android). The
        // session keeps its counters and its mute; the next reminder is one interval away.
        let now = Date()
        let sessionRunning = Self.bool(previous["enabled"], false) && Self.bool(data["enabled"], false)
            && (Self.int64(previous["sessionStartMillis"]) ?? 0) > 0
            && Self.isWithinSleepWindow(data, at: now)
        if sessionRunning {
            for key in ["sessionStartMillis", "nagCount", "lastNagMillis", "mutedUntilMillis", "recentKeysCsv", "iosCountedIds"] {
                if let value = previous[key] {
                    data[key] = value
                }
            }
        }

        var armed = false
        if sessionRunning {
            let interval = TimeInterval(max(1, Self.int(data["intervalMin"], 30)) * 60)
            var start = now.addingTimeInterval(interval)
            if let mutedUntil = Self.date(data["mutedUntilMillis"]), mutedUntil > start {
                start = mutedUntil
            }
            // The raised tier only belongs to tonight. Muted until wake ("Stop for tonight"), the
            // first reminder scheduled is tomorrow's bedtime one, which starts gently again.
            let tonightWake = Self.sleepWindow(data, containing: now)?.wake ?? now
            let tier = start >= tonightWake ? 0 : min(Self.tierCount - 1, Self.int(data["nagCount"]) + 1)
            armed = rebuildSchedule(&data, from: start, startTier: tier)
        } else if Self.bool(data["enabled"], false) {
            armed = rebuildSchedule(&data, from: now.addingTimeInterval(1), startTier: 0)
        } else {
            clearSchedule(&data)
            stopSpeaking()
        }
        store.save(data)
        call.resolve(["armed": armed])
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(Self.publicStatus(store.load()))
    }

    private static func publicStatus(_ data: [String: Any]) -> [String: Any] {
        var copy = data
        for key in copy.keys where key.hasPrefix("ios") {
            copy[key] = nil
        }
        return copy
    }

    /// A sample line for the given personality, without touching any persisted anti-repeat state.
    @objc func previewMessage(_ call: CAPPluginCall) {
        let personality = call.getString("personality", "friendly")
        let routine = call.getString("workSchoolRoutine") ?? ""
        let pick = SleepMessageBank.pick(
            personality: personality,
            tier: call.getInt("tier", 0),
            displayName: call.getString("callName"),
            hasWorkTomorrow: !routine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            interests: call.getString("interests"),
            wakeTimeLabel: nil,
            recentKeys: [],
            aiPool: store.loadAiPool(personality)
        )
        call.resolve(["text": pick.text])
    }

    @objc func speakTest(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty else {
            call.reject("text is required")
            return
        }
        speak(text, volumePercent: Self.int(store.load()["volumePercent"], 85))
        call.resolve()
    }

    @objc func getHistory(_ call: CAPPluginCall) {
        call.resolve(["sessions": store.loadHistory()])
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

    // Exact alarms, full-screen intents and overlays are Android permissions with no iOS
    // equivalent. Reporting them as granted keeps the Sleep Mode screen free of warnings that
    // could never be resolved.
    @objc func checkExactAlarmPermission(_ call: CAPPluginCall) {
        call.resolve(["granted": true])
    }

    @objc func requestExactAlarmPermission(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func checkFullScreenIntentPermission(_ call: CAPPluginCall) {
        call.resolve(["granted": true])
    }

    @objc func requestFullScreenIntentPermission(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func checkOverlayPermission(_ call: CAPPluginCall) {
        call.resolve(["granted": true])
    }

    @objc func requestOverlayPermission(_ call: CAPPluginCall) {
        call.resolve()
    }

    /// Caches a freshly generated AI reminder pool; tiersJson is the {"tiers": [[...]...]} JSON the
    /// generateSleepReminders Cloud Function returned, stored as-is plus a generatedAt stamp.
    @objc func setAiMessages(_ call: CAPPluginCall) {
        guard let personality = call.getString("personality"), let tiersJson = call.getString("tiersJson") else {
            call.reject("personality and tiersJson are required")
            return
        }
        guard let raw = tiersJson.data(using: .utf8),
              var object = (try? JSONSerialization.jsonObject(with: raw)) as? [String: Any],
              object["tiers"] is [Any] else {
            call.reject("tiersJson must be valid JSON shaped {\"tiers\": [[...],[...],[...],[...]]}")
            return
        }
        object["generatedAt"] = Self.nowMillis()
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("Could not encode the AI pool")
            return
        }
        store.saveAiMessages(personality, json: json)
        call.resolve()
    }

    @objc func getAiMessagesInfo(_ call: CAPPluginCall) {
        let personality = call.getString("personality", "friendly")
        call.resolve(["generatedAt": store.loadAiGeneratedAt(personality)])
    }

    /// Caches the real-voice clips generated alongside the AI pool: one base64 WAV per tier (null
    /// where synthesis failed). A clip becomes the notification sound whenever that tier's first
    /// AI line is picked (iOS plays bundled or Library/Sounds files up to 30 s long).
    @objc func setAiAudioClips(_ call: CAPPluginCall) {
        guard let personality = call.getString("personality"), let clips = call.getArray("clips") else {
            call.reject("personality and clips are required")
            return
        }
        for (tier, item) in clips.enumerated() {
            guard let base64 = item as? String, !base64.isEmpty,
                  let wav = Data(base64Encoded: base64, options: [.ignoreUnknownCharacters]) else { continue }
            store.saveAiClip(personality, tier: tier, wav: wav)
        }
        call.resolve()
    }

    // MARK: - Scheduling

    /// Removes every pending Sleep Mode notification this plugin scheduled.
    private func clearSchedule(_ data: inout [String: Any]) {
        let ids = (data["iosScheduledIds"] as? [String]) ?? []
        if !ids.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: ids)
        }
        data["iosScheduledIds"] = [String]()
    }

    /// Schedules the next nights' reminders, none earlier than `from`; the first reminder uses
    /// `startTier`. Returns true when at least one reminder was scheduled.
    @discardableResult
    private func rebuildSchedule(_ data: inout [String: Any], from: Date, startTier: Int) -> Bool {
        clearSchedule(&data)
        guard Self.bool(data["enabled"], false) else { return false }

        let generation = (Self.int(data["iosGeneration"]) + 1) % 1_000_000
        data["iosGeneration"] = generation
        let intervalSeconds = TimeInterval(max(1, Self.int(data["intervalMin"], 30)) * 60)
        let now = Date()
        var recent = Self.recentKeys(data)
        var ids: [String] = []
        var cursor = from
        var tier = max(0, min(Self.tierCount - 1, startTier))

        for night in 0..<Self.nightsAhead {
            let bedtime = Self.isWithinSleepWindow(data, at: cursor) ? cursor : Self.nextBedtime(data, after: cursor)
            let wake = Self.wakeDate(data, after: bedtime)
            if night == 0 && (Self.int64(data["sessionStartMillis"]) ?? 0) == 0 {
                data["sessionStartMillis"] = Self.millis(bedtime)
            }

            var beatAt = bedtime
            var beat = 0
            while beatAt < wake && beat < Self.maxBeatsPerNight {
                let pick = pickMessage(data, tier: tier, wake: wake, recent: recent)
                recent.append(pick.key)
                let id = "\(Self.prefix)g\(generation):n\(night):b\(beat)"
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, beatAt.timeIntervalSince(now)), repeats: false)
                center.add(UNNotificationRequest(identifier: id, content: makeContent(data, pick: pick, tier: tier), trigger: trigger))
                ids.append(id)

                beatAt = beatAt.addingTimeInterval(intervalSeconds)
                beat += 1
                tier = min(Self.tierCount - 1, tier + 1)
            }
            tier = 0
            cursor = wake
        }

        data["iosScheduledIds"] = ids
        data["recentKeysCsv"] = recent.suffix(40).joined(separator: ",")
        return !ids.isEmpty
    }

    private func pickMessage(_ data: [String: Any], tier: Int, wake: Date, recent: [String]) -> SleepMessageBank.Pick {
        let personality = Self.string(data["personality"], "friendly")
        let personal = Self.string(data["mode"]) == "personal"
        let callName = personal ? Self.optionalString(data["callName"]) : nil
        let routine = personal ? (Self.optionalString(data["workSchoolRoutine"]) ?? "") : ""
        let interests = personal ? Self.optionalString(data["interests"]) : nil
        return SleepMessageBank.pick(
            personality: personality,
            tier: tier,
            displayName: callName,
            hasWorkTomorrow: !routine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            interests: interests,
            wakeTimeLabel: Self.timeLabel(wake),
            recentKeys: Set(recent),
            aiPool: store.loadAiPool(personality)
        )
    }

    private func makeContent(_ data: [String: Any], pick: SleepMessageBank.Pick, tier: Int) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = "Sleep Mode"
        content.body = pick.text
        content.categoryIdentifier = Self.categoryId
        content.threadIdentifier = "sleep-mode"
        content.interruptionLevel = .active
        content.userInfo = ["tier": tier]

        let personality = Self.string(data["personality"], "friendly")
        if pick.key == "\(personality):ai\(tier):0", let clip = store.aiClipFileName(personality, tier: tier) {
            content.sound = UNNotificationSound(named: UNNotificationSoundName(clip))
        } else {
            content.sound = .default
        }
        return content
    }

    /// On launch and whenever the app becomes active: closes out a finished night into the history
    /// and rebuilds the schedule so the seven-night horizon keeps rolling.
    private func refresh() {
        var data = store.load()
        guard Self.bool(data["enabled"], false) else { return }
        let now = Date()

        if let start = Self.date(data["sessionStartMillis"]) {
            let wake = Self.wakeDate(data, after: start)
            if now >= wake {
                store.appendHistory([
                    "bedtimeScheduledMillis": Self.millis(start),
                    "wakeScheduledMillis": Self.millis(wake),
                    "lastNagMillis": Self.int64(data["lastNagMillis"]) ?? 0,
                    "nagCount": Self.int(data["nagCount"])
                ])
                data["sessionStartMillis"] = Int64(0)
                data["nagCount"] = 0
                data["lastNagMillis"] = Int64(0)
                data["mutedUntilMillis"] = Int64(0)
                data["iosCountedIds"] = [String]()
            }
        }

        if let mutedUntil = Self.date(data["mutedUntilMillis"]), mutedUntil > now {
            rebuildSchedule(&data, from: mutedUntil, startTier: 1)
        } else {
            data["mutedUntilMillis"] = Int64(0)
            rebuildSchedule(&data, from: now.addingTimeInterval(1), startTier: 0)
        }
        store.save(data)
    }

    // MARK: - NotificationHandlerProtocol

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        var data = store.load()
        guard Self.bool(data["enabled"], false) else { return [] }
        if let mutedUntil = Self.date(data["mutedUntilMillis"]), mutedUntil > Date() {
            return []
        }
        recordNag(&data, identifier: notification.request.identifier)
        store.save(data)
        speak(notification.request.content.body, volumePercent: Self.int(data["volumePercent"], 85))
        return [.banner, .list]
    }

    public func didReceive(response: UNNotificationResponse) {
        var data = store.load()
        guard Self.bool(data["enabled"], false) else { return }
        recordNag(&data, identifier: response.notification.request.identifier)
        let now = Date()

        switch response.actionIdentifier {
        case Self.actionSnooze:
            let until = now.addingTimeInterval(TimeInterval(Self.snoozeMinutes * 60))
            data["mutedUntilMillis"] = Self.millis(until)
            let tier = Self.int(response.notification.request.content.userInfo["tier"])
            rebuildSchedule(&data, from: until, startTier: min(Self.tierCount - 1, tier + 1))
        case Self.actionStop:
            // Quiet until this night's wake time; the following nights stay scheduled.
            let wake = Self.sleepWindow(data, containing: now)?.wake ?? now
            data["mutedUntilMillis"] = Self.millis(wake)
            rebuildSchedule(&data, from: wake, startTier: 0)
        default:
            break // a tap just opens the app
        }
        store.save(data)
    }

    private func recordNag(_ data: inout [String: Any], identifier: String) {
        var counted = (data["iosCountedIds"] as? [String]) ?? []
        guard !counted.contains(identifier) else { return }
        counted.append(identifier)
        data["iosCountedIds"] = Array(counted.suffix(64))
        data["nagCount"] = Self.int(data["nagCount"]) + 1
        data["lastNagMillis"] = Self.nowMillis()
    }

    // MARK: - Speech

    private func speak(_ text: String, volumePercent: Int) {
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            _ = try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            _ = try? session.setActive(true, options: [])
            let utterance = AVSpeechUtterance(string: text)
            utterance.volume = Float(max(0, min(100, volumePercent))) / 100
            if let voice = AVSpeechSynthesisVoice(language: "en-US") {
                utterance.voice = voice
            }
            self.synthesizer.stopSpeaking(at: .immediate)
            self.synthesizer.speak(utterance)
        }
    }

    private func stopSpeaking() {
        DispatchQueue.main.async {
            self.synthesizer.stopSpeaking(at: .immediate)
        }
    }

    // MARK: - Time helpers (mirror SleepModeScheduler)

    private static func time(_ hour: Int, _ minute: Int, onDayOf day: Date) -> Date {
        let calendar = Calendar.current
        var components = calendar.dateComponents([.year, .month, .day], from: day)
        components.hour = hour
        components.minute = minute
        components.second = 0
        return calendar.date(from: components) ?? day
    }

    private static func addDays(_ days: Int, to date: Date) -> Date {
        return Calendar.current.date(byAdding: .day, value: days, to: date) ?? date
    }

    /// The bedtime-to-wake window that contains `moment`, if any.
    static func sleepWindow(_ data: [String: Any], containing moment: Date) -> (bed: Date, wake: Date)? {
        var bed = time(int(data["bedtimeHour"], 22), int(data["bedtimeMinute"], 30), onDayOf: moment)
        if bed > moment {
            bed = addDays(-1, to: bed)
        }
        let wake = wakeDate(data, after: bed)
        return moment >= bed && moment < wake ? (bed, wake) : nil
    }

    static func isWithinSleepWindow(_ data: [String: Any], at moment: Date) -> Bool {
        return sleepWindow(data, containing: moment) != nil
    }

    static func nextBedtime(_ data: [String: Any], after moment: Date) -> Date {
        var candidate = time(int(data["bedtimeHour"], 22), int(data["bedtimeMinute"], 30), onDayOf: moment)
        if candidate <= moment {
            candidate = addDays(1, to: candidate)
        }
        return candidate
    }

    static func wakeDate(_ data: [String: Any], after bedtime: Date) -> Date {
        var wake = time(int(data["wakeHour"], 7), int(data["wakeMinute"], 0), onDayOf: bedtime)
        if wake <= bedtime {
            wake = addDays(1, to: wake)
        }
        return wake
    }

    // MARK: - Value helpers

    private static func string(_ value: Any?, _ fallback: String = "") -> String {
        return value as? String ?? fallback
    }

    private static func optionalString(_ value: Any?) -> String? {
        guard let text = value as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func int(_ value: Any?, _ fallback: Int = 0) -> Int {
        return (value as? NSNumber)?.intValue ?? fallback
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

    private static func recentKeys(_ data: [String: Any]) -> [String] {
        return string(data["recentKeysCsv"]).split(separator: ",").map(String.init).filter { !$0.isEmpty }
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

/// Sleep Mode's single settings-plus-state record, its history and the cached AI pools, in
/// UserDefaults (JSON) and Library/Sounds (clips), with the SleepModeData.java field names.
final class SleepModeStore {
    private static let dataKey = "omnihub.sleepmode"
    private static let historyKey = "omnihub.sleepmode.history"
    private static let aiKeyPrefix = "omnihub.sleepmode.ai."
    private static let maxHistory = 90

    private let defaults = UserDefaults.standard
    private let lock = NSLock()

    /// A record with SleepModeData.java's defaults.
    static func fresh() -> [String: Any] {
        return [
            "enabled": false,
            "bedtimeHour": 22,
            "bedtimeMinute": 30,
            "wakeHour": 7,
            "wakeMinute": 0,
            "intervalMin": 30,
            "volumePercent": 85,
            "personality": "friendly",
            "mode": "normal",
            "callName": NSNull(),
            "workSchoolRoutine": NSNull(),
            "relationshipStatus": NSNull(),
            "interests": NSNull(),
            "customNotes": NSNull(),
            "sessionStartMillis": Int64(0),
            "nagCount": 0,
            "lastNagMillis": Int64(0),
            "recentKeysCsv": "",
            "mutedUntilMillis": Int64(0)
        ]
    }

    func load() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }
        var data = Self.fresh()
        if let raw = defaults.data(forKey: Self.dataKey),
           let saved = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
            for (key, value) in saved {
                data[key] = value
            }
        }
        return data
    }

    func save(_ data: [String: Any]) {
        lock.lock()
        defer { lock.unlock() }
        guard JSONSerialization.isValidJSONObject(data),
              let raw = try? JSONSerialization.data(withJSONObject: data) else { return }
        defaults.set(raw, forKey: Self.dataKey)
    }

    func loadHistory() -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return readHistoryUnlocked()
    }

    func appendHistory(_ session: [String: Any]) {
        lock.lock()
        defer { lock.unlock() }
        var history = readHistoryUnlocked()
        history.append(session)
        if history.count > Self.maxHistory {
            history.removeFirst(history.count - Self.maxHistory)
        }
        guard JSONSerialization.isValidJSONObject(history),
              let raw = try? JSONSerialization.data(withJSONObject: history) else { return }
        defaults.set(raw, forKey: Self.historyKey)
    }

    private func readHistoryUnlocked() -> [[String: Any]] {
        guard let raw = defaults.data(forKey: Self.historyKey),
              let parsed = try? JSONSerialization.jsonObject(with: raw) as? [[String: Any]] else { return [] }
        return parsed
    }

    // MARK: AI pools

    func saveAiMessages(_ personality: String, json: String) {
        defaults.set(json, forKey: Self.aiKeyPrefix + personality)
    }

    private func loadAiObject(_ personality: String) -> [String: Any]? {
        guard let json = defaults.string(forKey: Self.aiKeyPrefix + personality),
              let raw = json.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: raw)) as? [String: Any]
    }

    /// [tier][line], or nil when no pool is cached for this personality.
    func loadAiPool(_ personality: String) -> [[String]]? {
        guard let tiers = loadAiObject(personality)?["tiers"] as? [[String]], !tiers.isEmpty else { return nil }
        return tiers
    }

    func loadAiGeneratedAt(_ personality: String) -> Int64 {
        return (loadAiObject(personality)?["generatedAt"] as? NSNumber)?.int64Value ?? 0
    }

    // MARK: AI voice clips (Library/Sounds is where iOS looks for notification sounds)

    private static var soundsDirectory: URL? {
        guard let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else { return nil }
        return library.appendingPathComponent("Sounds", isDirectory: true)
    }

    private static func clipName(_ personality: String, tier: Int) -> String {
        return "omnihub-sleep-\(personality)-\(tier).wav"
    }

    func saveAiClip(_ personality: String, tier: Int, wav: Data) {
        guard let directory = Self.soundsDirectory else { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try wav.write(to: directory.appendingPathComponent(Self.clipName(personality, tier: tier)), options: [.atomic])
        } catch {
            // A failed write just means that tier keeps using the default sound.
        }
    }

    func aiClipFileName(_ personality: String, tier: Int) -> String? {
        guard let directory = Self.soundsDirectory else { return nil }
        let name = Self.clipName(personality, tier: tier)
        return FileManager.default.fileExists(atPath: directory.appendingPathComponent(name).path) ? name : nil
    }
}
