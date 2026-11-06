# Reference mockups

The owner's approved designs. Match these exactly (see CLAUDE.md). Newest reference wins.

| File | Screen | Status |
|---|---|---|
| `desk-reference.png` | Desk tab (`/profile`) | Built and matched (Oct 8) |
| `syxdi-ai-reference-dark.jpg` | SYXDI AI tab, dark | Built and matched (Oct 8) |
| `syxdi-ai-background-dark.jpg` / `-light.jpg` | SYXDI AI full-screen background art | In use |
| `craft-reference.jpg` | Crafting Station tab | Built and matched (Oct 8). The background art in the app is the owner's own asset, not the mockup's |
| `craft-reference-font-position-notes.jpg` | Owner's red-circled notes: "I want exact font n exact position" | Applied |
| `home-reference.jpg` | Home tab + My Phone card menu (two states) | Built and matched (Oct 8). The phone photo can't be reproduced; the app shows an icon |
| `hub-reference-OLD-sep22.jpg` | Old "Tools" screen | **Outdated**: predates the Hub rename and the glossy 3D icon set. Ask the owner for a current Hub reference before changing Hub |
| `settings-reference.jpg` | Settings screen (Desk → Settings) | Built and matched (Oct 10); awaiting the owner's on-device review |
| `bottom-nav-reference-v2.png` | Bottom nav bar (angular frame, raised AI tile; 1220x350 at the phone's width) | Built and matched (Nov 6). Replaces `bottom-nav-reference.jpg`. The 3D model icon and its Settings toggle are gone by the owner's request, so the Settings GENERAL card has two rows, not the mockup's three |
| `bottom-nav-reference.jpg` | Old bottom nav bar | **Outdated** (Nov 6) |
| `sleep-mode-ai-tab-reference-dark.jpg` / `-light.jpg` | Sleep Mode → AI personality tab with previews | See plans |
| `app-icon-reference.jpg` | App icon direction the owner picked | In use |

# Planned features and open work

## Settings screen (built Oct 10, not yet reviewed on device)
Mockup: `settings-reference.jpg`. Matched on the 436px grid: 17px card inset, 50px rows, 36px solid icon
tiles, 14.4/11.6px row text, 44x26 switches, full-width dividers (`.pf__body--settings` in `Profile.css`).
- General: Haptic Feedback, Keep Screen Awake (native `KeepAwakePlugin`), 3D Nav Icon toggles.
- Appearance: Text Size (app-wide `zoom`, 0.9-1.3); Language row is static "English (for now)" by the owner's choice.
- Time & Formats (`src/settings/formats.ts`): 12/24-hour clock (Alarm list + wheel picker, Sleep Mode,
  Time Zone, Time Difference, Notes and Checklist timestamps), date format (Date Calculator's numeric dates),
  first day of week (calendar pickers), default currency (Budget, Expense Tracker, Subscriptions, Debt),
  measurement system (Unit Converter's starting units). Defaults equal the app's previous behavior.
- Notifications: shows/requests the notification and exact-alarm permissions.
- Security: App Lock with a 4-digit PIN gate at cold start (`src/applock/`); Vault Security links to the
  Vault and sets its auto-lock grace period (`src/vault/session.ts`, key parked in memory only).
- Biometric Unlock (fingerprint/face, native `BiometricPlugin` on androidx.biometric 1.1.0): App Lock
  auto-prompts at cold start with the PIN as fallback; the Vault keeps its derived key in a
  Keystore-encrypted store that the plugin only releases after a successful prompt (`src/vault/biometric.ts`).
  Both STRONG and WEAK biometrics are accepted so camera face unlock works; the trade-off is written up
  at the top of the Java file. Written in the cloud without an Android SDK: the owner's first local
  Gradle build is the compile check.
- Known gaps after the Oct 10 whole-app review (fixed everything else it found):
  - Vault cloud sync can't decrypt on a second device: the PBKDF2 salt is per device and never synced,
    so the same PIN derives a different key there. Needs a design decision (sync the salt in a
    `users/{uid}/vaultMeta` doc, or stop syncing the Vault).
  - Items deleted while signed out come back at the next sign-in (no local tombstones).
  - Timer: a timer that ends while the phone is locked only beeps once the WebView is ticking again;
    reliable background completion needs a native notification/alarm.
  - Wind-Down "Focus Mode" only highlights itself; nothing else changes. Needs the owner to say what it
    should do (or be removed). `ReminderExampleScreen.tsx` and `PersonalizationScreen.tsx` are unreachable.
  - `CrashLogActivity` is not in the manifest, so its "standalone launcher" purpose doesn't exist yet;
    adding it would put a second icon in the launcher, so it's left for the owner to decide.
  - Not built into an APK from the cloud: the signing files aren't in the repo. The native changes from
    the review (alarm sync parsing, ring service, ringing activity, nag overlay, scheduler, notification
    filter, biometric prompt guards) compile for the first time in the owner's next local build.
- Before shipping: the owner's on-device check of every Settings sub-screen in both themes, App Lock
  (set PIN, relaunch, wrong PIN, right PIN), 12/24h and currency, then the APK routine.

## SYXDI AI
Coming-soon AI companion tab. Features promised on the page: natural conversations, learns your
preferences, personal news feed, smart insights. No functionality yet; no clickable buttons on the page.

## Sleep Mode AI personalities
Five personalities, each with three swipeable preview lines (bedtime, snooze, morning):
- 🌿 Gentle (caring, calm): "Hey… you've had a long day. Come on, let's call it a night." / "You can have
  your five minutes. Then we're going to bed, okay?" / "Good morning. No rush. Just sit up first. We'll take it from there."
- 😊 Friendly (like a close friend): "Hey mate, bedtime. Come on, let's get you off that phone." / "You really
  want another five minutes? 😂 Fine. I'll be back." / "Morning! You're up! Come on, let's get this day started."
- 😏 Teasing (playful, slightly annoying): "Ohhh, look who's still awake. Weren't you supposed to be sleeping?" /
  "Snooze? Of course. I totally saw that coming." / "Good morning, sleepyhead. Did you actually sleep, or were
  you negotiating with me all night?"
- 😤 Strict (firm, not insulting): "It's bedtime. Phone down. We're done for tonight." / "You chose snooze.
  Five minutes. After that, you're getting up." / "Alarm dismissed. Feet on the floor. Start your morning."
- 😈 Savage (funny roasting): "You're still awake? At this point, sleep isn't the problem. You are." /
  "Snooze again? Incredible. Your commitment to avoiding responsibility is impressive." / "My job is done.
  If you crawl back into that bed, that's between you and tomorrow."
Sleep Mode is marked Beta.

## Crafting Station recipes (coming soon, combine tools into one)
- Finance Manager = Budget + Debt + Loan + Subscription
- Document Hub = Scanner + OCR + PDF + Notes
- Travel Planner = Time Zone + Time Difference + Alarm
Page promises: more powerful tools, smart combinations, ready-to-use recipes, create your own tools.

## Other
- Hub needs a current reference picture from the owner before any redesign.
- Play Store: the app is in closed testing (the owner mentioned 12 testers).
