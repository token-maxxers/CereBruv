# AI AGENT CONTEXT & DEVELOPMENT LOG: CEREBRUV
> **CRITICAL DIRECTIVE FOR ANY AI AGENT ACCESSING THIS REPOSITORY:**
> 1. You MUST read this document thoroughly before proposing or writing any code.
> 2. You MUST adhere to the established architectural boundaries, color scheme, and Google-only tech stack.
> 3. Whenever you make any changes, additions, refactors, or complete a phase, you are **MANDATED** to update this file with your log under Section 6 ("Agent Modification Log") and update Section 4 ("Phase Status Matrix").

---

## 1. Project Overview & Hackathon Rules
* **Project Name:** CereBruv ("Cerebrum" + "Bruv")
* **Tagline:** "Think it through, CereBruv's got you."
* **Event:** GDG Cagayan de Oro Buildathon 2026 (Road to DevFest 2026)
* **Theme:** AI-assisted second brain and time-blocking companion for developers and students.
* **Tech Stack Compliance Rule:** Built exclusively on Google Products & Technologies:
  * Frontend: Mobile-First Progressive Web Application (Vite + TypeScript + Vanilla CSS + Canvas 2D)
  * Cloud & Backend: Google Firebase (Hosting, Firestore, Authentication, Cloud Messaging)
  * AI Layer: Google AI Studio & Gemini API
  * Built using: Google Antigravity IDE

---

## 2. Visual Identity & Design System Tokens
* **Strict Rule:** Beige is the DOMINANT color. Accented with CereBruv Red and high-contrast Black. No emojis in UI labels; use clean geometric SVG icons.
* **Palette Tokens:**
  * Dominant Beige Background: `#F5EFEB` (Warm cream canvas)
  * Surface Card Beige: `#FAF7F2` (Crisp light card and panel background)
  * Elevated Beige: `#EDE5DA` (Inputs, chips, elevated buttons)
  * CereBruv Signature Red: `#E52E2E` (Official mascot, active orbit arcs, priority flags, primary CTA)
  * High-Contrast Black: `#121216` (Primary typography, high-contrast borders, dark elements)
  * Muted Black / Taupe: `#5E5D67` (Secondary copy, timestamps, dial markers)
  * Subtle Card Border: `#E2D9CC`
* **Mascot Asset:** Uses the official mascot image `src/assets/mascot.png` as provided by the user.
* **Strict UX Rule:** Mobile-first viewport (max width 440px centered). Responsive for phone screens.

---

## 3. Modular Architecture & Directory Map
```text
CereBruv/
├── .env                        # Local environment variables (VITE_FIREBASE_*, gitignored)
├── .env.example                # Template for environment variables
├── .firebaserc                 # Firebase project alias
├── firebase.json               # Firebase hosting & firestore rules configuration
├── firestore.rules             # Granular user-scoped Firestore security rules
├── index.html                  # HTML5 Entry Point
├── package.json                # Scripts & Dependencies (Vite + TypeScript)
├── tsconfig.json               # TypeScript Compiler Config
├── AI_AGENT_CONTEXT.md         # THIS FILE (Living architecture & agent log)
├── public/
│   ├── manifest.json           # Web App Manifest
│   └── sw.js                   # Service Worker (offline cache + FCM shell)
├── src/
│   ├── vite-env.d.ts           # Vite client & ImportMetaEnv type definitions
│   ├── assets/
│   │   ├── mascot.png          # Official CereBruv Mascot (Idle Transparent PNG)
│   │   ├── CerebruvTalk-1.png  # Mascot Speaking Frame 1 (Closed Smile)
│   │   ├── CerebruvTalk-2.png  # Mascot Speaking Frame 2 (Open Smile)
│   │   ├── CerebruvListen.png  # Mascot Listening / Typing Expression
│   │   └── mascot.svg          # Mascot vector asset
│   ├── components/             # Self-contained UI modules
│   │   ├── Auth/
│   │   │   └── AuthScreen.ts   # Mobile-first sign-in, sign-up & guest upgrade screen
│   │   ├── Cloud/
│   │   │   └── CloudView.ts    # Cloud sync status & metrics panel
│   │   ├── FocusOrbit/
│   │   │   ├── FocusOrbit.ts   # 24-hour circular dial canvas engine
│   │   │   └── orbitCalculator.ts # Dial trigonometry & gap heuristics
│   │   ├── DotGraph/
│   │   │   └── DotGraph.ts     # Obsidian-style 60fps force-directed graph
│   │   ├── Tasks/
│   │   │   ├── TaskForm.ts     # Task creation modal with date selector
│   │   │   └── TaskList.ts     # Task display, toggle completion & deletion
│   │   └── QuickCapture/
│   │       └── QuickCapture.ts # Rapid thought capture, mic & photo triggers
│   ├── services/
│   │   ├── firebase.ts         # Firebase App, Analytics & Firestore initialization
│   │   ├── auth/
│   │   │   └── AuthService.ts  # Google, Email & Guest linking authentication wrapper
│   │   ├── events.ts           # Central Pub/Sub event bus
│   │   ├── storage/
│   │   │   ├── index.ts               # Active Firestore repository exports
│   │   │   ├── migrate.ts             # One-time LocalStorage to Firestore data migration
│   │   │   ├── ITaskRepository.ts     # Abstract Task repository interface
│   │   │   ├── INoteRepository.ts     # Abstract Note repository interface
│   │   │   ├── IUserStatsRepository.ts# Abstract UserStats repository interface
│   │   │   ├── LocalStorageAdapter.ts # Local browser storage implementation
│   │   │   └── FirestoreAdapter.ts    # Firestore storage implementation (users/{uid}/...)
│   │   ├── ai/                        # Firebase AI / Gemini Companion Layer
│   │   │   ├── IAIService.ts          # AI Interface contract
│   │   │   └── GeminiService.ts       # Gemini 2.5 Flash companion integration (firebase/ai)
│   │   ├── voice/
│   │   │   └── VoiceService.ts        # Local keyword/date/time parser, TTS Talk-Back & STT engine
│   │   └── notifications/
│   │       └── NotificationService.ts # Local reminder & FCM Web Push shell
│   ├── types/
│   │   ├── task.ts             # Domain Task & TimeBlock definitions
│   │   ├── note.ts             # Thought & Mind-Graph Node definitions
│   │   └── user.ts             # Streak, XP, and settings types
│   ├── styles/
│   │   ├── variables.css       # Design system CSS tokens
│   │   ├── main.css            # Mobile-first base styles & utilities
│   │   └── auth.css            # Authentication screen styles & tokens
│   └── main.ts                 # Application bootstrapping & router
```

