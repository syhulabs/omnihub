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
| `settings-reference.jpg` | Settings screen (Desk → Settings) | Approved Oct 7; build in progress (see below) |
| `bottom-nav-reference.jpg` | Bottom nav bar | In use |
| `sleep-mode-ai-tab-reference-dark.jpg` / `-light.jpg` | Sleep Mode → AI personality tab with previews | See plans |
| `app-icon-reference.jpg` | App icon direction the owner picked | In use |

# Planned features and open work

## Settings screen (approved, half built)
Mockup: `settings-reference.jpg`. Code is in `settings-screen-wip.patch` (from the old account; apply with
`git apply design/settings-screen-wip.patch` from the repo root). It compiled but was never visually checked, built into an APK, or committed.
- General: Haptic Feedback, Keep Screen Awake (new native `KeepAwakePlugin`), 3D Nav Icon toggles.
- Appearance: Text Size (app-wide scale); Language row is static "English (for now)" by the owner's choice.
- Time & Formats: 12/24-hour clock (wired into Alarm/Sleep Mode), default currency (used by Budget,
  Expense Tracker, Subscription and Debt calculators).
- Notifications screen.
- Security: App Lock with a 4-digit PIN gate at launch; Vault Security links to the Vault.
- Known gaps, not yet told to the owner: fingerprint/face unlock is shown as "Soon" (not built);
  Vault auto-lock timing is saved but does nothing yet.
- Before shipping: screenshot every Settings sub-screen in both themes against the mockup, test App Lock
  (set PIN, relaunch, wrong PIN, right PIN), test 12/24h and currency, then the APK routine.

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
