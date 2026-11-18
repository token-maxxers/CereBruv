# CereBruv Audit & Action Plan Summary

This document consolidates the complete read-only audit, findings, implementation details, and demo risks for CereBruv.

---

## 1. Executive Master Table

| Item | Type | Why | Demo Risk | Effort | Recommended Before Pitch? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Silent Auto-Add on Speech / Enter** | **Fix** | Ambient mic pickup creates tasks or drops thoughts silently without user tap; Enter key in QuickCapture creates notes directly. | **High** | **S** | **YES** |
| **Missed-Task Negative XP & Voice Humiliation** | **Fix / Disable** | Overdue tasks trigger `-10 XP` toast, sound, vibration, and audible mascot voice during pitch. *(Gated behind `ENABLE_MISSED_PENALTY = false`)* | **High** | **S** | **DONE** |
| **FCM Permission Blocked Crash** | **Fix** | `getToken()` throws uncaught error if user blocks browser notifications or if VAPID key is absent. | **High** | **S** | **YES** |
| **Hardcoded Firebase Credentials in Service Worker** | **Fix** | `public/sw.js` and `dist/sw.js` expose production Firebase config and API key in source control. | **High** | **S** | **YES** |
| **Firestore Security Rules for User Profile** | **Fix / Enhance** | Current rule only allows `users/{userId}/**`. Public profile or global username uniqueness cannot be enforced without rule update. | **High** | **M** | **NO** (Keep simple for demo) |
| **Hide XP & Levels from Header and Popups** | **Remove (UI)** | Fully removing XP types across 8 storage layers risks breaking DB schema before pitch; hiding UI leaves streaks intact with zero regression risk. | **Med** | **S** | **YES** |
| **Guest Profile Display & Upgrade Flow** | **Enhance** | Profile shows "Guest Bruv" without an inline name change input; linking exists but needs cleaner UX. | **Med** | **S** | **YES** |
| **In-App Permissions Dashboard in Settings** | **Add** | Current bell button already has toggles; needs permission status badges (mic, camera, notifications) and reset guides. | **Low** | **S** | **YES** |
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