---

## 4. Phase Status Matrix

| Phase | Description | Status | Responsible |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Project Skeleton, TypeScript, Red/Black/Beige Tokens, Base Shell | **DONE** | Antigravity Agent |
| **Phase 2** | Domain Types & Local-First Storage Adapter (No Fake Data) | **DONE** | Antigravity Agent |
| **Phase 3** | Quick Capture Module & Realistic Task Input Form | **DONE** | Antigravity Agent |
| **Phase 4** | 24-Hour Focus Orbit Canvas Engine (Calculates Free Time & Realistic Next Task) | **DONE** | Antigravity Agent |
| **Phase 5** | Obsidian-Style Interactive Dot Graph Engine | **DONE** | Antigravity Agent |
| **Phase 6** | PWA Manifest, Local Notification Shell & Firebase Hand-off | **DONE** | Antigravity Agent |
| **Phase 7** | Environment Variables Security & Tree Synchronization | **DONE** | Antigravity Agent |
| **Phase 8** | Firebase Anonymous Auth, Firestore Rules & Offline Resilience | **DONE** | Antigravity Agent |
| **Phase 9** | Firestore Adapter Implementation & Persistent Offline Cache | **DONE** | Antigravity Agent |
| **Phase 10** | Live Firestore Cloud Sync & One-Time Local Migration | **DONE** | Antigravity Agent |
| **Phase 11** | Gemini Workload Analysis & Mascot AI Companion (firebase/ai) | **DONE** | Antigravity Agent |
| **Phase 12** | Gemini Vision Multimodal Task Extraction & QuickCapture | **DONE** | Antigravity Agent |
| **Phase 13** | Firebase Cloud Messaging (FCM Web Push) & SW Receiver | **DONE** | Antigravity Agent |
| **Phase 14** | Complete Auth System (Google, Email/Password, Guest Linking) | **DONE** | Antigravity Agent |
| **Phase 15** | Siri-Style Voice Command & Talk-Back Engine, Sprite Loop & 24h Clock Dial | **DONE** | Antigravity Agent |
| **Teammate Integrations** | Firebase Auth/Firestore, Gemini API, Cloud Messaging | **READY** | Teammates B, C, D |

---

## 5. Teammate Hand-off Guides (How Other AI Agents Must Plug In)

### Guide for Teammate B (Firebase Backend Integration):
* Do **NOT** rewrite UI components.
* Go to `src/services/storage/`.
* Inspect `ITaskRepository.ts` to see exact methods required.
* Open `FirestoreAdapter.ts` and implement the methods using Firebase Web SDK (`@firebase/firestore`).
* In `src/services/storage/index.ts`, change export from `LocalStorageAdapter` to `FirestoreAdapter`.

### Guide for Teammate C (Google AI Studio / Gemini Integration):
* Go to `src/services/ai/`.
* Inspect `IAIService.ts`.
* In `GeminiService.ts`, connect `@google/genai` using your Google AI Studio API key.
* Plug in the two main AI endpoints:
  1. `analyzeWorkload(tasks: Task[]): Promise<string>` -> feeds into Mascot Companion status.
  2. `transcribeAudio(audioBlob: Blob): Promise<string>` -> hooks into QuickCapture voice button.

