# Building Omni Hub for iOS

The iOS project lives in `ios/` (Capacitor, CocoaPods). It was written in the cloud, where there is no
Xcode, so **the first build on the Mac is the first real compile of the Swift code** in
`ios/App/App/Plugins/`. That code has been type-checked with the Swift compiler on Linux against
stand-ins for the Apple and Capacitor APIs (zero errors), which catches mistakes in the plugins' own
logic but not a wrong assumption about an Apple API. Expect at most a few compiler complaints.

Bundle ID `com.syhuinc.omnihub`, iPhone only, portrait only, iOS 15.0 or newer.

## 1. One-time Mac setup

1. Install Xcode 16 or newer from the App Store, open it once and accept the licence, then install
   the iOS platform when it asks.
2. Install CocoaPods: `brew install cocoapods` (Homebrew), or `sudo gem install cocoapods`.
   CocoaPods is needed because the ML Kit scanners (QR, barcode, number scanner, text recognition)
   only ship for iOS as pods.
3. In the repo: `npm install`.
4. Join the Apple Developer Program (developer.apple.com, 99 USD/year) with the Apple ID you will
   publish under. In Xcode, Settings → Accounts → add that Apple ID.

## 2. Firebase for iOS (needed before the first run)

1. Firebase console → project *Omni Hub* → Project settings → *Add app* → iOS.
   Bundle ID `com.syhuinc.omnihub`, nickname "Omni Hub iOS". Skip the SDK steps (Capacitor does them).
2. Download **GoogleService-Info.plist** and put it at `ios/App/App/GoogleService-Info.plist`.
   The Xcode project already lists this file, so the build fails with "Build input file cannot be
   found" until it is there. Commit it (the Android `google-services.json` is committed the same way).
3. Open that plist, copy the value of `REVERSED_CLIENT_ID` (looks like
   `com.googleusercontent.apps.123456-abc…`) and paste it over the placeholder
   `com.googleusercontent.apps.REPLACE-WITH-REVERSED-CLIENT-ID` in `ios/App/App/Info.plist`
   (under `CFBundleURLTypes`). This is what brings the user back into the app after Google Sign-In.
4. Firebase console → Authentication → Sign-in method: Google is already on; nothing to change.
   Firestore rules and the Cloud Function are shared with Android, nothing to deploy for iOS.

## 3. Build and run

```bash
npm run ios:sync      # builds the web app and runs `cap sync ios`, which runs `pod install`
npm run ios:open      # opens ios/App/App.xcworkspace in Xcode (always the .xcworkspace, not .xcodeproj)
```

In Xcode:

1. Select the *App* target → *Signing & Capabilities* → tick *Automatically manage signing* and pick
   your Team. Xcode registers the bundle ID and creates the provisioning profile.
2. The *Time Sensitive Notifications* capability comes from `ios/App/App/App.entitlements`. If
   signing complains about it, add the capability with the *+ Capability* button once; Xcode then
   enables it on the App ID.
3. Plug in an iPhone (or pick a simulator), choose it as the run destination and press Run.
   First run on a device: on the phone, Settings → General → VPN & Device Management → trust the
   developer certificate.

After every web change: `npm run ios:sync` (or `npx cap copy ios` for web-only changes), then Run again
in Xcode. After editing the Android `MessageBank.java`, regenerate the Swift copy with
`python3 scripts/gen-sleep-message-bank.py`. After changing `assets/icon.png` or `assets/splash.png`,
rerun `npx capacitor-assets generate --ios --iconBackgroundColor '#080b12' --iconBackgroundColorDark '#080b12' --splashBackgroundColor '#080b12' --splashBackgroundColorDark '#080b12'`.

## 4. What to test on the phone

Everything in both themes, as usual, plus the iOS-specific paths:

- Google Sign-In round trip (needs step 2.3), then cloud sync of notes/alarms with the Android phone.
- Vault: enable biometric unlock → Face ID prompt → unlock. App Lock with Face ID at cold start.
- Alarm: one-shot and daily alarms ring as time-sensitive notifications with the ringtone; *Snooze*
  and *Stop* on the notification; backup rings arrive if the first one is ignored.
- Sleep Mode: turn on with bedtime a few minutes away; the reminder arrives, and is spoken aloud if
  Omni Hub is in the foreground; *Snooze 30 min* and *Stop for tonight* on the notification.
- QR scanner, barcode scanner, number scanner, text recognition (camera permission prompt).
- Voice Changer record → effects → share (microphone permission prompt). The *Set as Ringtone* row
  is intentionally absent on iOS.
- Compass and Level (motion permission prompt, location prompt for coordinates).
- Phone Center: battery, storage, RAM, Wi-Fi state. The Wi-Fi/Sound quick actions and storage
  breakdown are intentionally absent on iOS; *More* opens the app's Settings page.
- Flashlight on/off/strobe. Flash Alerts are intentionally absent on iOS.

## 5. How iOS differs from Android (by design, not bugs)

