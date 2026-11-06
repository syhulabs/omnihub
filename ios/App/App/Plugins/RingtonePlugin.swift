import Foundation
import Capacitor

/// iOS counterpart of android/.../ringtone/RingtonePlugin.java.
///
/// iOS has no API for an app to change the phone's ringtone, so the Voice Changer hides its
/// "Set as Ringtone" row on iOS (src/tools/voice-changer/screens/ShareScreen.tsx) and this plugin
/// only exists so the JS side never hits a missing-plugin error.
@objc(RingtonePlugin)
public class RingtonePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RingtonePlugin"
    public let jsName = "RingtonePlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkWriteSettingsPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestWriteSettingsPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAsRingtone", returnType: CAPPluginReturnPromise)
    ]

    @objc func checkWriteSettingsPermission(_ call: CAPPluginCall) {
        call.resolve(["granted": false])
    }

    @objc func requestWriteSettingsPermission(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func setAsRingtone(_ call: CAPPluginCall) {
        call.unavailable("Setting a ringtone is only available in the Android app.")
    }
}