### Guide for Teammate D (Notifications & FCM):
* Inspect `src/services/notifications/NotificationService.ts`.
* Connect your Firebase Web App configuration to handle background Push Notifications via Service Worker.

---

## 6. Agent Modification Log (Mandatory Updates)

### Entry #1: 2026-10-25 (Antigravity Agent)
* **Phase:** Phase 1 Complete.
* **Action:** Initialized Vite + TypeScript setup. Built mobile-first base HTML, Red/Black/Beige design system CSS variables, CereBruv official mascot component, and application shell. Created `AI_AGENT_CONTEXT.md`.
* **Next Action:** Phase 2 (Domain Types, `ITaskRepository`, and `LocalStorageAdapter`).

### Entry #2: 2026-10-25 (Antigravity Agent)
* **Phase:** Design Adjustment (User Directive).
* **Action:** Set Warm Beige (`#F5EFEB`) as the dominant primary canvas color. Configured crisp light card surfaces (`#FAF7F2`) and deep high-contrast black typography (`#121216`). Replaced SVG approximation with the exact official mascot PNG image `src/assets/mascot.png` with outer background extracted to transparent.
* **Next Action:** Phase 2 upon user approval.

### Entry #3: 2026-10-25 (Antigravity Agent)
* **Phase:** Phase 2 Complete.
* **Action:**
  1. Created domain models in `src/types/`: `Task`, `OrbitArcSegment`, `DayWorkloadAnalysis`, `QuickNote`, `GraphNode`, `UserStats`.
  2. Implemented abstract storage contracts: `ITaskRepository`, `INoteRepository`, `IUserStatsRepository`.
  3. Built `LocalStorageAdapter.ts` with real browser persistence. No mock or fake data.
  4. Built `FirestoreAdapter.ts` stub with identical method signatures and migration comments for Teammate B.
  5. Built centralized export & 1-line swap point `src/services/storage/index.ts`.
  6. Built reactive Event Bus `src/services/events.ts`.
  7. Connected storage into `src/main.ts` for dynamic streak and XP initialization.
* **Next Action:** Phase 3 (Quick Capture Module & Realistic Task Input Form).

### Entry #4: 2026-10-25 (Antigravity Agent)
* **Phase:** Phase 3 Complete.
* **Action:**
  1. Built and mounted `QuickCapture.ts`: inline thought capture, speech dictation (Web Speech API), and photo upload file picker hook.
  2. Built `TaskForm.ts` modal sheet: full user inputs for Title, Category (Study, Work, Personal, Event, Rest), 24h Start Time, Duration (mins), Urgency, and Notes.
  3. Built `TaskList.ts`: live task rendering, completion checkbox with +25 XP rewards, and task deletion.
  4. Built `CloudView.ts`: real-time storage metrics (task count, brain-dumps count, streak) and Firebase Firestore hand-off guide.
  5. Built interactive Navigation router in `src/main.ts`: clicking Orbit, Tasks, Graph, and Cloud tabs switches views immediately.
  6. Added Floating Action Button (`+` FAB) to trigger task creation from anywhere.
* **Next Action:** Phase 4 (24-Hour Focus Orbit Canvas Engine).

### Entry #5: 2026-10-25 (Antigravity Agent)
* **Phase:** Phase 4 Complete.
* **Action:**
  1. Built `orbitCalculator.ts`: fractional hour conversions, 24h circular arc calculations, total busy vs free time analysis, and "Realistic Next Task" heuristic based on schedule gaps and task urgency.
  2. Built `FocusOrbit.ts` HTML5 Canvas Engine:
     - 24-hour circular dial with Retina DPI scaling and hour ticks (0, 6, 12, 18).
     - Multi-colored curved task arcs mapped by category (Study, Work, Personal, Rest/Sleep block).
     - Live CereBruv Red clock needle indicating current local time.
     - Center hub showing today's date, busy hours, and remaining free time.
     - Weekly day-picker strip (S M T W T F S) with current day highlighted in CereBruv Red.
     - "Realistic Next Task" recommendation card matching Image 1 specifications.
  3. Integrated `FocusOrbit` directly into the default "Orbit" view in `src/main.ts`.
* **Next Action:** Phase 5 (Obsidian-Style Interactive Dot Graph Engine).

### Entry #6: 2026-10-25 (Antigravity Agent)
* **Phase:** Phase 5 Complete.
* **Action:**
  1. Built `DotGraph.ts`: native HTML5 Canvas 60fps force-directed graph engine matching Image 2 specifications.
  2. Dynamically links user's real tasks (`#E52E2E`), quick notes (`#38BDF8`), and topic hubs (`#4F46E5`, `#0D9488`, `#D97706`).
  3. Implemented particle physics simulation: center gravity, node repulsion, spring link attraction, and velocity damping.
  4. Added full pointer interaction: drag-and-drop nodes, click inspection overlay, and filter buttons (All, Tasks, Notes, Topics).
  5. Wired `renderDotGraph` directly into the "Graph" tab in `src/main.ts`.
