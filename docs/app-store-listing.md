# App Store listing draft: Omni Hub (iPhone)

A draft for the owner to paste into App Store Connect. Assistants do not edit the listing itself.
It differs from `docs/play-store-listing.md` where the iPhone app differs: no flash alerts, no ringtone
or alarm-sound picker, alarms and Sleep Mode arrive as notifications, and sign-in is with Apple or Google.

## Name (max 30 characters)

```
Omni Hub
```

## Subtitle (max 30 characters)

```
26+ everyday tools in one app
```

(29 characters)

## Promotional text (max 170 characters, can be changed without a new build)

```
Calculators, notes, alarms, a private PIN-locked Vault, budget and expense tools, scanners and more. One clean app. No account needed.
```

(134 characters)

## Keywords (max 100 characters, comma separated, no spaces)

```
calculator,converter,notes,checklist,alarm,timer,budget,expense,vault,scanner,compass,tip,sleep
```

(95 characters)

## Description (max 4000 characters)

```
Omni Hub is an all-in-one toolbox for everyday tasks: a private PIN-locked Vault, Subscription Calculator, Sleep Mode, Debt Tracker, calculator, notes and more, all in one clean, fast app. No clutter, no account required.

NO ACCOUNT NEEDED
Sign-up is never required to use Omni Hub. Everything you create is stored on your iPhone, and you are always in control: back up your data to a file whenever you like, or clear it all with one tap. No tracking, no analytics, no ads.

OPTIONAL: SYNC ACROSS YOUR DEVICES
Want your data on more than one device? Sign in with Apple or Google, entirely optional, to sync Notes, Checklist, Expense Tracker, Budget, Subscription Calculator, Debt Tracker, Alarms and your private Vault. Your Vault stays protected: only your already PIN-encrypted data leaves your device, and your PIN never does. Nothing is shared or sold. You can delete your account and its synced data from inside the app at any time.

26+ TOOLS

Essentials
• Calculator, with a history of your past calculations
• Scientific Calculator: trig, logs, powers and constants
• Percentage Calculator: X% of Y, percent change and more
• Unit Converter: length, weight, temperature, volume, speed, area and data
• Timer: a simple countdown
• Stopwatch, with lap times
• Alarm: alarms with optional backup rings, delivered as time-sensitive notifications
• Sleep Mode: bedtime reminders that talk you into putting the phone down

Utilities
• Compass
• Flashlight
• QR Scanner
• Barcode Scanner

Productivity
• Notes: write, edit, pin and search
• Checklist: multiple lists, check items off, reorder them

Finance
• Expense Tracker: log spending by category with a monthly breakdown
• Budget: monthly limits per category, tracked against your spending
• Tip Calculator
• Split Bill
• Subscription Calculator: track recurring costs
• Debt Tracker: who owes you, and who you owe

Time & Date
• Age Calculator
• Date Calculator: days between dates, or add and subtract days
• Time Zone: a world clock for the cities you care about
• Time Difference: how far ahead or behind two cities are

Fun
• Random Generator: dice, coin flip, random number, or pick from a list

Plus a private Vault, locked with a PIN and Face ID or Touch ID, for notes, photos and files you want extra protected.

FIND WHAT YOU NEED, FAST
Start typing in the search bar. Omni Hub understands what you mean, not just tool names: "split" finds the bill splitter, "how old" the age calculator, "cm to inches" the converter. Pin your most-used tools to the Home screen and drag to reorder them.

A CLEAN, FOCUSED APP
Fast and simple, with a dark and a light theme. Every permission Omni Hub asks for is used only for the feature that needs it; the privacy policy says exactly what each one does.
```

## URLs

- Privacy Policy URL: `https://omnihub.syhu.net/privacy-policy.html`
- Support URL: `https://omnihub.syhu.net/`
- Marketing URL (optional): `https://omnihub.syhu.net/`

## Category, price, age

- Primary category: **Utilities**. Secondary (optional): **Productivity**.
- Price: free. No in-app purchases.
- Age rating questionnaire: no to everything. Sleep Mode's "Savage" lines are mild humour, no profanity.

## App Privacy answers

Data is collected only if the user signs in. It is linked to the user and **not** used for tracking.
All of it is for **App Functionality**:

- Contact Info → Email Address
- Contact Info → Name
- Identifiers → User ID
- User Content → Other User Content (the content of the synced tools: notes, checklists, expenses, budgets,
  subscriptions, debts, alarms, and the encrypted Vault)

Nothing else is collected. No advertising, no analytics, no third-party tracking.
`ios/App/App/PrivacyInfo.xcprivacy` declares the same.

## Review notes (App Review Information → Notes)

```
Omni Hub works fully offline and needs no account. Every tool can be used without signing in.

Sign in with Apple and Google Sign-In (Desk tab → Profile) are optional and only sync the user's own data between their devices. The account and its synced data can be deleted in the app: Desk → Profile → Delete My Account (shown when signed in).

Alarms and Sleep Mode use local notifications (time-sensitive). Sleep Mode sends a bedtime reminder and up to three follow-ups per night.

The AI and Craft tabs are "coming soon" information pages with no controls.

Permissions, each asked only when its feature is opened: Camera for the QR, barcode and number scanners and the Health Check camera test; Location (while in use) for coordinates and altitude in the Compass; Motion for the Compass and Level; Face ID to unlock App Lock and the Vault.
```

No demo account is needed, because nothing requires signing in.

`Info.plist` also carries a microphone purpose string for the Voice Changer. That tool is locked in this
version, so the microphone is never requested; the string is harmless and can stay.

## Screenshots

6.9-inch iPhone (1320 × 2868) or 6.5-inch, taken on a real iPhone, not in a browser. The simulator cannot run
the app (ML Kit, see `docs/ios-build.md` section 3).
Suggested set: Home (dark), Hub (dark), Sleep Mode, Budget, Time Difference, Notes, Home (light), Hub (light).
