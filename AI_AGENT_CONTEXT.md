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
| **Phase 4** | 24-Hour Focus Orbit Canvas Engine (Calculates Free Time & Realistic Next Task) | **READY** | Antigravity Agent |
| **Phase 5** | Obsidian-Style Interactive Dot Graph Engine | **PENDING** | Antigravity Agent |
| **Phase 6** | PWA Manifest, Local Notification Shell & Firebase Hand-off | **PENDING** | Antigravity Agent |
| **Teammate Integrations** | Firebase Auth/Firestore, Gemini API, Cloud Messaging | **PLANNED** | Teammates B, C, D |

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

---

> **MANDATORY INSTRUCTION FOR THE NEXT AI AGENT:**
> Whenever you write or modify code in this repository:
> 1. Add an Entry in Section 6 above detailing what you changed.
> 2. Update the status column in Section 4.
> 3. Preserve this document's structure and rules.
