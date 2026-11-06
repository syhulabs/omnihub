import Foundation
import Capacitor
import LocalAuthentication
import Security

/// iOS counterpart of android/.../biometric/BiometricPlugin.java: Face ID / Touch ID through
/// LocalAuthentication, plus a small secret store for the Vault.
///
/// The Vault's key bytes are kept in the Keychain (this device only, readable while unlocked)
/// and are only handed back to JS after the biometric prompt succeeds. As on Android, the gate
/// is this plugin never releasing the secret without a successful prompt, rather than a
/// biometry-bound Keychain item, so Face ID and Touch ID behave identically and a changed
/// enrolment doesn't silently invalidate the Vault.
@objc(BiometricPlugin)
public class BiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricPlugin"
    public let jsName = "BiometricPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storeSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "retrieveSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSecret", returnType: CAPPluginReturnPromise)
    ]

    private static let keychainService = "com.syhuinc.omnihub.biometric"
    private static let keychainAccount = "vault_secret"

    // MARK: - check

    @objc func check(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)

        var reason = ""
        if !available {
            let code = error.flatMap { LAError.Code(rawValue: $0.code) }
            switch code {
            case .biometryNotEnrolled?:
                reason = "none_enrolled"
            case .biometryNotAvailable?:
                reason = context.biometryType == LABiometryType.none ? "no_hardware" : "unavailable"
            default:
                reason = "unavailable"
            }
        }

        call.resolve([
            "available": available,
            "reason": reason,
            "type": Self.typeName(context.biometryType)
        ])
    }

    private static func typeName(_ type: LABiometryType) -> String {
        switch type {
        case .faceID:
            return "face"
        case .touchID:
            return "fingerprint"
        case LABiometryType.none:
            return "none"
        default:
            return "unknown"
        }
    }

    // MARK: - authenticate

    @objc func authenticate(_ call: CAPPluginCall) {
        evaluate(call) {
            call.resolve()
        }
    }

    /// Shows the system Face ID / Touch ID prompt and runs `onSuccess` on the main queue when it
    /// passes; rejects the call with the JS-side error codes otherwise.
    private func evaluate(_ call: CAPPluginCall, onSuccess: @escaping () -> Void) {
        let context = LAContext()
        if let cancel = call.getString("negativeButtonText"), !cancel.isEmpty {
            context.localizedCancelTitle = cancel
        }
        // No passcode fallback: the Vault has its own PIN path in JS.
        context.localizedFallbackTitle = ""

        let title = call.getString("title", "Unlock")
        let subtitle = call.getString("subtitle") ?? ""
        let reason = subtitle.isEmpty ? title : subtitle

        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            let code = error.flatMap { LAError.Code(rawValue: $0.code) }
            call.reject(error?.localizedDescription ?? "Biometrics unavailable", code == .biometryLockout ? "lockout" : "unavailable")
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, evalError in
            DispatchQueue.main.async {
                if success {
                    onSuccess()
                    return
                }
                let nsError = evalError as NSError?
                let code = nsError.flatMap { LAError.Code(rawValue: $0.code) }
                call.reject(nsError?.localizedDescription ?? "Authentication failed", Self.errorCode(code))
            }
        }
    }

    private static func errorCode(_ code: LAError.Code?) -> String {
        switch code {
        case .userCancel?, .appCancel?, .systemCancel?, .userFallback?:
            return "cancelled"
        case .biometryLockout?:
            return "lockout"
        case .authenticationFailed?:
            return "failed"
        default:
            return "unavailable"
        }
    }

    // MARK: - secret store

    @objc func storeSecret(_ call: CAPPluginCall) {
        guard let secret = call.getString("secret"), !secret.isEmpty, let data = Data(base64Encoded: secret) else {
            call.reject("Missing secret", "invalid_argument")
            return
        }
        let status = Self.keychainWrite(data)
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Could not store secret (Keychain status \(status))", "store_failed")
        }
    }

    @objc func retrieveSecret(_ call: CAPPluginCall) {
        guard let data = Self.keychainRead() else {
            call.reject("No secret stored", "no_secret")
            return
        }
        evaluate(call) {
            call.resolve(["secret": data.base64EncodedString()])
        }
    }

    @objc func clearSecret(_ call: CAPPluginCall) {
        SecItemDelete(Self.baseQuery as CFDictionary)
        call.resolve()
    }

    private static var baseQuery: [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]
    }

    private static func keychainWrite(_ data: Data) -> OSStatus {
        SecItemDelete(baseQuery as CFDictionary)
        var query = baseQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        return SecItemAdd(query as CFDictionary, nil)
    }

    private static func keychainRead() -> Data? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }
}
