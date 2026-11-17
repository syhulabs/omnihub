# Omni Hub: briefing for ChatGPT / Codex

You are joining a project that is already far along. Read this file, then `CLAUDE.md` (the owner's standing
rules, they apply to you exactly as written), then `design/README.md` (mockups and open work).

## What this is

Omni Hub is an offline all-in-one utility app by SYHU Labs: about 26 working tools (calculators, notes,
checklist, alarm, Sleep Mode, Vault, scanners, compass, expense and budget tools and more) behind five tabs:
Home, Hub, SYXDI AI, Craft, Desk. Vite + React 19 + TypeScript, wrapped with Capacitor 8.5.2.

- Android: shipping. Package `com.syhuinc.omnihub`, in Google Play internal testing; test builds are at versionCode 174.
- iOS: project in `ios/` (CocoaPods, iPhone only), written without Xcode and never built on a Mac yet.
- Website: `docs/` is served by GitHub Pages at https://omnihub.syhu.net (landing page, privacy policy,
  delete-account page).
- Cloud: Firebase Auth (Google; Apple on iPhone), Firestore sync, one Cloud Function in `functions/` for Sleep Mode AI.

## Who else works here

The owner (SYHU) decides everything and reviews every change on a Motorola Edge 60 Fusion, in dark and light
theme. Claude also works on this repository, from a cloud session, and pushes to `main`. So:

- Run `git pull origin main` before you start and again before you push. Never force-push, never rewrite history.
- Keep commits small and complete: one change, only its files, a message that says what and why.
- If a file you want to change was changed on `main` since you read it, re-read it first. Do not revert work
  you did not write; ask the owner.
- Do not redo finished work. `git log` and the lists below say what is done.

## Publishing stays with the owner

You prepare; the owner publishes. Do not:

- create, open, copy or ask for the release keystore (`android/keystore.properties`,
  `android/app/release-keystore.jks`) or its passwords;
- build a signed release AAB or APK (debug APKs for testing are fine);
- upload anything to Google Play Console, App Store Connect or TestFlight;
- archive or distribute from Xcode, or change signing teams, certificates or provisioning profiles;
- run `firebase deploy` or change anything in the Firebase console;
- edit store listings, pricing or account settings anywhere.

If a task needs one of these, stop and tell the owner exactly what to do. The steps are in
`docs/release-checklist.md`.

## State on 17 November 2026

Since 11 November: the AI, Craft and Desk tabs were rebuilt in the plain Home and Hub style (the owner
rejected the full-screen illustrated versions; see `design/README.md`), the bottom nav was lowered to about
72 px, and Sign in with Apple was added for iPhone (`src/cloud/AuthContext.tsx`, hidden on Android with
`isIOS`; never run on a device yet).

## State on 11 November 2026

Done and on `main`:

- All five tabs and the Settings screen, built to the owner's mockups in `design/`.
- The bottom nav, drawn to `design/bottom-nav-reference-v2.png` (compressed vertically at the owner's request).
- App Lock, Vault (PIN, biometrics, files), backup export/import, cloud sync.
- Two whole-app bug reviews. The second (11 Nov, four commits) fixed about 90 defects: Text Size hiding the nav,
  App Lock and Vault not re-locking, backup and wipe problems, calculator and unit maths, checklist reordering,
  alarm, Sleep Mode, compass, light-theme contrast, privacy policy wording.
- The iOS project: Swift counterparts of the seven native plugins in `ios/App/App/Plugins/`, Android-only
  features hidden on iOS, and `docs/ios-build.md`.

Waiting on the owner (do not do these yourself unless asked):

- `firebase deploy --only functions` and Firestore rules.
- A signed release build (the keystore is not in the repo, on purpose).
- The first iOS build in Xcode, the Firebase iOS config file, and switching on Sign in with Apple in Firebase
  and the Apple Developer account (the code is in; see `docs/release-checklist.md`).
- The product decisions listed in `design/README.md` under "Second whole-app review (Nov 11)".

## Rules that are easy to break

These are in `CLAUDE.md` in full. The ones that have caused rework:

- A mockup from the owner is the spec: same font, size, position, spacing and colours, measured at 436 CSS px
  wide, not eyeballed. Ask before reinterpreting anything. Never crop, swap or redraw a supplied image.
- Every screen must work in dark and light theme. Use the tokens in `src/theme/theme.css`; a hard-coded colour
  that looks right in dark is usually unreadable in light.
- No buttons that do nothing. Coming-soon screens have no clickable controls. A feature that cannot work on a
  platform is hidden there with `isIOS` from `src/platform.ts`, not left as a dead control.
- The bottom nav is shared by every tab. Do not restyle it per tab.
- All tabs use the same plain style as Home and Hub. No full-screen illustrated backgrounds, nothing that
  stands out.
- English only.
- Text Size is a page `zoom` on `<html>`: size full-height layout in `%`, never `vh`.
- Keep `@capacitor/core`, `android`, `ios` and `cli` on the same version.
- Never commit `android/keystore.properties`, `android/app/release-keystore.jks`, or the temporary
  `ndk { abiFilters ... }` line used for test builds.
- Native code: Android plugins are in `android/app/src/main/java/com/syhuinc/omnihub/<feature>/` and each has
  a Swift twin. Change both, keep the JS contract in the plugin's `.ts` file identical, and say plainly when
  something ships without having been built or run.

## How to check your work

```
npm install
npx tsc -b            # must be clean
npm run lint          # warnings exist; add no errors
npm run build
npm run dev           # then look at the screen you changed at 436 px wide, in both themes
```

For Android native changes: `npm run build && npx cap sync android`, then `./gradlew assembleDebug` in `android/`.
Report honestly: what you changed, what you ran, what you could not verify.