* **Next Action:** Phase 6 (PWA Manifest, Local Notification Shell & Firebase Hand-off).

### Entry #7: 2026-10-25 (Antigravity Agent)
* **Phase:** Phase 6 Complete (Foundation Finalized).
* **Action:**
  1. Created `public/manifest.json`: Mobile-first PWA configuration (standalone fullscreen, Warm Beige background, app shortcuts for "Add Task", "Focus Orbit", and "Mind Graph").
  2. Created `public/sw.js`: Service worker with offline asset caching and push notification listeners (ready for Firebase Cloud Messaging).
  3. Built `NotificationService.ts`: Browser permission manager and 10-minute automated task reminder scheduler. Added bell toggle in app header.
  4. Created Google Firebase deployment configs: `firebase.json` and `.firebaserc`.
  5. Tested production build: passes cleanly with zero errors.
* **Next Action:** Hand-off to Teammates B, C, and D for Firebase and Gemini integrations.

### Entry #8: 2026-10-25 (Antigravity Agent)
* **Phase:** Feature Enhancement (Multi-Day Calendar & Future Scheduling).
* **Action:**
  1. Updated `Task` model to include `date: string` (YYYY-MM-DD), with backwards compatibility for existing tasks.
  2. Added interactive date selector in `TaskForm.ts` allowing users to schedule tasks ahead on any future date.
  3. Upgraded `FocusOrbit.ts` weekly date strip to show active dates (e.g., 25, 26, 27) with dot indicators for days containing scheduled tasks.
  4. Added previous (`<`) and next (`>`) day navigation buttons and a quick "TODAY" jump button.
  5. Synchronized `TaskList.ts` to filter and display appointments and tasks for the currently selected calendar day.
* **Next Action:** Ready for team hand-off.

---

### Entry #9: 2026-10-27 (Antigravity Agent)
* **Phase:** Firebase Configuration & Web App Initialization.
* **Action:**
  1. Created `src/services/firebase.ts` with the project Firebase credentials for `cere-bruv`, exporting `app`, Firestore `db`, and `initAnalytics`.
  2. Updated `.firebaserc` default project ID to `cere-bruv`.
  3. Integrated `initAnalytics()` in `src/main.ts` for real-time app telemetry.
  4. Verified full production build (`npm run build`) passes cleanly.
* **Next Action:** Ready for Firebase Hosting deployment (`npx firebase-tools deploy --only hosting`) and Firestore adapter connection.

---

### Entry #10: 2026-10-27 (Antigravity Agent)
* **Phase:** Phase 7 Complete - Environment Variable Extraction & Tree Synchronization.
* **Action:**
  1. Extracted hardcoded Firebase configuration from `src/services/firebase.ts` into `import.meta.env.VITE_FIREBASE_*` variables.
  2. Populated `.env` with the active project credentials and created `.env.example` with blank keys.
  3. Added `.env` and `.env.local` to `.gitignore`.
  4. Added `ImportMetaEnv` interface typings in `src/vite-env.d.ts` for all `VITE_FIREBASE_*` variables.
  5. Updated `AI_AGENT_CONTEXT.md` Section 3 directory map to accurately reflect the real repository tree (`mascot.png`, `firebase.ts`, `events.ts`, `Cloud/CloudView.ts`, `IUserStatsRepository.ts`) and labeled `src/services/ai/` as planned.
  6. Verified that `grep -r "AIzaSy" src/` finds zero occurrences and production build (`npm run build`) succeeds cleanly.
* **Next Action:** Ready for Firebase Hosting deployment (`npx firebase-tools deploy --only hosting`) or Firestore adapter connection.

---

### Entry #11: 2026-10-27 (Antigravity Agent)
* **Phase:** Phase 8 Complete - Firebase Anonymous Auth & Security Rules.
* **Action:**
  1. Updated `src/services/firebase.ts` to export `auth` and `ensureSignedIn()` helper which initiates anonymous authentication (`signInAnonymously`) or returns existing UID.
  2. Wrapped `src/main.ts` startup in `bootstrap()`, awaiting `ensureSignedIn()` before rendering the UI with a try/catch fallback ensuring offline resilience.
  3. Created `firestore.rules` enforcing that only authenticated users can read/write documents located under `/users/{userId}/{document=**}` matching their UID, and explicitly denying all other access.
  4. Updated `firebase.json` to configure `"firestore": { "rules": "firestore.rules" }`.
  5. Verified production build compiles cleanly (`npm run build`).
* **Next Action:** Deploy rules and hosting (`npx firebase-tools deploy --only firestore:rules,hosting`).

---

