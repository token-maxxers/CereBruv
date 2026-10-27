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
├── index.html                  # HTML5 Entry Point
├── package.json                # Scripts & Dependencies (Vite + TypeScript)
├── tsconfig.json               # TypeScript Compiler Config
├── AI_AGENT_CONTEXT.md         # THIS FILE (Living architecture & agent log)
├── src/
│   ├── assets/
│   │   └── mascot.svg          # Official CereBruv Mascot (Red Brain Robot)
│   ├── components/             # Self-contained UI modules
│   │   ├── FocusOrbit/         # 24-hour circular dial canvas (Image 1)
│   │   ├── DotGraph/           # Obsidian-style interconnected mind graph (Image 2)
│   │   ├── Tasks/              # Realistic task creation and time-blocking cards
│   │   ├── QuickCapture/       # Rapid input bar with audio & photo hooks
│   │   └── Navigation/         # Mobile bottom navigation tabs
│   ├── services/
│   │   ├── storage/
│   │   │   ├── ITaskRepository.ts     # Abstract interface contract
│   │   │   ├── LocalStorageAdapter.ts # Active browser storage (No mock data)
│   │   │   └── FirestoreAdapter.ts    # Placeholder for Teammate B (Firebase)
│   │   ├── ai/
│   │   │   ├── IAIService.ts          # AI Interface contract
│   │   │   └── GeminiService.ts       # Placeholder for Teammate C (Gemini)
│   │   └── notifications/
│   │       └── NotificationService.ts # Local + FCM Web Push shell
│   ├── types/
│   │   ├── task.ts             # Domain Task & TimeBlock definitions
│   │   ├── note.ts             # Thought & Mind-Graph Node definitions
│   │   └── user.ts             # Streak, XP, and settings types
│   ├── styles/
│   │   ├── variables.css       # Design system CSS tokens
│   │   └── main.css            # Mobile-first base styles & utilities
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
