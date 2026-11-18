# CereBruv Audit & Action Plan Summary

This document consolidates the complete read-only audit, findings, implementation details, and demo risks for CereBruv.

---

## 1. Executive Master Table

| Item | Type | Why | Demo Risk | Effort | Recommended Before Pitch? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Silent Auto-Add on Speech / Enter** | **Fix** | Ambient mic pickup creates tasks or drops thoughts silently without user tap; Enter key in QuickCapture creates notes directly. *(Gated behind `ENABLE_VOICE_AUTO_CREATE = false` + Thoughts toast added)* | **High** | **S** | **DONE** |
| **Missed-Task Negative XP & Voice Humiliation** | **Fix / Disable** | Overdue tasks trigger `-10 XP` toast, sound, vibration, and audible mascot voice during pitch. *(Gated behind `ENABLE_MISSED_PENALTY = false`)* | **High** | **S** | **DONE** |
| **FCM Permission Blocked Crash** | **Fix** | `getToken()` throws uncaught error if user blocks browser notifications or if VAPID key is absent. *(Protected with early return & clean warn)* | **High** | **S** | **DONE** |
| **Hardcoded Firebase Credentials in Service Worker** | **Fix** | `public/sw.js` and `dist/sw.js` expose production Firebase config and API key in source control. | **High** | **S** | **YES** |
| **Firestore Security Rules for User Profile** | **Fix / Enhance** | Current rule only allows `users/{userId}/**`. Public profile or global username uniqueness cannot be enforced without rule update. | **High** | **M** | **NO** (Keep simple for demo) |
| **Hide XP & Levels from Header and Popups** | **Remove (UI)** | Fully removing XP types across 8 storage layers risks breaking DB schema before pitch; hiding UI leaves streaks intact with zero regression risk. *(XP UI removed & clean streak/task counts displayed)* | **Med** | **S** | **DONE** |
| **Guest Profile Display & Upgrade Flow** | **Enhance** | Profile shows "Guest Bruv" without an inline name change input; linking exists but needs cleaner UX. | **Med** | **S** | **YES** |
| **In-App Permissions Dashboard in Settings** | **Add** | Current bell button already has toggles; needs permission status badges (mic, camera, notifications) and reset guides. *(Added live Permissions section to settings popover)* | **Low** | **S** | **DONE** |
| **SVG Contribution Heatmap for Streak** | **Add** | Cloud tab only displays `stats.streakDays`; backfilling daily completions into a pure SVG/HTML grid adds pitch visual appeal without dependencies. | **Low** | **M** | **YES** |
| **Leftover Tesseract / Dead OCR References** | **Fix** | `dist/sw.js` and `public/sw.js` cache nonexistent `.traineddata.gz` and `.wasm` files. | **Low** | **S** | **YES** |
| **Uncleaned Timers in Canvas & Voice Loops** | **Fix** | `FocusOrbit.ts` `setInterval` leaks on tab mount; `DotGraph.ts` leaves global window listeners. | **Med** | **S** | **NO** (Touch after pitch) |

---

## 2. Auto-Creation Audit (`createTask`, `createNote`, `createEvent`)

> Note on `createEvent`: There is **no method named `createEvent`** anywhere in the repository. Tasks double as calendar events (`category: 'event'`).

| Method Call | Exact Location | Caller Chain | User Gesture Required? | Label | Mechanism & Trigger |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`noteRepository.createNote(...)`** | `QuickCapture.ts:652` | `inputEl.addEventListener('keydown')` [L633] $\to$ `Enter key` $\to$ non-command text | **NO pointer click (Keydown only)** | **CONFIRMED** | Typing general text into QuickCapture and hitting Enter saves a Thought/Note with no prompt or preview. |
| **`noteRepository.createNote(...)`** | `QuickCapture.ts:912` | `saveNoteBtn.addEventListener('click')` [L899] | **YES** | **CONFIRMED** | User explicitly taps "Save as Image Note" in Screenshot Rescue. |
| **`taskRepository.createTask(...)`** | `QuickCapture.ts:1038` | `approveBtn.addEventListener('click')` [L1017] | **YES** | **CONFIRMED** | User explicitly taps "Approve Task" on scanned card. |
| **`taskRepository.createTask(...)`** | `TaskForm.ts:452` | `form.addEventListener('submit')` [L390] | **YES** | **CONFIRMED** | User explicitly taps "Save Task" in modal. |
| **`noteRepository.createNote(...)`** | `ThoughtsView.ts:219` | `saveBtn.addEventListener('click')` [L205] or `Ctrl+Enter` [L240] | **YES** | **CONFIRMED** | User explicitly submits thought form. |
| **`taskRepository.createTask(...)`** | `VoiceService.ts:706` | `confirmPendingTaskDraft()` [L697] | **YES** | **CONFIRMED** | User explicitly confirms a clarification draft by voice or tap. |
| **`taskRepository.createTask(...)`** | `VoiceService.ts:1545` | `SpeechRecognition.onend` [L928] / `silenceTimer` [L1099] $\to$ `executeVoiceCommand()` | **NO USER GESTURE** | **CONFIRMED** | **THE PRIMARY AUTO-ADD BUG.** Ambient speech matching regex (category + duration + priority) directly creates a task without user confirmation. |
| **`noteRepository.createNote(...)`** | `VoiceService.ts:1574` | `SpeechRecognition.onend` [L928] / `silenceTimer` [L1099] $\to$ fallback branch | **NO USER GESTURE** | **CONFIRMED** | **THE SECOND AUTO-ADD BUG.** Any audio heard that fails to match a command intent is automatically saved as a Note in Thoughts. |