### Entry #12: 2026-10-27 (Antigravity Agent)
* **Phase:** Phase 9 Complete - Firestore Adapter Implementation & Offline Persistent Cache.
* **Action:**
  1. Updated `src/services/firebase.ts` to initialize Firestore with `persistentLocalCache` and `persistentMultipleTabManager` enabling robust offline support.
  2. Implemented all CRUD and query methods in `src/services/storage/FirestoreAdapter.ts` for `FirestoreTaskRepository`, `FirestoreNoteRepository`, and `FirestoreUserStatsRepository`.
  3. Scoped Firestore collections under `users/{uid}/tasks`, `users/{uid}/notes`, and `users/{uid}/stats/main` obtaining `uid` securely from `auth.currentUser`.
  4. Utilized `increment()` for atomic XP and task counter increments alongside transaction handling for streak calculation and level updates.
  5. Kept `src/services/storage/index.ts` unchanged so that the app currently continues running reliably on `LocalStorageAdapter`.
  6. Verified production build passes cleanly (`npm run build`).
* **Next Action:** Ready for swapping active storage adapter in `src/services/storage/index.ts` whenever live cloud sync is desired.

---

### Entry #13: 2026-10-27 (Antigravity Agent)
* **Phase:** Phase 10 Complete - Live Firestore Cloud Sync & One-Time Data Migration.
* **Action:**
  1. Updated `src/services/storage/index.ts` to export singleton instances of `FirestoreTaskRepository`, `FirestoreNoteRepository`, and `FirestoreUserStatsRepository`.
  2. Created `src/services/storage/migrate.ts` with `migrateLocalStorageToFirestore()`: reads existing tasks, notes, and stats from localStorage on first authenticated launch, copies them to Firestore under `/users/{uid}/...` via batch write, and records `cerebruv_migrated_to_firestore_{uid}` without deleting the original local data.
  3. Integrated migration into `src/main.ts` inside `bootstrap()` immediately after `ensureSignedIn()`, with offline/error resilience.
  4. Verified all UI components (`TaskList`, `FocusOrbit`, `DotGraph`, `CloudView`) handle async repository calls and empty states smoothly.
  5. Verified production build passes cleanly (`npm run build`).
* **Next Action:** Ready for live deployment or testing with offline cache.

---

### Entry #14: 2026-10-27 (Antigravity Agent)
* **Phase:** Phase 11 Complete - Gemini Workload Analysis & Mascot AI Companion.
* **Action:**
  1. Created `src/services/ai/IAIService.ts` defining `analyzeWorkload(tasks: Task[]): Promise<string>`.
  2. Implemented `src/services/ai/GeminiService.ts` using `firebase/ai` (`getAI`, `GoogleAIBackend`, and `getGenerativeModel` with `gemini-2.5-flash`), without exposing any API key in client code.
  3. Configured mascot persona system instructions (punchy, friendly CereBruv voice, calling user "bruv", maximum 2 sentences, no emojis).
  4. Implemented a strict 5-second timeout via `Promise.race` on AI calls.
  5. Updated `updateMascotStatus()` in `src/main.ts` with instant rule-based fallback, debouncing AI calls (400ms) to ensure at most one request per batch of task changes and safely ignoring outdated or offline responses.
  6. Verified production build passes cleanly (`npm run build`).
* **Next Action:** Ready for testing live AI analysis in browser.

---

### Entry #15: 2026-10-27 (Antigravity Agent)
* **Phase:** Phase 12 Complete - Gemini Multimodal Task Extraction & QuickCapture Integration.
* **Action:**
  1. Updated `src/services/ai/IAIService.ts` with `extractTasksFromImage(imageBlob: Blob): Promise<Partial<Task>[]>`.
  2. Implemented `extractTasksFromImage` in `src/services/ai/GeminiService.ts` using `firebase/ai` multimodal capabilities with a structured JSON response schema (`title`, `category`, `durationMins`, `urgency`).
  3. Upgraded `src/components/QuickCapture/QuickCapture.ts`:
     - When a photo is selected, it dispatches the image to Gemini Vision for scanning.
     - Saves only descriptive metadata text to Firestore/notes without storing massive raw image data URLs.
     - Displays proposed tasks in an interactive confirmation drawer allowing the user to tap to schedule them directly into today's Focus Orbit.
  4. Verified production build passes cleanly (`npm run build`).
* **Next Action:** Ready for end-to-end multimodal testing with real handwritten notes or documents.

---

