# CereBruv Automated Deployment Playbook (For AI Agents)

> **Audience:** AI Coding Assistants (Antigravity, Claude Code, Cursor, Copilot, etc.) and Developers.
> **Goal:** Deploy CereBruv to Google Firebase Hosting + Cloud Firestore in one pass without interactive stalls.

---

## 1. What Agent Needs To Know Before Starting
- **Framework:** Vite + TypeScript + Vanilla DOM.
- **Output Directory:** `dist/` (configured in [`firebase.json`](./firebase.json)).
- **Project Target:** `cere-bruv` (configured in [`.firebaserc`](./.firebaserc)).
- **Security Rules:** [`firestore.rules`](./firestore.rules) protects `users/{uid}/**`.
- **Zero Hallucination Policy:** Never invent demo data or overwrite user configs.

---

## 2. Autonomous Agent Execution Steps

### Step 1 — Check Dependencies & Install
Run non-interactive install:
```bash
npm install
```

### Step 2 — Verify Environment Variables (`.env`)
Inspect if `.env` exists in workspace root:
- If missing, copy from `.env.example`:
  ```bash
  # Windows PowerShell:
  Copy-Item -Path ".env.example" -Destination ".env"
  # Bash / Mac / Linux:
  cp .env.example .env
  ```
- **Agent Rule:** Ensure `VITE_FIREBASE_*` credentials match the target Firebase project. Vite bakes these keys into `dist/assets/*.js` during build.

### Step 3 — Typecheck & Build Production Bundle
Run strict typecheck and production bundling:
```bash
npx tsc --noEmit
npm run build
```
**Verification:**
- Command must exit with code `0`.
- Verify `dist/index.html` and `dist/assets/` exist.

### Step 4 — Check Firebase CLI Authentication
The agent should verify whether Firebase CLI is authenticated:
```bash
npx firebase-tools projects:list
```

**Two Execution Branches:**
- **Branch A (Already Logged In / CI Token present):**
  If `projects:list` outputs `cere-bruv` (or user project), proceed directly to Step 5.
- **Branch B (Not Logged In):**
  Agent must tell user:
  > *"Please run `npx firebase-tools login` in your terminal to authenticate with Google, then tell me to continue."*
  *(Agents cannot click Google OAuth consent windows automatically).*

### Step 5 — Deploy to Firebase
Run unattended deploy command:
```bash
npx firebase-tools deploy --non-interactive
```

If user only needs Hosting:
```bash
npx firebase-tools deploy --only hosting --non-interactive
```

If user only needs Firestore Rules:
```bash
npx firebase-tools deploy --only firestore:rules --non-interactive
```

---

## 3. Post-Deployment Verification Checklist (For Agent)

After deployment finishes, the agent should verify:
1. **Live URL:** Print the hosting URL (typically `https://cere-bruv.web.app` or `https://<project-id>.web.app`).
2. **Authorized Domains:** Remind user to check Firebase Console:
   - Go to: **Firebase Console → Authentication → Settings → Authorized domains**
   - Ensure the deployment domain (and `localhost`) is listed so Google Sign-In popups work.
3. **PWA Offline Service Worker:**
   - Verify `sw.js` is served at root: `https://<domain>/sw.js`.

---

## 4. Failure Mode Recovery Guide (For Agent)

| Error Code / Message | Root Cause | Automated Agent Remedy |
|---|---|---|
| `HTTP 401: Unauthorized / Missing credentials` | Firebase CLI session expired or missing | Run `npx firebase-tools login` or ask user for `FIREBASE_TOKEN`. |
| `Hosting directory 'dist' does not exist` | Deploy attempted before building | Run `npm run build` first, confirm `dist/index.html` exists, retry deploy. |
| `Missing or insufficient permissions (Firestore)` | Rules not deployed or user UID mismatch | Run `npx firebase-tools deploy --only firestore:rules --non-interactive`. |
| `Firebase App Check 401 on Gemini Vision (localhost)` | App Check requires production attestation | Cloud Vision activates automatically on `*.web.app`. For local dev, add `VITE_GEMINI_API_KEY` to `.env`. |
