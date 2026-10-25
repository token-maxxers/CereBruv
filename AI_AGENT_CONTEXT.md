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
* **Strict Rule:** No generic bright blues/purples unless specified. Maintain high-contrast, premium aesthetic.
* **Palette:**
  * Obsidian Black: `#0D0D11` (App background)
  * Charcoal Surface: `#16161B` (Cards, panels, modal sheets)
  * Elevated Surface: `#202028` (Inputs, secondary badges)
  * CereBruv Red: `#E52E2E` (Brand mascot, active orbit arcs, priority flags, primary CTA)
  * Light Cream / Warm Beige: `#F5EFEB` (Primary typography)
  * Muted Sand Beige: `#D8C7B0` & `#A89F91` (Labels, secondary text, orbit dial markings)
* **Strict UX Rule:** Mobile-first viewport (max width 440px centered). Responsive for phone screens. No emojis in UI labels; use clean geometric SVG icons.

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
| **Phase 2** | Domain Types & Local-First Storage Adapter (No Fake Data) | **READY** | Antigravity Agent |
| **Phase 3** | Quick Capture Module & Realistic Task Input Form | **PENDING** | Antigravity Agent |
| **Phase 4** | 24-Hour Focus Orbit Canvas Engine (Calculates Free Time & Realistic Next Task) | **PENDING** | Antigravity Agent |
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
* **Action:** Initialized Vite + TypeScript setup. Built mobile-first base HTML, Red/Black/Beige design system CSS variables (`#0D0D11`, `#16161B`, `#E52E2E`, `#F5EFEB`), CereBruv official mascot SVG component, and application shell. Created `AI_AGENT_CONTEXT.md`.
* **Next Action:** Phase 2 (Domain Types, `ITaskRepository`, and `LocalStorageAdapter`).

---

> **MANDATORY INSTRUCTION FOR THE NEXT AI AGENT:**
> Whenever you write or modify code in this repository:
> 1. Add an Entry in Section 6 above detailing what you changed.
> 2. Update the status column in Section 4.
> 3. Preserve this document's structure and rules.