### Entry #16: 2026-10-27 (Antigravity Agent)
* **Phase:** Phase 13 Complete - Firebase Cloud Messaging (FCM Web Push) Integration.
* **Action:**
  1. Updated `src/services/firebase.ts` to export `getFirebaseMessaging()` with feature detection via `isSupported()`.
  2. Implemented `initFirebaseCloudMessaging()` in `src/services/notifications/NotificationService.ts`:
     - Obtains registration token with `getToken` using optional VAPID key and active Service Worker registration.
     - Saves the registration token under `users/{uid}/stats/main` (`fcmToken`, `fcmUpdatedAt`) in Cloud Firestore.
     - Registers foreground push listener (`onMessage`) to show notifications when the app is active.
     - Maintained local 10-minute task alarms as the primary zero-latency alert path.
  3. Upgraded `public/sw.js` with Firebase compat SDK imports and configured `messaging.onBackgroundMessage` alongside the PWA offline cache and notification click handling.
  4. Verified production build passes cleanly (`npm run build`).
* **Next Action:** Ready for testing push notifications from the Firebase Console.

---

### Entry #17: 2026-10-27 (Antigravity Agent)
* **Phase:** Phase 14 Complete - Complete Authentication System & Guest Linking.
* **Action:**
  1. Configured `browserLocalPersistence` on `auth` in `src/services/firebase.ts`.
  2. Created `src/services/auth/AuthService.ts`:
     - `signInWithGoogle()`: tries `linkWithPopup` for anonymous guests to preserve UID and existing tasks; handles `auth/credential-already-in-use` fallback; falls back to `signInWithRedirect` if popup blocked in PWA.
     - `signUpWithEmail(email, password)`: uses `linkWithCredential` for anonymous users to preserve UID and tasks; otherwise calls `createUserWithEmailAndPassword`.
     - `signInWithEmail(email, password)` and `continueAsGuest()`.
     - `signOut()`, `onAuthChange()`, `getCurrentUser()`, and `sendPasswordReset()`.
     - Error normalization translating raw codes to friendly messages.
  3. Created `src/components/Auth/AuthScreen.ts` and `src/styles/auth.css`:
     - Mobile-first (max 440px), CereBruv Red/Warm Beige/Black tokens.
     - Geometric SVG icons (no emojis), segmented toggle (Sign In / Sign Up), email/password fields with eye show/hide, Google button, guest access link, inline validation, and offline notice.
  4. Updated `src/main.ts` with authentication gate:
     - Replaced silent anonymous auto-login; checks `onAuthChange` before mounting.
     - Renders `AuthScreen` when unauthenticated; mounts app on sign-in without page reload.
     - Preserves data continuity upon guest account upgrade.
  5. Updated `src/components/Cloud/CloudView.ts`:
     - Added Account card at top with avatar, display name, guest badge, and "Create Account" (link mode) or "Sign Out" confirmation.
  6. Verified production build passes cleanly (`npm run build`).
* **Next Action:** Proceed to Phase 17 (Talkative Voice Assistant, Smart Alarm Engine & Top Navbar Settings).

---

### Entry #20: 2026-11-07 (Antigravity Agent)
* **Phase:** Phase 17 Complete - Talkative Voice Assistant, Real-Time Multi-Stage Alarm Engine (1h, 30m, Start, Missed XP Penalty), Top Navbar Settings & Edit Button Fix.
* **Action:**
  1. **Smart Assistant Task Sorting (`src/components/FocusOrbit/orbitCalculator.ts`, `src/main.ts`, `src/components/Tasks/TaskList.ts`, `src/services/voice/VoiceService.ts`)**:
     - Added `sortTasksSmartly()` to rank active/imminent tasks (`start <= now + 45m && end >= now`) first (with High Priority tie-breaking), followed by upcoming tasks and overdue tasks.
     - Fixed `updateMascotStatus()` in `src/main.ts` so "Next up" and overdue warnings accurately prioritize imminent/high-priority tasks (e.g., `01:42 HIGH PRIORITY`) instead of insertion order.
  2. **Fixed Edit Pencil Button Triggering Delete Confirmation (`src/components/Tasks/TaskList.ts`)**:
     - Separated `.task-edit-btn` from `.task-remove-btn` so clicking the pencil icon opens the Edit Task modal cleanly without triggering the delete confirmation prompt.
  3. **Real-Time Multi-Stage Voice & Chime Alarm Engine (`src/services/notifications/NotificationService.ts`, `public/sw.js`, `src/main.ts`)**:
     - Added real-time 15-second heartbeat checking 4 stages per task: **1 hour before**, **30 minutes before**, **at start time (Alarm)**, and **missed/overdue window**.
     - Added synthesized Web Audio API chimes (`playAlarmChime`), device & visual vibration (`triggerVibration`), interactive in-app floating alarm toast (`#alarm-toast-container` with `Complete (+25 XP)` and `Edit / Reschedule`), and Service Worker background alarm syncing (`SYNC_TASK_ALARMS` in `public/sw.js`).
     - Added **Missed Task XP Penalty** (`-15 XP` for High Priority, `-10 XP` for Medium/Low, floored at `0 XP` in `LocalStorageAdapter.ts` and `FirestoreAdapter.ts`) with spoken alert when a task's time window passes uncompleted.
  4. **Top Navbar Assistant Settings Popover (`src/main.ts`, `src/styles/main.css`)**:
     - Clicking the top navbar bell button opens the **CereBruv Assistant Settings** popover with toggles for **Talkative Voice Mode (Speak / Muted)**, **Alarm & Action Chimes**, **Vibrate & Haptic Pulse**, **Notification Popups**, plus a **Test Alarm & Voice** button.
  5. **Talkative CereBruv Across All Actions (`TaskForm.ts`, `TaskList.ts`, `FocusOrbit.ts`, `ThoughtsView.ts`, `QuickCapture.ts`)**:
     - Speaks aloud when saving/updating tasks, saving thoughts, completing tasks (congratulating the user + `+25 XP`), and answering schedule queries whenever voice mode is unmuted.
