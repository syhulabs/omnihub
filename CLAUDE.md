# Omni Hub — working notes for Claude

Offline all-in-one utility app for Android (shipping) and iOS (project ready, not yet built on a Mac).
Vite + React + TypeScript, wrapped with Capacitor.
Package `com.syhuinc.omnihub`, versionName 1.0, last shipped versionCode 168. Work directly on `main`.
The owner tests on a Motorola Edge 60 Fusion and reviews every change visually, in dark and light theme.

## How the owner works (standing instructions)

- **Reference pictures are the spec.** When the owner sends a mockup, match it exactly: same font, size,
  position, spacing, colors. "Close" is not accepted. If you want to change or reinterpret anything in a
  reference, ask first. Never swap, crop or redraw an image the owner supplied.
- **Check what a picture is before acting on it.** A screenshot of an existing screen is not a new mockup
  for a different screen. Confirm which tab/screen a request is about.
- **Measure, don't eyeball.** The phone's viewport is **436 CSS px wide** (1220 device px, DPR ≈ 2.8).
  Screenshot the dev build at that width (Playwright, Chromium at `/opt/pw-browsers/chromium`,
  `deviceScaleFactor = refWidth / 436`, `--safe-top` ≈ 45px), put it side by side with the reference,
  and measure positions/colors until they land within a few px. The phone renders Roboto; install it
  locally for screenshots or sizes will be off.
- Every screen must work in **both dark and light theme**. Background art usually comes as a dark and a
  light variant; pick with `useIsLightTheme()` (`src/theme/useTheme.ts`).
- The owner dislikes big gaps and "flashy for the sake of it"; prefers polished, glossy, punchy, but app-like.
- **No buttons that do nothing.** Coming-soon screens (SYXDI AI, Crafting Station) have no clickable controls.
- The bottom nav is shared by every tab. Don't restyle it per tab.
- Keep unfinished work out of commits that ship. Commit only the files for the change at hand.
- Language setting: English only for now; the Language row stays static.

## Art department (GPT via Codex CLI)

When you need a reference image, concept art, icon, sprite or UI mockup, do not draw it yourself. Run:

```
codex exec -C "$(pwd)" -s workspace-write --skip-git-repo-check \
  "Use the image generation tool to create <detailed brief>, save it as ./assets/ref/<name>.png"
```

Then open the saved file, check it against the brief, and re-request with corrections if it is wrong.
Never overwrite existing files. Follow the style rules in `./STYLE.md` for every brief.
(As of Nov 11 the `codex` CLI is not installed in the cloud session and `STYLE.md` and `assets/ref/` do not
exist yet: say so rather than drawing a substitute.)

## Build & ship an APK (the owner's established routine)

1. Bump `versionCode` in `android/app/build.gradle`.
2. `npm run build` then `npx cap sync android`.
3. Temporarily add `ndk { abiFilters 'arm64-v8a' }` to `defaultConfig` (keeps the APK small).
4. From `android/`: `./gradlew assembleRelease` (needs the signing files below).
5. **Revert the `ndk` line — never commit it.** Check `git status` shows only intended files.
6. Commit, push to `main`.
7. Deliver the APK split into 20 MB parts (`split -b 20M -d`) plus its `shasum -a 256`, and always include
   Mac Terminal reassembly steps: `cat omnihub.apk.0* > omnihub.apk` then `shasum -a 256 omnihub.apk`.

Release signing reads `android/keystore.properties` and `android/app/release-keystore.jks`. Both are
git-ignored on purpose and are **not in the repo**; the owner keeps them privately. Never commit them.

## Where things are

- Tabs: Home `src/screens/Home`, Hub `src/screens/Tools`, SYXDI AI `src/screens/SyxdiAi`,
  Craft `src/screens/Craft`, Desk `src/screens/Profile` (route `/profile`).
- Tools registry `src/tools/registry.ts`; icons `src/components/Icon.tsx`; theme tokens `src/theme/theme.css`.
- Custom native plugins in `android/app/src/main/java/com/syhuinc/omnihub/<feature>/`, registered in
  `MainActivity.java` before `super.onCreate()`. The cloud session has no Android SDK, so native Java
  can't be compiled there: keep it small and conservative, and say so when it ships untested.
- Reference mockups: `design/` (see `design/README.md`).
- iOS: `ios/` (Capacitor + CocoaPods, iPhone only). The seven plugins have Swift counterparts in
  `ios/App/App/Plugins/`, registered in `OmniBridgeViewController.capacitorDidLoad()`. The message bank
  is generated from the Java one (`scripts/gen-sleep-message-bank.py`). Android-only features are hidden
  on iOS with `isIOS` from `src/platform.ts`, never left as dead controls. The cloud session has no Xcode
  either: Swift ships without a real build, say so. It can be type-checked on Linux (download the Swift
  toolchain from swift.org and compile the plugins against stand-in declarations of the Apple/Capacitor
  APIs). Setup, limitations and the App Store checklist: `docs/ios-build.md`.
- Keep `@capacitor/core`, `android`, `ios` and `cli` on the same version; `npx cap sync` warns when they differ.
- Text Size is a page `zoom` on `<html>`: size full-height things in `%`, not `vh` (vh ignores zoom).

## Open work and plans

See `design/README.md` → "Planned features and open work".
