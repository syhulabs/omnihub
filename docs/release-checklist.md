# Release checklist: Google Play and App Store

Publishing is done by the owner only. Assistants prepare the code, the documents and the assets, and stop at
the lines marked **Owner**. Nothing here needs the release keystore, a store console or the Firebase console
from an assistant.

State on 17 November 2026: the owner tested build 174 on the phone in dark and light and approved it.
`versionCode` is now 175, the number for the next Play upload. The last build uploaded to Play is 168.
The owner chose to publish the iPhone version first.

## Already prepared

- The app: all tabs in one style, dark and light checked on 181 states, two whole-app bug reviews fixed.
- The release configuration compiles: `./gradlew bundleRelease` finishes without the keystore (it produces an
  unsigned bundle that cannot be uploaded; it only proves the release build is sound).
- Sign in with Apple, for iPhone only (the App Store requires it next to Google Sign-In). In the code, in
  `capacitor.config.ts` and in `ios/App/App/App.entitlements`. Never run on a device: see iOS step 3.
- Deleting an account made with Apple also revokes the Apple token, which Apple requires.
- Privacy policy (in the app, `docs/privacy-policy.md`, `docs/privacy-policy.html`), the website and the
  delete-account page mention Apple sign-in on iPhone.
- New Play screenshots of the current look: `docs/store-assets/phone-screenshots-2026-11/` (1236 x 2448, six
  dark and two light). The older set in `phone-screenshots/` shows a bottom bar the app no longer has.
  `01-home` and `07-home-light` were taken in a browser, so the phone card says "Web Preview": retake those two
  on the phone before uploading.
- The app icon is the owner's dark glass icon everywhere (Android, iPhone, splash screens, website). The
  Play listing icon to upload is `docs/store-assets/hi-res-icon-512-2026-11.png`; the older
  `hi-res-icon-512.png` is a different, outdated logo.
- Listing text: `docs/play-store-listing.md` (Play) and `docs/app-store-listing.md` (App Store: name, subtitle,
  keywords, description, App Privacy answers, review notes). Feature graphic: `docs/store-assets/feature-graphic.png`.

## Google Play

1. Done: the owner tested build 174 and approved it.
2. Done: `versionCode` is 175 on `main`.
3. **Owner**: `firebase deploy --only functions` (refunds failed AI generations, and removes a deleted
   user's cloud data).
4. **Owner**: build the signed bundle on the Mac, with `android/keystore.properties` and
   `android/app/release-keystore.jks` in place: `cd android && ./gradlew bundleRelease`. The file is
   `android/app/build/outputs/bundle/release/app-release.aab`.
5. **Owner**: Play Console, *Test and release*: create a release on the testing track first, upload the AAB,
   paste the release notes below, roll out. Promote to production after the testers confirm.
6. **Owner**: Play Console, *Store listing*: replace the app icon and the phone screenshots with the new ones.
7. **Owner**: Play Console, *App content*, check these still match the app:
   - Privacy policy: `https://omnihub.syhu.net/privacy-policy.html`
   - Data safety: data **is** collected, only if the user signs in, and only for app functionality and
     account management: name, email address, user ID, and the content of the synced tools (notes,
     checklists, expenses, budgets, subscriptions, debts, alarms, the encrypted Vault). Encrypted in
     transit, not shared, deletion can be requested. Delete-account URL:
     `https://omnihub.syhu.net/delete-account.html`. The privacy policy is the source of truth.
   - Ads: none. Category: Tools.

Release notes (under 500 characters):

```
• A cleaner look: the AI, Craft and Desk tabs now match Home and Hub.
• A smaller bottom bar, so more of each screen is visible.
• Light theme: text, icons and totals are easier to read on every screen.
• Fixes for Text Size, App Lock, Vault, backups, calculators, checklists, alarms and Sleep Mode.
```

## App Store (iPhone)

1. Done (17 Nov): the unsigned build for a generic iOS device succeeds on the Mac. One fix was needed, a
   duplicate `open url` handler in `AppDelegate.swift`.
2. Done (17 Nov): the Firebase iOS app exists; `GoogleService-Info.plist` is in `ios/App/App/` and its
   reversed client ID is in `Info.plist`.
3. **Owner**: switch on Sign in with Apple in two places, then test it on an iPhone:
   - Firebase console, *Authentication*, *Sign-in method*: enable **Apple**.
   - Xcode, *App* target, *Signing & Capabilities*: the *Sign in with Apple* capability should already be
     listed (it is in `App.entitlements`); with automatic signing Xcode registers it on the App ID.
   - On the phone: Desk, Profile: "Sign in with Apple" is the first row. Sign in, check that a note syncs,
     sign out, then test Delete My Account.
4. **Owner**: run the checks in `docs/ios-build.md`, section 4, on a real iPhone, in dark and light.
5. Screenshots: take them on a real iPhone, not in a browser (some features are hidden on iPhone). The
   iPhone simulator cannot run the app on an Apple-silicon Mac: Google ML Kit (the scanners) ships no
   simulator build for Apple silicon, so the app builds for Intel simulators only and iOS 27 simulators
   refuse it (found 17 Nov). App Store Connect wants 6.9-inch (1320 x 2868) or 6.5-inch screenshots.
   The owner's iPhone 16 Pro Max takes them at exactly 1320 x 2868 (6.9-inch), so its screenshots fit as is.
   The owner does not have a paid Apple Developer membership yet (17 Nov). Until they join:
   - The App Store, TestFlight and Sign in with Apple cannot work. Joining is the owner's step:
     developer.apple.com/programs/enroll (yearly fee; approval can take a day or more).
   - The app can still run on the owner's iPhone with Xcode's free "Personal Team", which does not allow
     the Sign in with Apple capability. For that test only, the owner removes it in Xcode (Signing &
     Capabilities, the x next to it) and must not commit the change; afterwards
     `git restore ios/App/App/App.entitlements ios/App/App.xcodeproj/project.pbxproj` puts it back.
     A Personal Team build stops opening after 7 days; run it from Xcode again.
6. **Owner**: archive and upload to TestFlight (`docs/ios-build.md`, section 7), then fill in App Store
   Connect (section 8): listing text, App Privacy labels, age rating, review notes, privacy policy URL.
7. **Owner**: submit for review.

## After both are live

- Add the App Store link to the website (`docs/index.html`) next to the Play link.
- Tell the assistants the released version numbers so `CLAUDE.md` and `AGENTS.md` stay right.