* **Next Action:** Ready for live deployment.

---

### Entry #18: 2026-11-07 (Antigravity Agent)
* **Phase:** Phase 15 Complete - Siri-Style Voice Command & Talk-Back Engine, Custom Mascot Expressions & 24-Hour Clock Orbit.
* **Action:**
  1. Created `src/services/voice/VoiceService.ts`:
     - 100% local deterministic keyword, date, time, duration, category, and urgency parser supporting 5 core `"Hey Bruv"` commands (schedule check, add task, complete task +25 XP, save brain-dump note, and switch view tabs) with zero Gemini quota usage for parsing.
     - Offline-capable Talk-Back speech synthesis (`window.speechSynthesis`) with voice clarity selector and mute persistence.
     - Hybrid Speech-to-Text (`SpeechRecognition` in Chrome/Edge + automatic `MediaRecorder` silence-detecting fallback with `geminiService.transcribeAudio()` for Brave Browser).
  2. Added custom transparent mascot expression sprites (`src/assets/CerebruvTalk-1.png`, `src/assets/CerebruvTalk-2.png`, `src/assets/CerebruvListen.png`):
     - Loops `CerebruvTalk-1` and `CerebruvTalk-2` while CereBruv speaks.
     - Transitions to `CerebruvListen` when listening to user speech or when typing in the Quick Capture input field.
  3. Unified Mascot Banner & Quick Capture container (`src/main.ts`, `src/components/QuickCapture/QuickCapture.ts`, `src/styles/main.css`):
     - Nested Quick Capture input and read-only `"Hey Bruv"` Keyword Guide inside `.mascot-banner`.
     - Clicking the container expands the card, centers the enlarged avatar with a rotating circular conic-gradient light halo strictly behind the logo, moves red text below, and speaks current status aloud.
     - Clicking the avatar triggers voice listening (`CerebruvListen`).
  4. Upgraded `src/components/FocusOrbit/FocusOrbit.ts` to render all 24 hour numbers (`0` through `23`) around the clock dial and added a 15-second live clock timer for real-time needle and midnight rollover.
  5. Replaced all UTC `toISOString().split('T')[0]` calls with local timezone date formatting across `FocusOrbit.ts`, `main.ts`, `TaskList.ts`, `TaskForm.ts`, `QuickCapture.ts`, `VoiceService.ts`, `FirestoreAdapter.ts`, and `LocalStorageAdapter.ts`.
  6. Added node deletion and `Clear All` controls to `src/components/DotGraph/DotGraph.ts` with strictly zero demo data.
* **Next Action:** Proceed to Phase 16 (Thoughts Tab, Interactive Orbit Arc Popover, and Conversational Voice Task Clarification).

---

### Entry #19: 2026-11-07 (Antigravity Agent)
* **Phase:** Phase 16 Complete - Dedicated Thoughts Tab, Interactive Orbit Arc Popover & Conversational Voice Task Clarification.
* **Action:**
  1. Created `src/components/Thoughts/ThoughtsView.ts` and added a 5th **Thoughts** tab (`Orbit | Tasks | Thoughts | Graph | Cloud`) in `src/main.ts`:
     - Displays all saved voice (`"Hey Bruv, note ..."`) and typed brain-dump thoughts.
     - Includes category filter chips (`Study`, `Work`, `Personal`, `Event`, `Rest`), 1-tap category tag switcher on each thought card that dynamically re-links the thought to its Category Hub in the Mind Graph, a `+ To Orbit Task` converter button, and delete controls.
     - Added `updateNote()` to `INoteRepository`, `LocalStorageAdapter`, and `FirestoreAdapter`.
  2. Added **Interactive Arc Popover Card** in `src/components/FocusOrbit/FocusOrbit.ts`:
     - Clicking any colored task block (e.g., green/teal Work arc) or the Sleep block on the 24-hour Focus Orbit ring opens a floating popover card displaying Task Title, Time Range, Category badge, Urgency badge, Notes, and `Complete (+25 XP)`, `Edit`, and `Delete` buttons.
     - Clicking empty track area still opens the New Task modal.
     - Upgraded `src/components/Tasks/TaskForm.ts` and `src/components/Tasks/TaskList.ts` to support full task editing (`open(date, editTask)`).
  3. Added **Conversational + Interactive Task Clarification & Continuous Listening with Live Syntax Guidance** in `src/services/voice/VoiceService.ts` and `src/components/QuickCapture/QuickCapture.ts`:
     - Upgraded Web Speech API to `continuous = true` with a 6.5-second pause retention window (or tap avatar again to finish) so CereBruv never cuts off after a single word like `"Add"`.
     - Added a **Live Syntax Guide Bar** (`getLiveSyntaxTemplate()`) directly under the input field and in the banner that updates dynamically as the user speaks or types (e.g., saying `"Add"` shows `Add [Task Name] at [Time] for [Duration] under [Study | Work | Personal | Event | Rest]`).
     - Only after the user finishes speaking (by tapping the avatar again or after the 6.5s pause) does CereBruv ask for any missing Category, Duration, or Priority details via the interactive 1-tap pill drawer.
