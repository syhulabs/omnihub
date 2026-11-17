# Building Omni Hub for Android

## Requirements

- Node.js 18+ and npm
- [Android Studio](https://developer.android.com/studio) (Giraffe or newer) with Android SDK Platform 36 and a JDK (Android Studio bundles one)

## 1. Build the web app and sync Capacitor

From `omni-hub/`:

```
npm install
npm run android:sync
```

This runs `vite build` and copies the output into `android/app/src/main/assets/public`, then updates the native Capacitor config and plugin list. Run this command every time you change the web app and want to see it in the native app.

## 2. Open the project in Android Studio

```
npm run android:open
```

(or open the `omni-hub/android` folder directly in Android Studio). Let Gradle finish syncing on first open — it will download the Android Gradle Plugin and dependencies.

## 3. Try it on a device or emulator

In Android Studio: **Run ▸ Run 'app'**, pick a connected device or a virtual device (create one under **Device Manager** if needed), and it will build a debug APK and launch it.

## 4. Build a signed release AAB (for Google Play)

Google Play requires an **Android App Bundle (.aab)**, signed with your own upload key.

### a. Create a signing key (first time only)

In Android Studio: **Build ▸ Generate Signed App Bundle / APK…**

1. Choose **Android App Bundle**, click **Next**.
2. Under **Key store path**, click **Create new…**.
3. Fill in:
   - **Key store path**: choose a safe location *outside* the git repo (e.g. `~/keystores/omni-hub-release.jks`) — never commit this file.
   - **Password**: a strong password for the keystore.
   - **Alias**: e.g. `omnihub`, with its own password.
   - **Validity**: 25+ years.
   - **Certificate**: your name/organization details (used only to identify the key, not shown to users).
4. Click **OK**, then **Next**.

**Back up the keystore file and its passwords somewhere safe.** If you lose it, you can never update your app on the same Play Store listing again.

### b. Build the bundle

1. Select the **release** build variant.
2. Check **Signature Versions**: V1 and V2 (defaults are fine).
3. Click **Finish** (or **Create**).
4. Android Studio builds `android/app/release/app-release.aab` and shows a notification with a **locate** link when done.

### c. Command line alternative

Once a keystore exists and is referenced in `android/app/build.gradle` (a `signingConfigs { release { ... } }` block — Android Studio's wizard can add this for you via **"Remember passwords"**, or add it manually), you can build from the terminal instead:

```
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`.

## 5. Upload to Google Play

Create an app in [Google Play Console](https://play.google.com/console), then under **Release ▸ Production** (or a testing track first), upload the `.aab` file and follow the prompts.

---

# Google Play Store checklist

The current, ordered steps for a release are in `docs/release-checklist.md`. The list below is the
one-time store setup.

## App identity

- [x] Package name: `com.syhuinc.omnihub`
- [x] App name: **Omni Hub**
- [x] Version: `1.0` (versionCode: see `android/app/build.gradle`; it must go up with every upload)
- [x] Signed release AAB (see above) — keep the keystore safe for future updates

## Icons & graphics (generated already, in `android/app/src/main/res/`)

Google Play itself needs a few extra graphics uploaded separately in Play Console, at these exact sizes:

| Asset | Size | Notes |
|---|---|---|
| App icon (hi-res) | 512×512 px PNG | Store listing icon: `docs/store-assets/hi-res-icon-512-2026-11.png` |
| Feature graphic | 1024×500 px, PNG/JPEG, no alpha | Shown at the top of the store listing |
| Phone screenshots | min 2, up to 8 — 16:9 or 9:16, each side 320–3840 px (JPEG/24-bit PNG, no alpha) | Take these from a real device or emulator running the app (Home, Tools, a couple of tools in use, Profile) |
| (Optional) Tablet/other screenshots | same rules | Skip for a phone-only v1 |

Launcher icons (all densities, adaptive layers at full resolution) and splash screens are generated from the
owner's icon, `design/app-icon-dark.webp`, by `python3 scripts/gen-app-icons.py` (needs Pillow). Run it again if
the icon ever changes. Do not use `npx capacitor-assets generate` for this any more: it made the adaptive layers
at a third of the resolution Android asks for and put a 16.7% inset back into `mipmap-anydpi-v26/ic_launcher.xml`.

## Store listing text

- [ ] Short description (≤80 characters)
- [ ] Full description (≤4000 characters) — see `docs/play-store-listing.md` for a draft
- [ ] App category: **Tools**
- [ ] Contact email
- [ ] Privacy Policy URL — host `docs/privacy-policy.md` (or the HTML version) somewhere public and link it in Play Console's **App content ▸ Privacy Policy** section

## App content questionnaires (Play Console → App content)

- [ ] **Privacy Policy**: provide the hosted URL
- [ ] **Data safety form**: data is collected only if the user signs in (optional): name, email address, user ID and the content of the synced tools, for app functionality and account management; encrypted in transit; not shared; deletion available. Details in `docs/release-checklist.md` and the privacy policy
- [ ] **Ads**: declare "No ads"
- [ ] **Target audience & content rating**: fill out the content rating questionnaire (Omni Hub is a general-purpose utility app, no mature content)
- [ ] **Government apps / Financial features**: not applicable
- [ ] **News apps**: not applicable

## Before release

- [ ] Test the release build on a real device (not just an emulator)
- [ ] Confirm the app works with airplane mode / no network at all (it should — this is core to the app)
- [ ] Double-check `versionCode`/`versionName` are bumped for every future release
- [ ] Keep the release keystore and its passwords backed up outside of git