### Snapshot Listeners, Re-Run Paths & Alarms
- **Firestore Snapshot Listeners (`onSnapshot`)**: None exist in the project.
- **Component Re-Run Paths**: None exist (vanilla TypeScript, no reactive framework loop).
- **Reminder Generation**: `runRealTimeAlarmCheck()` (`main.ts:741`) runs every 15s; it generates in-memory popup toasts but never invokes `createTask` or `createNote`.

---

## 3. XP System & Streak Independence

### Touchpoints Matrix
1. **Header Badge**: `src/main.ts:61-63` & `src/main.ts:883-885`
2. **Task Completion Popups & Speech**:
   - `src/main.ts:368, 385, 391-393`
   - `src/components/FocusOrbit/FocusOrbit.ts:220-224`
   - `src/components/Tasks/TaskList.ts:367-371`
   - `src/services/voice/VoiceService.ts:1498-1502`
3. **Missed-Task Penalties**:
   - `src/services/notifications/NotificationService.ts:380-394`
   - `src/main.ts:330, 751-754`
4. **Cloud / Profile Stats View**:
   - `src/components/Cloud/CloudView.ts:77`
5. **Storage Repositories & Types**:
   - `src/types/user.ts:4-6` (`experiencePoints`, `level`)
   - `src/services/storage/IUserStatsRepository.ts:5` (`addExperience`)
   - `src/services/storage/LocalStorageAdapter.ts:223-230` & `FirestoreAdapter.ts:358-376`

### Can Streaks Stay Without XP?
**Yes, 100% independently.** In `FirestoreAdapter.ts:378-414` and `LocalStorageAdapter.ts:232-258`, `recordDailyActivity()` computes streaks using calendar date differences (`diffDays === 1`). It does not read or write XP or levels.

### Callers of `recordDailyActivity` and `addExperience`
- **`recordDailyActivity()`**:
  - `src/main.ts:876` inside `initUserStats()` on startup (`main.ts:922`).
- **`addExperience()`**:
  - `src/main.ts:385` (tapped "Complete (+25 XP)" on toast).
  - `src/main.ts:752` (missed-task penalty deduction).
- *(Note: Task completions call `incrementTaskCount()`, which updates XP internally).*

---

## 4. Skipped Items from Audit (Dependencies, Models, Errors, Accessibility)

1. **Dependencies & Models**:
   - Zero references to `gemini-2.5`; model is pinned to `gemini-3.8-flash` in `GeminiService.ts:8`.
   - `jsqr` is used in `imageUtils.ts:214` for QR code reading.
   - Dead Tesseract references exist in `public/sw.js:78` (`.traineddata.gz`, `.wasm`).
2. **Swallowed Errors**:
   - 25 empty catch blocks (`} catch {}`) exist across `NotificationService.ts`, `FirestoreAdapter.ts`, and `VoiceService.ts`.
3. **Accessibility**:
   - Form controls in `TaskForm.ts:98-135` lack explicit `<label for="...">`.
   - `FocusOrbit.ts` 24h canvas dial has no screen reader live-region or alternative table.
4. **Duplicate Loaders**:
   - `src/assets/lottie/loader.json` and `public/loader.json` are exact duplicates (3,055 bytes).
5. **App Check & Key Restrictions**:
   - App Check is not initialized; app bypasses Firebase AI on localhost (`GeminiService.ts:40-49`) using direct API key REST calls.
   - Production Firebase credentials in `public/sw.js` are currently un-obscured in source.

---

## 5. Completed Fixes

### Missed-Task Penalty Disabling
- Added `ENABLE_MISSED_PENALTY = false` in `src/services/notifications/NotificationService.ts:29`.
- Gated the `stage === 'missed'` alarm generation branch at line 380 so that no missed-task alarm, sound, vibration, voice, or XP penalty fires.
- **Persistence Verified**: Fired alarm state survives page reloads via `localStorage` key `cerebruv_fired_alarms_v1`.

### Fail-Safe FCM Push Token Acquisition
- Updated `initFirebaseCloudMessaging()` in `src/services/notifications/NotificationService.ts:411-442`.
- Added early-exit `if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;`.
- Wrapped `getToken()` call in dedicated `try/catch` returning `null` with a single-line warning, eliminating console stack spam and ensuring app startup and in-app alarms continue uninterrupted when push is blocked.

