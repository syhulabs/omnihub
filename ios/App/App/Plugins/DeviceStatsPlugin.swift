import Foundation
import UIKit
import Network
import Capacitor

/// iOS counterpart of android/.../devicestats/DeviceStatsPlugin.java, feeding the Phone Center.
///
/// Field names and shapes match the Android plugin (see src/device-stats/plugin.ts). Values iOS
/// does not expose to apps are reported the way the JS side already treats as "unknown":
/// battery temperature 0, Wi-Fi link speed 0, Wi-Fi signal bars -1, chipset empty, screen size 0.
/// The "androidVersion" key carries the iOS version; DeviceInfo.tsx labels it per platform.
@objc(DeviceStatsPlugin)
public class DeviceStatsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceStatsPlugin"
    public let jsName = "DeviceStatsPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStats", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkMediaPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestMediaPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStorageBreakdown", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openStorageSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openWifiPanel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSoundPanel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise)
    ]

    private let pathMonitor = NWPathMonitor()

    public override func load() {
        pathMonitor.start(queue: DispatchQueue(label: "com.syhuinc.omnihub.devicestats.path"))
        DispatchQueue.main.async {
            UIDevice.current.isBatteryMonitoringEnabled = true
        }
    }

    // MARK: - stats

    @objc func getStats(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let device = UIDevice.current
            device.isBatteryMonitoringEnabled = true
            let level = device.batteryLevel // -1 when unknown (simulator)
            let batteryPercent = level < 0 ? -1 : Int((level * 100).rounded())
            let isCharging = device.batteryState == .charging || device.batteryState == .full

            let storage = Self.storageBytes()
            let path = self.pathMonitor.currentPath
            let online = path.status == .satisfied
            let wifi = online && path.usesInterfaceType(.wifi)

            call.resolve([
                "deviceModel": Self.deviceModelName(),
                "manufacturer": "Apple",
                "batteryPercent": batteryPercent,
                "isCharging": isCharging,
                "batteryTempC": 0,
                "storageTotalBytes": storage.total,
                "storageFreeBytes": storage.free,
                "ramTotalBytes": Int64(ProcessInfo.processInfo.physicalMemory),
                "ramAvailBytes": Self.availableMemoryBytes(),
                "wifiConnected": wifi,
                "hasInternetConnection": online,
                "ipAddress": wifi ? Self.ipAddress(interface: "en0") : "",
                "wifiRxMbps": 0,
                "wifiTxMbps": 0,
                "wifiSignalBars": -1
            ])
        }
    }

    @objc func getDeviceInfo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let screen = self.bridge?.viewController?.view.window?.windowScene?.screen ?? UIScreen.main
            let pixels = screen.nativeBounds // portrait, in pixels
            let storage = Self.storageBytes()

            call.resolve([
                "deviceModel": Self.deviceModelName(),
                "manufacturer": "Apple",
                "androidVersion": UIDevice.current.systemVersion,
                "buildNumber": Self.sysctlString("kern.osversion"),
                "socManufacturer": "",
                "socModel": "",
                "screenWidthPx": Int(pixels.width),
                "screenHeightPx": Int(pixels.height),
                "refreshRateHz": screen.maximumFramesPerSecond,
                "screenSizeInches": 0,
                "ramTotalBytes": Int64(ProcessInfo.processInfo.physicalMemory),
                "storageTotalBytes": storage.total,
                "uptimeMillis": Int64(ProcessInfo.processInfo.systemUptime * 1000)
            ])
        }
    }

    // MARK: - media / settings (Android-only features; the screens hide them on iOS)

    @objc func checkMediaPermission(_ call: CAPPluginCall) {
        // There is no media index to read on iOS, so the audio breakdown never applies.
        call.resolve(["granted": false])
    }

    @objc func requestMediaPermission(_ call: CAPPluginCall) {
        call.resolve(["granted": false])
    }

    @objc func getStorageBreakdown(_ call: CAPPluginCall) {
        call.resolve(["audioBytes": 0, "audioCount": 0])
    }

    @objc func openStorageSettings(_ call: CAPPluginCall) {
        call.unavailable("iOS only lets an app open its own Settings page.")
    }

    @objc func openWifiPanel(_ call: CAPPluginCall) {
        call.unavailable("iOS only lets an app open its own Settings page.")
    }

    @objc func openSoundPanel(_ call: CAPPluginCall) {
        call.unavailable("iOS only lets an app open its own Settings page.")
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Settings URL unavailable")
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("Could not open Settings")
                }
            }
        }
    }

    // MARK: - helpers

    private static func storageBytes() -> (total: Int64, free: Int64) {
        let url = URL(fileURLWithPath: NSHomeDirectory())
        let keys: Set<URLResourceKey> = [.volumeTotalCapacityKey, .volumeAvailableCapacityForImportantUsageKey]
        guard let values = try? url.resourceValues(forKeys: keys) else { return (0, 0) }
        let total = Int64(values.volumeTotalCapacity ?? 0)
        let free = values.volumeAvailableCapacityForImportantUsage ?? 0
        return (total, free)
    }

    /// Free plus inactive pages, the closest iOS equivalent of ActivityManager.MemoryInfo.availMem.
    private static func availableMemoryBytes() -> Int64 {
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &stats) { pointer -> kern_return_t in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { intPointer in
                host_statistics64(mach_host_self(), HOST_VM_INFO64, intPointer, &count)
            }
        }
        guard result == KERN_SUCCESS else { return 0 }
        let pageSize = Int64(vm_kernel_page_size)
        return (Int64(stats.free_count) + Int64(stats.inactive_count)) * pageSize
    }

    private static func sysctlString(_ name: String) -> String {
        var size = 0
        guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 0 else { return "" }
        var buffer = [CChar](repeating: 0, count: size)
        guard sysctlbyname(name, &buffer, &size, nil, 0) == 0 else { return "" }
        return buffer.withUnsafeBufferPointer { pointer in
            guard let base = pointer.baseAddress else { return "" }
            return String(cString: base)
        }
    }

    /// The hardware identifier ("iPhone15,2"), or the simulated one when running in a simulator.
    private static func hardwareIdentifier() -> String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"], !simulated.isEmpty {
            return simulated
        }
        return sysctlString("hw.machine")
    }

    /// Marketing name for recent iPhones; falls back to the raw identifier, which is still
    /// accurate, just less friendly.
    private static func deviceModelName() -> String {
        let id = hardwareIdentifier()
        if let name = marketingNames[id] { return name }
        return id.isEmpty ? UIDevice.current.model : id
    }

    private static let marketingNames: [String: String] = [
        "iPhone12,1": "iPhone 11", "iPhone12,3": "iPhone 11 Pro", "iPhone12,5": "iPhone 11 Pro Max",
        "iPhone12,8": "iPhone SE (2nd generation)",
        "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12", "iPhone13,3": "iPhone 12 Pro",
        "iPhone13,4": "iPhone 12 Pro Max",
        "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13", "iPhone14,2": "iPhone 13 Pro",
        "iPhone14,3": "iPhone 13 Pro Max", "iPhone14,6": "iPhone SE (3rd generation)",
        "iPhone14,7": "iPhone 14", "iPhone14,8": "iPhone 14 Plus", "iPhone15,2": "iPhone 14 Pro",
        "iPhone15,3": "iPhone 14 Pro Max",
        "iPhone15,4": "iPhone 15", "iPhone15,5": "iPhone 15 Plus", "iPhone16,1": "iPhone 15 Pro",
        "iPhone16,2": "iPhone 15 Pro Max",
        "iPhone17,3": "iPhone 16", "iPhone17,4": "iPhone 16 Plus", "iPhone17,1": "iPhone 16 Pro",
        "iPhone17,2": "iPhone 16 Pro Max", "iPhone17,5": "iPhone 16e"
    ]

    /// IPv4 address of the given interface (en0 is Wi-Fi on every iPhone), or "" if none.
    private static func ipAddress(interface name: String) -> String {
        var address = ""
        var ifaddrPointer: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddrPointer) == 0, let first = ifaddrPointer else { return "" }
        defer { freeifaddrs(ifaddrPointer) }

        var pointer: UnsafeMutablePointer<ifaddrs>? = first
        while let current = pointer {
            pointer = current.pointee.ifa_next
            // ifa_addr is NULL for some interfaces; reading through it would crash.
            guard let socketAddress = current.pointee.ifa_addr else { continue }
            let flags = Int32(current.pointee.ifa_flags)
            guard (flags & (IFF_UP | IFF_RUNNING)) == (IFF_UP | IFF_RUNNING),
                  socketAddress.pointee.sa_family == UInt8(AF_INET),
                  String(cString: current.pointee.ifa_name) == name else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let length = socklen_t(socketAddress.pointee.sa_len)
            if getnameinfo(socketAddress, length, &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                address = String(cString: host)
                break
            }
        }
        return address
    }
}
