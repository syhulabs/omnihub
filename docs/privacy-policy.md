# Privacy Policy for Omni Hub

**Last updated:** October 2026

Omni Hub doesn't require an account. Signing in with Google is entirely optional and only unlocks syncing some of your data across your own devices — nothing else changes, and nothing is shared, sold, or used for ads or analytics either way.

## What we collect

**If you never sign in:** nothing. Every tool's data (notes, alarms, Vault, and everything else) stays on your device and is never sent anywhere. Omni Hub itself uses no analytics, tracking, or advertising SDKs. The Google libraries we use for optional sign-in are built into the app and may make minimal automatic device-identification calls in the background on their own, as any app using Google's Firebase does — we turn their automatic data collection off by default (see [Third-party services](#third-party-services) below), but that's Google's library behavior, not something Omni Hub reads, controls, or can fully guarantee.

**If you choose to sign in with Google** (Desk ▸ Profile), to sync your data across your own devices:

- Firebase Authentication (a Google service) receives your Google account's basic profile — name, email address, and profile photo — to identify you as the signed-in user. Omni Hub doesn't see or store your Google password.
- These tools' content syncs to Cloud Firestore (also a Google service), scoped to your account, so it can reach your other signed-in devices: **Notes** (titles and text), **Checklist** (list names and items), **Expense Tracker** (amounts, categories, notes, dates), **Budget** (per-category limits), **Subscription Calculator**, **Debt Tracker** (amounts and names/notes you enter), and **Alarms** (time, label, repeat, sound choice, and backup settings — see [Alarm](#alarm) below).
- Your **Vault** notes sync too, but only as the same PIN-encrypted ciphertext already stored on your device — see [Vault](#vault) below for exactly what that means.

No advertising, analytics, or tracking SDKs are used, and nothing collected is ever sold or shared with third parties beyond the Google/Firebase infrastructure used to provide sync itself.

## Where your data lives

Everything you enter into Omni Hub — notes, checklists, expenses, budgets, calculator history, pinned tools, and app settings — is stored **on your device** at minimum, using standard local browser storage (`localStorage`). The tools listed above are additionally copied to Google's Firebase servers only if, and for as long as, you're signed in.

- You can export a backup of this data at any time from **Desk ▸ Data & Sync ▸ Export Backup**, which saves a JSON file to your device that only you control.
- You can delete all local data at any time from **Desk ▸ Data & Sync ▸ Clear All Data**.
- Signing out (Desk ▸ Profile ▸ Sign Out) stops syncing but does not delete what's already on your device or already synced to your account.
- Uninstalling the app deletes local data along with it; it does not delete anything already synced to your account — sign in again after reinstalling to get it back.

## Vault

Notes, photos, and files you save in the **Vault** are additionally encrypted on your device with a key derived from your PIN before being stored — notes alongside your other app data, and photos/files in a separate local database (`IndexedDB`) sized for larger content.

**Your PIN, and any key derived from it, never leaves your device — not even if you sign in and sync.** If you sign in, only the already-encrypted ciphertext of your Vault notes is copied to Firebase, in a form Omni Hub itself cannot read without your PIN; a second device only regains access to it by unlocking with the same PIN. Vault photos and files don't sync at all yet and stay device-only regardless of sign-in status.

Your PIN is never stored anywhere, on-device or in the cloud — only used to derive that key each time you unlock — so if you forget it, Vault content cannot be recovered and the Vault must be reset. Opening or saving a Vault photo/file decrypts a temporary copy for that action (e.g. to view an image or save it to your Downloads folder); that copy is no longer encrypted once it leaves the Vault. Vault photos and files are not included in the main **Desk ▸ Data & Sync ▸ Export Backup** file; use **Vault ▸ Photos & Files ▸ Export** instead, which decrypts them into a plain `.zip` file on your device — that zip is unencrypted, since it needs to be readable outside the app, so store or share it with the same care you'd give the original photos/files. Use **Vault ▸ Photos & Files ▸ Import** to bring that zip back in (e.g. after reinstalling), which re-encrypts everything as it's added.

After 5 wrong PIN attempts, Vault locks itself out with an escalating delay (30s, then 1m, 2m, 5m, 10m, and 30m for every attempt after that) before you can try again — this never clears or wipes any Vault data, it only slows down guessing.

## Permissions

Omni Hub does not access your contacts. It requests these permissions, all used only to make features work (or reserved for a locked feature not yet available to use), never to collect or transmit data beyond what's described above:

- **Internet / network access** — required only for the optional Google Sign-In and cloud sync described above, and for Sleep Mode AI (see below). Unused unless you sign in. Omni Hub separately checks (but does not use to connect anywhere) whether you currently have a Wi-Fi or mobile connection, to show connection status on the "My Phone" card and Phone Health Check.
- **Vibrate** — haptic feedback (tap and completion vibrations).
- **Alarms, notifications, and background wake permissions** (schedule alarms, post notifications, run in the foreground briefly while an alarm rings, keep the device awake for that, show the ringing screen over the lock screen, and restart alarms after the device reboots) — all used solely by the **Alarm** feature, so an alarm you set still rings even if Omni Hub is closed. None of this involves any network access.
- **Biometrics** (optional, off by default) — used only by the **App Lock** and **Vault** "Biometric Unlock" settings, so you can unlock with your fingerprint or face instead of typing your PIN. Android's own system prompt does the matching; Omni Hub only learns whether it succeeded and never sees, stores, or transmits your fingerprint or face data.
- **Display over other apps** — used only by **Sleep Mode**'s on-screen reminder card, so it can appear on top of whatever you're doing when a reminder fires, but only while your phone is unlocked and in active use. Without this permission granted, the same reminder still shows as a normal notification.
- **Camera / flashlight** — used by the **QR Scanner**, **Barcode Scanner**, and **Flashlight** tools, and by the **Phone Health Check**'s Front Camera and Rear Camera tests (Phone Center) to show you a live preview so you can confirm your cameras work. In every case the preview is shown to you only, entirely on your device — no photo, video, or scanned image is ever saved or transmitted; a scanned code's decoded text stays on-device too.
- **Phone state** (optional, off by default) — used only by the **Flashlight** tool's "Flash Alerts" setting to detect when your phone starts or stops ringing, so it can blink the flash for an incoming call. Omni Hub never reads phone numbers, call logs, or call content.
- **Notification access** (optional, off by default, granted separately in Android Settings) — used only by the same "Flash Alerts" setting to detect that some other app posted a notification, so it can blink the flash. Omni Hub never reads, stores, or transmits any notification's content.
- **Location** — used by the **Compass** tool's optional location, altitude, and accuracy display, and optionally by the **Phone Center**'s Connection card to show your Wi-Fi signal strength and link speed (Android requires location access to read these two specific Wi-Fi details; Omni Hub never reads or uses your actual location for this). Read entirely on-device; never stored, logged, or transmitted anywhere.
- **Microphone and audio settings** (not yet in use) — reserved for the **Voice Changer** tool's recording feature, which is currently locked and not yet available. When it launches, recording will only ever start when you tap record, will be processed entirely on your device, and will only ever be sent anywhere if you explicitly tap Share.
- **Modify system settings** (not yet in use) — reserved for Voice Changer's upcoming "Set as Ringtone" option, needed to change your device's default ringtone. Not used for anything else.
- **Photos, Videos, and Audio** (optional, requested only if you open **Phone Center ▸ Storage Details**) — used only to show how much space your photos, videos, and audio files take up. Omni Hub reads file sizes and counts from your media library; it never opens, previews, uploads, or transmits the files themselves.

Two more things Phone Center and Phone Health Check read, neither of which needs a permission prompt and neither of which is ever stored or transmitted: your device's battery level/temperature, total and free storage, total RAM, and Wi-Fi connection status (for the "My Phone" card and related screens); and motion-sensor readings like your accelerometer (only while you're actively running the Sensors test in Phone Health Check, to confirm the sensor responds when you move your phone).

## Alarm

Alarms you create are stored on your device (both in the app's own storage and, separately, in Android's system alarm scheduler so they still fire when the app isn't open) and are used only to ring at the time you set. If you're signed in, an alarm's time, label, repeat setting, chosen sound, and backup-ring settings sync the same way as the other tools listed above, so an alarm you set on one device also rings on your other signed-in devices; alarms don't sync at all if you're not signed in. If you pick a custom ringtone, Omni Hub only stores a reference to the sound file already on that device — it doesn't copy or transmit the audio itself, so a synced alarm using a custom sound falls back to the default alarm sound on a device that doesn't have that same file.

## Sleep Mode AI

Sleep Mode AI is available to anyone signed in, for the Gentle and Friendly personalities. When it generates your reminders, it sends only your chosen personality to Omni Hub's own Cloud Function (which requires your sign-in to call, so usage can be rate-limited), and the Cloud Function forwards that to Google's Gemini API to write the reminder text and a voice clip. Your name, work/school routine, and interests are never sent — Sleep Mode's "Personal" mode uses those only to fill in reminders on your own device, and they never leave it. Nothing from the Cloud Function request is stored by Omni Hub beyond the generated reminders already described for Sleep Mode above; it isn't used to train any model. Every other Sleep Mode personality, and Sleep Mode for anyone not signed in, runs entirely from reminders bundled with the app — nothing about those is ever sent anywhere.

## Third-party services

Signing in and syncing uses Google's Firebase platform (Firebase Authentication and Cloud Firestore). Sleep Mode AI (Gentle/Friendly, signed-in users — see above) additionally uses a Cloud Function, also on Firebase, which calls Google's Gemini API. We set Firebase's own flag to disable its automatic background data collection by default, so these libraries only act when a feature here actually calls them (signing in, syncing, or generating a Sleep Mode AI reminder) — never automatically. Google's own privacy policy governs how Google handles data on their servers: <https://policies.google.com/privacy>.

## Children's privacy

Omni Hub does not knowingly collect data from children. Cloud sync requires deliberately signing in with a Google account, which is not directed at or targeted toward children.

## Changes to this policy

If this policy ever changes, the "Last updated" date above will change too.

## Contact

Questions about this policy can be sent to the developer contact listed on the Omni Hub Google Play Store listing.
