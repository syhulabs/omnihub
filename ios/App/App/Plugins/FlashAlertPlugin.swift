import Foundation
import Capacitor

/// iOS counterpart of android/.../flashalert/FlashAlertPlugin.java.
///
/// Flash Alerts need to see other apps' notifications (a NotificationListenerService) and the
/// phone's call state, neither of which iOS exposes to apps. The feature is hidden on iOS
/// (src/tools/flashlight/Flashlight.tsx), so this plugin only ever reports it as off and refuses
/// to turn anything on.
@objc(FlashAlertPlugin)
public class FlashAlertPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FlashAlertPlugin"
    public let jsName = "FlashAlertPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNotificationEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCallEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAlarmEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationAccessSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestCallPermission", returnType: CAPPluginReturnPromise)
    ]

    private static let message = "Flash Alerts are only available in the Android app."

    private static var off: PluginCallResultData {
        return [
            "notificationEnabled": false,
            "callEnabled": false,
            "alarmEnabled": false,
            "notificationAccessGranted": false,
            "callPermissionGranted": false
        ]
    }

    @objc func getSettings(_ call: CAPPluginCall) {
        call.resolve(Self.off)
    }

    @objc func setNotificationEnabled(_ call: CAPPluginCall) {
        // "Clear All Data" turns every alert off and tolerates a rejection; turning one on is
        // not possible here, so both directions answer the same way.
        if call.getBool("enabled", false) {
            call.unavailable(Self.message)
        } else {
            call.resolve(Self.off)
        }
    }

    @objc func setCallEnabled(_ call: CAPPluginCall) {
        if call.getBool("enabled", false) {
            call.unavailable(Self.message)
        } else {
            call.resolve(Self.off)
        }
    }

    @objc func setAlarmEnabled(_ call: CAPPluginCall) {
        if call.getBool("enabled", false) {
            call.unavailable(Self.message)
        } else {
            call.resolve(Self.off)
        }
    }

    @objc func openNotificationAccessSettings(_ call: CAPPluginCall) {
        call.unavailable(Self.message)
    }

    @objc func requestCallPermission(_ call: CAPPluginCall) {
        call.resolve(Self.off)
    }
}
