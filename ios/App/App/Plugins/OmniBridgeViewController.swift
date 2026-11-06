import UIKit
import Capacitor

/// The app's bridge controller. Registers Omni Hub's own plugins (the iOS counterparts of the
/// Android ones under android/app/src/main/java/com/syhuinc/omnihub/) and wires local
/// notification handling. Referenced from Main.storyboard and SceneDelegate.
class OmniBridgeViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        let alarm = AlarmPlugin()
        let sleep = SleepModePlugin()

        bridge?.registerPluginInstance(alarm)
        bridge?.registerPluginInstance(sleep)
        bridge?.registerPluginInstance(FlashAlertPlugin())
        bridge?.registerPluginInstance(DeviceStatsPlugin())
        bridge?.registerPluginInstance(RingtonePlugin())
        bridge?.registerPluginInstance(KeepAwakePlugin())
        bridge?.registerPluginInstance(BiometricPlugin())

        let hub = LocalNotificationHub.shared
        hub.alarmHandler = alarm
        hub.sleepHandler = sleep
        hub.registerCategories()
        bridge?.notificationRouter.localNotificationHandler = hub
    }
}