iOS does not let an app run its own code in the background on a schedule, read other apps'
notifications, see call state, change the ringtone, or open system panels other than its own
Settings page. The plugins under `ios/App/App/Plugins/` therefore work like this:

| Feature | Android | iOS |
| --- | --- | --- |
| Alarm | Full-screen ringing activity, any sound, rings until dismissed | Time-sensitive local notification with the device ringtone (iOS caps it at 30 s). Sound picker and custom audio hidden. |
| Backup rings | Scheduled when the main alarm fires | Scheduled ahead for the next ring; re-armed when the user acts on an alarm notification or opens the app |
| Sleep Mode | Nags every interval while the screen is on, spoken aloud | Bedtime notification plus up to three follow-ups per night, seven nights scheduled ahead; spoken aloud only while Omni Hub is open. Sleep Insights records only nights the app learned about. |
| Flash Alerts | Notification/call/alarm blinking | Hidden |
| Set as Ringtone | Yes | Hidden |
| Phone Center | Wi-Fi/Sound panels, audio storage breakdown | Hidden; "More" opens the app's Settings |
| Biometrics | Fingerprint/face via BiometricPrompt, Keystore-wrapped secret | Face ID/Touch ID via LocalAuthentication, Keychain-stored secret |

## 6. Versioning

`MARKETING_VERSION` (1.0) and `CURRENT_PROJECT_VERSION` (build number, 1) live in
`ios/App/App.xcodeproj/project.pbxproj`; change them in Xcode (*App* target → *General*). Every upload
to App Store Connect needs a higher build number for the same version. The Android `versionCode`
is separate.

## 7. Upload to TestFlight

1. Set the run destination to *Any iOS Device (arm64)*.
2. Product → Archive. When the Organizer opens: *Distribute App* → *App Store Connect* → *Upload*,
   keep the defaults (automatic signing, include symbols).
3. In App Store Connect (appstoreconnect.apple.com) → *Apps* → *+* → New App: iOS, name "Omni Hub",
   primary language English, bundle ID `com.syhuinc.omnihub`, SKU `omnihub`. Do this before the
   first upload finishes processing.
4. *TestFlight* tab → the build appears after processing (10 to 30 minutes). Answer the export
   compliance question once: the app uses only standard encryption (HTTPS and the encryption built
   into iOS). `ITSAppUsesNonExemptEncryption` is already `false` in `Info.plist`, so later builds skip
   the question.
5. Add yourself as an internal tester, install TestFlight on the phone, and install the build.

## 8. App Store review checklist

Blocking before submission:

- **Sign in with Apple is required.** App Store Review Guideline 4.8: an app offering a third-party
  login (Google) must also offer Sign in with Apple. Omni Hub only has Google today, so the review
  will reject it until Apple sign-in is added (Firebase supports the `apple.com` provider and
  `@capacitor-firebase/authentication` implements it natively on iOS; the Firebase project needs the
  Apple provider enabled and the app the *Sign in with Apple* capability). TestFlight does not check this.
- Account deletion is available in the app (Desk → Delete My Account). Keep it; Apple requires it.
- Privacy policy URL: `https://omnihub.syhu.net/privacy-policy.html`. Support URL: the website.
- The in-app privacy policy page (`src/screens/PrivacyPolicy`) still describes Android permissions
  (notification access, "Display over other apps"). Reword it per platform, or point it at the website.

Listing (reuse `docs/play-store-listing.md` for the copy):

- Screenshots: 6.9" iPhone (1320 × 2868) are required; 6.5" (1284 × 2778) optional. iPhone only, so
  no iPad screenshots. Take them from the device or simulator in both themes.
- App Privacy (nutrition labels): data collected and linked to the user, not used for tracking:
  Email Address, User ID, Other User Content (synced notes, alarms, settings), all for App
  Functionality. `ios/App/App/PrivacyInfo.xcprivacy` says the same.
- Age rating questionnaire: no objectionable content; Sleep Mode's "savage" lines are mild humour.
- Review notes: the app works fully offline without an account; Google Sign-In is only for sync.
  Explain what Sleep Mode's notifications do and that alarms are local notifications.
- Category: Utilities. Price: free.

## 9. Files that matter

- `ios/App/Podfile`: Capacitor plugins plus `CapacitorFirebaseAuthentication/Google` for Google Sign-In.
- `ios/App/App/Info.plist`: display name, permission strings (camera, microphone, Face ID, location,
  motion), Google URL scheme, portrait-only, export compliance flag.
- `ios/App/App/App.entitlements`: Time Sensitive Notifications.
- `ios/App/App/PrivacyInfo.xcprivacy`: Apple privacy manifest (UserDefaults, boot time, disk space APIs).
- `ios/App/App/Plugins/`: the seven plugins, the bridge controller that registers them, the
  notification hub, and the generated message bank.
- `ios/App/App/Assets.xcassets`: icon and splash generated from `assets/` by `@capacitor/assets`.
- Not in git (see `ios/.gitignore`): `Pods/`, `App/App/public` (the web build), `capacitor.config.json`,
  `config.xml`. They are all produced by `npm run ios:sync`.