### Voice Auto-Creation Disabled & Confirmation Enforced
- Added `export const ENABLE_VOICE_AUTO_CREATE = false;` in `src/services/voice/VoiceService.ts:39`.
- **At L1522**: Gated `create_task` path so all voice tasks route through `this.pendingTaskDraft` confirmation rather than saving directly to `taskRepository`.
- **At L1574**: Gated unrecognized speech fallback so it no longer calls `noteRepository.createNote(...)`. Instead, it emits the polite "Didn't catch that, Bruv" feedback prompt.
- **QuickCapture Enter Feedback**: Added a clean 2.5s pill badge toast ("✓ Saved to Thoughts") above the QuickCapture input on Enter key submission.

### XP & Level UI Concealment
- Removed `#xp-badge` pill markup from `main.ts:57-63`; `updateStatsUI` remains null-safe via `if (xpEl)`.
- Removed "+25 XP" and re-worded completion buttons and speech lines in `main.ts:365-390`, `FocusOrbit.ts:218-228`, `TaskList.ts:365-375`, and `VoiceService.ts:1501-1504`.
- Replaced the "Level X • Y XP" stat line in `CloudView.ts:93-96` with `stats.streakDays Day Active Streak` and `stats.tasksCompletedTotal Tasks Completed`.
- **Double-Award Inspection on main.ts:385**:
  - `main.ts:385` directly calls `userStatsRepository.addExperience(25)` when clicking "Complete Task" on the floating alarm toast.
  - Notice that it calls `taskRepository.toggleTaskCompletion(...)` directly without going through `FocusOrbit` or `TaskList` handlers. Therefore, it does **NOT** call `incrementTaskCount()`. There is no double-award in `main.ts:385`, but `tasksCompletedTotal` was previously not incremented from that toast path (only XP was). Storage types and underlying adapters remain unmodified.

### System Permissions Dashboard in Settings Popover
- Added a dedicated "SYSTEM PERMISSIONS" section in `#header-settings-popover` (`main.ts:100-160, 420-530`).
- Displays live status for **Notifications**, **Microphone**, and **Camera** (`granted`, `denied`, `not asked`, `unknown`).
- For "not asked" / "prompt": renders an inline `Request` pill button. For mic and camera, it briefly requests stream via `getUserMedia` and immediately stops all media tracks.
- For "denied": displays red instructions telling the user how to unblock access in browser site settings.
- Binds `navigator.permissions.query(...).onchange` and re-checks state on bell click or request button clicks.

### Microphone Auto-Start & Audio Bleed Audit Findings
1. **Mic Starts & Restarts without User Gesture**:
   - `VoiceService.ts:919` (`recognition.onend`): If recognition pauses before `speechInactivityTimer` expires, it automatically calls `recognition.start()` without user interaction.
   - User gesture is strictly required for initial mic start via avatar click (`main.ts:683`). "Talkative voice mode" only speaks aloud (`voiceService.speak(...)`); it does not auto-open the mic.
2. **Can TTS Be Heard by Recognition?**:
   - **YES, unless muted or using headphones.**
   - While `toggleListening()` calls `stopSpeaking()` on startup, subsequent voice answers call `this.speak(...)` while recognition or fallback loops may still be active or restarting. Laptop speaker sound bleeds directly into the internal microphone and gets picked up as audio input. Disabling auto-creation prevents this feedback loop from generating ghost notes or tasks.

---

## 6. Recommended Order of Work & Git Branches

1. **`fix/fcm-and-secrets`**
   - Guard `getToken()` against blocked notifications in `NotificationService.ts`.
   - Clean hardcoded secrets from `public/sw.js`.
2. **`fix/speech-auto-add`**
   - Enforce confirmation on voice-parsed tasks (`VoiceService.ts:1545`).
   - Stop auto-saving arbitrary speech as thoughts (`VoiceService.ts:1574`).
3. **`feat/hide-xp-penalties`**
   - Hide `#xp-badge` div in `main.ts:61`.
   - Remove "+25 XP" strings from voice feedback and completion popovers.
4. **`feat/settings-permissions`**
   - Add status indicators (granted/denied/blocked instructions) to header settings popover.
5. **`feat/streak-contribution-graph`**
   - Backfill completed task counts by day into a zero-dependency SVG/HTML grid in `CloudView.ts`.
6. **`feat/profile-display`**
   - Add profile fields (username, bio) in `CloudView.ts` stored under `users/{uid}/profile/info`.

---

## 7. "Do NOT Touch Before the Pitch" List

1. **DO NOT refactor the database schema or delete `experiencePoints`/`level` from Firestore/LocalStorage adapters.**
2. **DO NOT implement cross-collection global unique username locks in `firestore.rules`.**
3. **DO NOT touch `migrateLocalStorageToFirestore()` in `migrate.ts`.**
4. **DO NOT modify PWA Service Worker caching strategies (`CACHE_NAME`).**