* **Next Action:** Proceed to Phase 17 (Talkative Voice Assistant, Smart Alarm Engine & Top Navbar Settings).

---

### Entry #20: 2026-11-07 (Antigravity Agent)
* **Phase:** Phase 17 Complete - Talkative Voice Assistant, Real-Time Multi-Stage Alarm Engine (1h, 30m, Start, Missed XP Penalty), Top Navbar Settings & Edit Button Fix.
* **Action:**
  1. **Smart Assistant Task Sorting (`src/components/FocusOrbit/orbitCalculator.ts`, `src/main.ts`, `src/components/Tasks/TaskList.ts`, `src/services/voice/VoiceService.ts`)**:
     - Added `sortTasksSmartly()` to rank active/imminent tasks (`start <= now + 45m && end >= now`) first (with High Priority tie-breaking), followed by upcoming tasks and overdue tasks.
     - Fixed `updateMascotStatus()` in `src/main.ts` so "Next up" and overdue warnings accurately prioritize imminent/high-priority tasks (e.g., `01:42 HIGH PRIORITY`) instead of insertion order.
  2. **Fixed Edit Pencil Button Triggering Delete Confirmation (`src/components/Tasks/TaskList.ts`)**:
     - Separated `.task-edit-btn` from `.task-remove-btn` so clicking the pencil icon opens the Edit Task modal cleanly without triggering the delete confirmation prompt.
  3. **Real-Time Multi-Stage Voice & Chime Alarm Engine (`src/services/notifications/NotificationService.ts`, `public/sw.js`, `src/main.ts`)**:
     - Added real-time 15-second heartbeat checking 4 stages per task: **1 hour before**, **30 minutes before**, **at start time (Alarm)**, and **missed/overdue window**.
     - Added synthesized Web Audio API chimes (`playAlarmChime`), device & visual vibration (`triggerVibration`), interactive in-app floating alarm toast (`#alarm-toast-container` with `Complete (+25 XP)` and `Edit / Reschedule`), and Service Worker background alarm syncing (`SYNC_TASK_ALARMS` in `public/sw.js`).
     - Added **Missed Task XP Penalty** (`-15 XP` for High Priority, `-10 XP` for Medium/Low, floored at `0 XP` in `LocalStorageAdapter.ts` and `FirestoreAdapter.ts`) with spoken alert when a task's time window passes uncompleted.
  4. **Top Navbar Assistant Settings Popover (`src/main.ts`, `src/styles/main.css`)**:
     - Clicking the top navbar bell button opens the **CereBruv Assistant Settings** popover with toggles for **Talkative Voice Mode (Speak / Muted)**, **Alarm & Action Chimes**, **Vibrate & Haptic Pulse**, **Notification Popups**, plus a **Test Alarm & Voice** button.
  5. **Talkative CereBruv Across All Actions (`TaskForm.ts`, `TaskList.ts`, `FocusOrbit.ts`, `ThoughtsView.ts`, `QuickCapture.ts`)**:
     - Speaks aloud when saving/updating tasks, saving thoughts, completing tasks (congratulating the user + `+25 XP`), and answering schedule queries whenever voice mode is unmuted.
* **Next Action:** Ready for live deployment.

---

## 7. How to Deploy to Google Firebase Hosting

1. Build production bundle:
   ```bash
   npm run build
   ```
2. Log in to your Google / Firebase account:
   ```bash
   npx firebase-tools login
   ```
3. Initialize / select your Firebase Project:
   ```bash
   npx firebase-tools use --add
   ```
4. Deploy in one command:
   ```bash
   npx firebase-tools deploy --only hosting
   ```
5. Your live app will be accessible worldwide on Google Cloud at:
   `https://cere-bruv.web.app`

---

> **MANDATORY INSTRUCTION FOR THE NEXT AI AGENT:**
> Whenever you write or modify code in this repository:
> 1. Add an Entry in Section 6 above detailing what you changed.
> 2. Update the status column in Section 4.
> 3. Preserve this document's structure and rules.
