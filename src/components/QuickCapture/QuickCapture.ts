import { noteRepository, taskRepository } from '../../services/storage';
import {
  screenshotScannerService,
  type ExtractedScreenshotTask,
} from '../../services/ai/ScreenshotScannerService';
import {
  voiceService,
  type PendingTaskDraft,
  type VoicePredictionGuide,
} from '../../services/voice/VoiceService';
import { notificationService } from '../../services/notifications/NotificationService';
import {
  extractLinksFromText,
  mergeSavedLinks,
  normalizeToSavedLink,
  openImageLightbox,
  openLiveCameraModal,
} from '../../utils/imageUtils';
import { eventBus, AppEvents } from '../../services/events';
import { CATEGORY_COLORS } from '../FocusOrbit/orbitCalculator';
import type { SavedLink, TaskCategory, UrgencyLevel } from '../../types/task';

export function renderQuickCapture(getSelectedDate?: () => string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'quick-capture-wrapper';
  container.style.position = 'relative';

  const resolveActiveDate = () => {
    if (getSelectedDate) return getSelectedDate();
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  container.innerHTML = `
    <div class="quick-capture-container">
      <div class="quick-capture-input-wrap" style="position: relative; flex: 1; display: flex; align-items: center; overflow: hidden;">
        <div id="quick-capture-ghost" aria-hidden="true" style="position: absolute; inset: 0; display: flex; align-items: center; pointer-events: none; white-space: pre; overflow: hidden; font-size: var(--font-size-sm); font-family: inherit;">
          <span id="ghost-mirror-text" style="color: transparent;"></span><span id="ghost-suffix-text" style="color: var(--color-red-primary); opacity: 0.55; font-weight: 600;"></span>
        </div>
        <input 
          type="text" 
          class="quick-capture-input" 
          id="quick-capture-input" 
          autocomplete="off"
          placeholder="Tap CereBruv above to speak, or type 'Add [Task] at [Time]'"
          style="position: relative; z-index: 2; background: transparent; width: 100%;"
        />
      </div>
      <button class="icon-btn" id="voice-guide-btn" title="Voice Command Rules & Voice Settings">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      <div style="position: relative; display: inline-flex;">
        <button class="icon-btn" id="photo-upload-btn" title="Upload Screenshot or Take Camera Photo (QR + OCR + AI)">
          <svg viewBox="0 0 24 24">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>

        <!-- 2-Option Chooser Menu: Upload Image vs Live Camera Capture -->
        <div id="photo-source-menu" style="display: none; position: absolute; top: calc(100% + 6px); right: 0; width: 220px; background: #FAF7F2; border: 1.5px solid var(--border-medium); border-radius: var(--radius-md); box-shadow: var(--shadow-float); padding: 6px; z-index: 40; flex-direction: column; gap: 4px;">
          <button type="button" id="menu-upload-photo-btn" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; border-radius: var(--radius-sm); background: var(--bg-surface-elevated); color: var(--color-black-dominant); font-family: inherit; font-size: 0.72rem; font-weight: 700; text-align: left; cursor: pointer;">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="var(--color-red-primary)" fill="none" stroke-width="2.2" style="flex-shrink: 0;">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <div style="display: flex; flex-direction: column; line-height: 1.2;">
              <span>Upload Screenshot / File</span>
              <span style="font-size: 0.6rem; font-weight: 600; color: var(--color-black-muted);">Gallery image or Ctrl+V paste</span>
            </div>
          </button>

          <button type="button" id="menu-live-camera-btn" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; border-radius: var(--radius-sm); background: var(--bg-surface-elevated); color: var(--color-black-dominant); font-family: inherit; font-size: 0.72rem; font-weight: 700; text-align: left; cursor: pointer;">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="var(--color-red-primary)" fill="none" stroke-width="2.2" style="flex-shrink: 0;">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
            <div style="display: flex; flex-direction: column; line-height: 1.2;">
              <span>Take Camera Photo</span>
              <span style="font-size: 0.6rem; font-weight: 600; color: var(--color-black-muted);">Snap poster, board, or QR code</span>
            </div>
          </button>
        </div>
      </div>
      <input type="file" id="photo-file-input" accept="image/*" style="display: none;" />
    </div>

    <!-- Simultaneous Predictive + Step-by-Step Syntax Guide Bar -->
    <div id="live-syntax-guide-bar" style="display: none; flex-direction: column; gap: 6px; margin-top: 6px; padding: 8px 10px; border-radius: var(--radius-sm); background: rgba(229, 46, 46, 0.06); border: 1px dashed rgba(229, 46, 46, 0.4); font-size: 0.7rem; color: var(--color-black-dominant);">
      <!-- Step-by-Step Syntax Progression Row -->
      <div id="live-syntax-steps" style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;"></div>

      <!-- Template & Next Instruction Row -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
          <span style="font-weight: 800; color: var(--color-red-primary); text-transform: uppercase; font-size: 0.62rem; letter-spacing: 0.04em;">SYNTAX:</span>
          <code id="live-syntax-template" style="font-weight: 700; color: var(--color-black-dominant); font-family: inherit;">Add [Task Name] at [Time]</code>
        </div>
        <span id="live-syntax-next" style="font-size: 0.65rem; font-weight: 700; color: var(--color-red-primary);"></span>
      </div>

      <!-- 1-Tap Predictive Autocomplete Chips Row -->
      <div id="live-prediction-row" style="display: none; align-items: center; gap: 5px; flex-wrap: wrap; padding-top: 4px; border-top: 1px solid rgba(229, 46, 46, 0.15);"></div>
    </div>

    <!-- In-App Voice Command Rules & Voice Settings Guide (Strictly No Fake/Demo Data) -->
    <div id="voice-guide-drawer" style="display: none; margin-top: var(--spacing-2); background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--spacing-3);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--color-red-primary);"></span>
          <strong style="font-size: var(--font-size-xs); color: var(--color-black-dominant); text-transform: uppercase; letter-spacing: 0.05em;">
            "Hey Bruv" Voice Keyword Guide
          </strong>
        </div>
        <button id="voice-guide-close" class="icon-btn" style="width: 22px; height: 22px; font-size: 1rem; border: none; background: transparent; cursor: pointer;">&times;</button>
      </div>
      <p style="font-size: 0.72rem; color: var(--color-black-muted); margin-bottom: var(--spacing-2); line-height: 1.35;">
        Tap the <strong>CereBruv Avatar</strong> above to speak, or type using these keyword rules:
      </p>

      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--spacing-3);">
        <div class="voice-rule-row" data-prefix="Hey Bruv, what's my schedule?" style="display: flex; flex-direction: column; background: var(--bg-surface-elevated); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); cursor: pointer;">
          <strong style="font-size: 0.72rem; color: var(--color-black-dominant);">1. Check Schedule</strong>
          <span style="font-size: 0.68rem; color: var(--color-black-muted);">Say: <code>"Hey Bruv, what's my schedule?"</code></span>
        </div>

        <div class="voice-rule-row" data-prefix="Hey Bruv, add " style="display: flex; flex-direction: column; background: var(--bg-surface-elevated); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); cursor: pointer;">
          <strong style="font-size: 0.72rem; color: var(--color-black-dominant);">2. Schedule a Task</strong>
          <span style="font-size: 0.68rem; color: var(--color-black-muted);">Say: <code>"Hey Bruv, add [Task Name] at [Time] for [Duration]"</code></span>
        </div>

        <div class="voice-rule-row" data-prefix="Hey Bruv, done with " style="display: flex; flex-direction: column; background: var(--bg-surface-elevated); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); cursor: pointer;">
          <strong style="font-size: 0.72rem; color: var(--color-black-dominant);">3. Complete a Task (+25 XP)</strong>
          <span style="font-size: 0.68rem; color: var(--color-black-muted);">Say: <code>"Hey Bruv, done with [Task Name]"</code></span>
        </div>

        <div class="voice-rule-row" data-prefix="Hey Bruv, note " style="display: flex; flex-direction: column; background: var(--bg-surface-elevated); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); cursor: pointer;">
          <strong style="font-size: 0.72rem; color: var(--color-black-dominant);">4. Save a Brain-Dump Note</strong>
          <span style="font-size: 0.68rem; color: var(--color-black-muted);">Say: <code>"Hey Bruv, note [Your Thought]"</code></span>
        </div>

        <div class="voice-rule-row" data-prefix="Hey Bruv, open " style="display: flex; flex-direction: column; background: var(--bg-surface-elevated); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); cursor: pointer;">
          <strong style="font-size: 0.72rem; color: var(--color-black-dominant);">5. Switch View Tab</strong>
          <span style="font-size: 0.68rem; color: var(--color-black-muted);">Say: <code>"Hey Bruv, open [orbit | tasks | thoughts | graph | cloud]"</code></span>
        </div>
      </div>

      <!-- Voice Clarity Selector -->
      <div style="border-top: 1px solid var(--border-subtle); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
        <label for="bruv-voice-select" style="font-size: 0.68rem; font-weight: 700; color: var(--color-black-soft); text-transform: uppercase;">
          CereBruv Talk-Back Voice:
        </label>
        <div style="display: flex; gap: 6px; align-items: center;">
          <select id="bruv-voice-select" style="flex: 1; padding: 5px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-surface-elevated); font-size: 0.72rem; color: var(--color-black-dominant); font-family: inherit;"></select>
          <button id="bruv-voice-test" class="pill-badge" style="cursor: pointer; font-size: 0.68rem; padding: 5px 10px; border: 1px solid var(--color-black-dominant); background: var(--color-black-dominant); color: #FAF7F2;">
            Test Voice
          </button>
        </div>
      </div>
    </div>

    <!-- Interactive Voice Task Clarification Drawer (Category, Duration, Priority) -->
    <div id="voice-clarify-drawer" style="display: none; margin-top: var(--spacing-2); background: var(--bg-primary); border: 1.5px solid rgba(229, 46, 46, 0.35); border-radius: var(--radius-md); padding: var(--spacing-3); box-shadow: var(--shadow-card);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--color-red-primary);"></span>
          <strong id="clarify-task-heading" style="font-size: var(--font-size-xs); color: var(--color-black-dominant); text-transform: uppercase; letter-spacing: 0.04em;">
            Confirm Task Details
          </strong>
        </div>
        <button id="clarify-cancel-btn" class="icon-btn" style="width: 22px; height: 22px; font-size: 1rem; border: none; background: transparent; cursor: pointer;" title="Cancel">&times;</button>
      </div>

      <!-- Category Chips (Links directly to Mind Graph & Orbit Arc Color) -->
      <div style="margin-bottom: 8px;">
        <div style="font-size: 0.65rem; font-weight: 700; color: var(--color-black-muted); text-transform: uppercase; margin-bottom: 4px;">
          1. Category (Orbit Color & Mind Graph Node)
        </div>
        <div id="clarify-category-row" style="display: flex; gap: 5px; flex-wrap: wrap;">
          <button type="button" class="pill-badge clarify-cat-chip" data-cat="study" style="cursor: pointer; font-size: 0.68rem;">Study</button>
          <button type="button" class="pill-badge clarify-cat-chip" data-cat="work" style="cursor: pointer; font-size: 0.68rem;">Work</button>
          <button type="button" class="pill-badge clarify-cat-chip" data-cat="personal" style="cursor: pointer; font-size: 0.68rem;">Personal</button>
          <button type="button" class="pill-badge clarify-cat-chip" data-cat="event" style="cursor: pointer; font-size: 0.68rem;">Event</button>
          <button type="button" class="pill-badge clarify-cat-chip" data-cat="rest" style="cursor: pointer; font-size: 0.68rem;">Rest</button>
        </div>
      </div>

      <!-- Duration Chips -->
      <div style="margin-bottom: 8px;">
        <div style="font-size: 0.65rem; font-weight: 700; color: var(--color-black-muted); text-transform: uppercase; margin-bottom: 4px;">
          2. Duration
        </div>
        <div id="clarify-duration-row" style="display: flex; gap: 5px; flex-wrap: wrap;">
          <button type="button" class="pill-badge clarify-dur-chip" data-dur="30" style="cursor: pointer; font-size: 0.68rem;">30m</button>
          <button type="button" class="pill-badge clarify-dur-chip" data-dur="45" style="cursor: pointer; font-size: 0.68rem;">45m</button>
          <button type="button" class="pill-badge clarify-dur-chip" data-dur="60" style="cursor: pointer; font-size: 0.68rem;">1h (60m)</button>
          <button type="button" class="pill-badge clarify-dur-chip" data-dur="90" style="cursor: pointer; font-size: 0.68rem;">1.5h (90m)</button>
          <button type="button" class="pill-badge clarify-dur-chip" data-dur="120" style="cursor: pointer; font-size: 0.68rem;">2h (120m)</button>
        </div>
      </div>

      <!-- Priority / Urgency Chips -->
      <div style="margin-bottom: 10px;">
        <div style="font-size: 0.65rem; font-weight: 700; color: var(--color-black-muted); text-transform: uppercase; margin-bottom: 4px;">
          3. Urgency / Priority
        </div>
        <div id="clarify-urgency-row" style="display: flex; gap: 5px; flex-wrap: wrap;">
          <button type="button" class="pill-badge clarify-urg-chip" data-urg="low" style="cursor: pointer; font-size: 0.68rem;">Low</button>
          <button type="button" class="pill-badge clarify-urg-chip" data-urg="medium" style="cursor: pointer; font-size: 0.68rem;">Medium</button>
          <button type="button" class="pill-badge clarify-urg-chip" data-urg="high" style="cursor: pointer; font-size: 0.68rem;">High (Priority)</button>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span style="font-size: 0.65rem; color: var(--color-black-muted);">
          Tip: Tap chips or say <code>"Work, 30 mins, high"</code>
        </span>
        <button type="button" id="clarify-confirm-btn" class="btn btn-primary" style="padding: 6px 14px; font-size: var(--font-size-xs);">
          Schedule to Orbit & Graph
        </button>
      </div>
    </div>

    <!-- Newly Saved Note / Idea Category & Priority Dropdown Bar (No Alarms or Deadlines) -->
    <div id="quick-note-meta-bar" style="display: none; margin-top: var(--spacing-2); background: #FFFDF9; border: 1.5px dashed var(--border-medium); border-radius: var(--radius-md); padding: 10px 12px; box-shadow: var(--shadow-card);">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
          <span style="font-size: 0.6rem; font-weight: 800; padding: 2px 7px; border-radius: 999px; background: var(--color-black-dominant); color: #FAF7F2; text-transform: uppercase;">IDEA SAVED</span>
          <strong id="quick-note-meta-title" style="font-size: var(--font-size-xs); color: var(--color-black-dominant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></strong>
        </div>
        <button type="button" id="quick-note-meta-done" class="pill-badge" style="cursor: pointer; font-size: 0.65rem; background: var(--color-red-primary); color: #FFFFFF; border: none; padding: 3px 10px;">Done</button>
      </div>
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <label style="display: flex; align-items: center; gap: 5px; font-size: 0.65rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">
          Category:
          <select id="quick-note-cat-select" style="padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.72rem; font-weight: 700; color: var(--color-black-dominant); cursor: pointer;">
            <option value="personal">Personal</option>
            <option value="work">Work</option>
            <option value="study">Study</option>
            <option value="event">Event</option>
            <option value="rest">Rest</option>
          </select>
        </label>
        <label style="display: flex; align-items: center; gap: 5px; font-size: 0.65rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">
          Priority:
          <select id="quick-note-prio-select" style="padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.72rem; font-weight: 700; color: var(--color-black-dominant); cursor: pointer;">
            <option value="high">High Priority</option>
            <option value="medium" selected>Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </label>
      </div>
    </div>

    <!-- Extracted Tasks Confirmation Drawer/Panel -->
    <div id="ai-task-proposals" style="display: none; margin-top: var(--spacing-2); background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--spacing-3);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-2);">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--color-red-primary);"></span>
          <strong style="font-size: var(--font-size-xs); color: var(--color-black-dominant); text-transform: uppercase; letter-spacing: 0.05em;" id="ai-proposal-title">
            Gemini Extracted Tasks
          </strong>
        </div>
        <button id="ai-proposal-close" class="icon-btn" style="width: 22px; height: 22px; font-size: 1rem; border: none; background: transparent; cursor: pointer;">&times;</button>
      </div>
      <p style="font-size: var(--font-size-xs); color: var(--color-black-muted); margin-bottom: var(--spacing-2);" id="ai-proposal-sub">
        Tap any task below to schedule it directly to your Focus Orbit.
      </p>
      <div id="ai-proposal-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
    </div>
  `;

  const inputEl = container.querySelector<HTMLInputElement>('#quick-capture-input')!;
  const ghostMirrorEl = container.querySelector<HTMLSpanElement>('#ghost-mirror-text')!;
  const ghostSuffixEl = container.querySelector<HTMLSpanElement>('#ghost-suffix-text')!;
  const guideBtn = container.querySelector<HTMLButtonElement>('#voice-guide-btn')!;
  const photoBtn = container.querySelector<HTMLButtonElement>('#photo-upload-btn')!;
  const fileInput = container.querySelector<HTMLInputElement>('#photo-file-input')!;

  const liveSyntaxBar = container.querySelector<HTMLDivElement>('#live-syntax-guide-bar')!;
  const liveSyntaxSteps = container.querySelector<HTMLDivElement>('#live-syntax-steps')!;
  const liveSyntaxTemplate = container.querySelector<HTMLElement>('#live-syntax-template')!;
  const liveSyntaxNext = container.querySelector<HTMLElement>('#live-syntax-next')!;
  const livePredictionRow = container.querySelector<HTMLDivElement>('#live-prediction-row')!;

  let currentActiveHint: VoicePredictionGuide | null = null;

  function applyPredictionChip(insertText: string, replaceInput?: boolean) {
    if (replaceInput) {
      inputEl.value = insertText;
    } else {
      const base = inputEl.value.endsWith(' ') || !inputEl.value ? inputEl.value : `${inputEl.value} `;
      inputEl.value = `${base}${insertText}`;
    }
    inputEl.focus();
    voiceService.setLiveTranscriptFromInput(inputEl.value);
    const updatedHint = voiceService.getLiveSyntaxTemplate(inputEl.value);
    updateSyntaxBar(updatedHint);
  }

  function updateSyntaxBar(hint: VoicePredictionGuide | null) {
    currentActiveHint = hint;
    if (!hint) {
      liveSyntaxBar.style.display = 'none';
      ghostMirrorEl.textContent = '';
      ghostSuffixEl.textContent = '';
      inputEl.placeholder = "Tap CereBruv above to speak, or type 'Add [Task] at [Time]'";
      return;
    }

    liveSyntaxBar.style.display = 'flex';
    liveSyntaxTemplate.textContent = hint.template;
    liveSyntaxNext.textContent = hint.nextPart;

    // 1. Update Inline Ghost Prediction right inside the input field
    const currentVal = inputEl.value;
    if (currentVal) {
      ghostMirrorEl.textContent = currentVal;
      ghostSuffixEl.textContent = hint.ghostSuffix || '';
    } else if (voiceService.isListening()) {
      inputEl.placeholder = '';
      ghostMirrorEl.textContent = '';
      ghostSuffixEl.textContent = hint.ghostSuffix || 'Add [Task Name] at [8:00 AM] for [45 mins]';
    } else {
      ghostMirrorEl.textContent = '';
      ghostSuffixEl.textContent = '';
      inputEl.placeholder = "Tap CereBruv above to speak, or type 'Add [Task] at [Time]'";
    }

    // 2. Render Step-by-Step Syntax Guide Progression
    if (hint.steps && hint.steps.length > 0) {
      liveSyntaxSteps.style.display = 'flex';
      liveSyntaxSteps.innerHTML = hint.steps
        .map((step, idx) => {
          const isDone = step.status === 'done';
          const isActive = step.status === 'active';
          const bg = isDone
            ? 'rgba(16, 185, 129, 0.14)'
            : isActive
              ? 'var(--color-red-primary)'
              : 'rgba(18, 18, 22, 0.06)';
          const col = isDone
            ? '#047857'
            : isActive
              ? '#FFFFFF'
              : 'var(--color-black-muted)';
          const arrow = idx < hint.steps.length - 1
            ? `<span style="color: var(--color-black-faint); font-size: 0.6rem;">→</span>`
            : '';
          return `
            <span style="padding: 2px 7px; border-radius: 999px; background: ${bg}; color: ${col}; font-size: 0.62rem; font-weight: ${isActive || isDone ? '800' : '600'};">
              ${isActive ? '⬅ ' : ''}${step.label}
            </span>
            ${arrow}
          `;
        })
        .join('');
    } else {
      liveSyntaxSteps.style.display = 'none';
    }

    // 3. Render 1-Tap Predictive Autocomplete Chips
    if (hint.predictions && hint.predictions.length > 0) {
      livePredictionRow.style.display = 'flex';
      livePredictionRow.innerHTML = `
        <span style="font-size: 0.6rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">PREDICT:</span>
      `;
      hint.predictions.forEach((pred, index) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.style.cssText = `
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid ${index === 0 ? 'var(--color-red-primary)' : 'var(--border-medium)'};
          background: ${index === 0 ? 'rgba(229, 46, 46, 0.12)' : 'var(--bg-surface)'};
          color: ${index === 0 ? 'var(--color-red-primary)' : 'var(--color-black-dominant)'};
          font-size: 0.65rem;
          font-weight: 700;
          cursor: pointer;
        `;
        chip.textContent = index === 0 ? `${pred.label} ↹` : pred.label;
        chip.addEventListener('mousedown', (e) => {
          e.preventDefault(); // Keep input focused
          applyPredictionChip(pred.insertText, pred.replaceInput);
        });
        livePredictionRow.appendChild(chip);
      });
    } else {
      livePredictionRow.style.display = 'none';
    }
  }

  eventBus.on(AppEvents.VOICE_SYNTAX_HINT, (hint: VoicePredictionGuide | null) => {
    updateSyntaxBar(hint);
  });

  const guideDrawer = container.querySelector<HTMLDivElement>('#voice-guide-drawer')!;
  const guideClose = container.querySelector<HTMLButtonElement>('#voice-guide-close')!;
  const voiceSelect = container.querySelector<HTMLSelectElement>('#bruv-voice-select')!;
  const voiceTestBtn = container.querySelector<HTMLButtonElement>('#bruv-voice-test')!;

  const clarifyDrawer = container.querySelector<HTMLDivElement>('#voice-clarify-drawer')!;
  const clarifyHeading = container.querySelector<HTMLElement>('#clarify-task-heading')!;
  const clarifyCancelBtn = container.querySelector<HTMLButtonElement>('#clarify-cancel-btn')!;
  const clarifyConfirmBtn = container.querySelector<HTMLButtonElement>('#clarify-confirm-btn')!;

  const quickNoteMetaBar = container.querySelector<HTMLDivElement>('#quick-note-meta-bar')!;
  const quickNoteMetaTitle = container.querySelector<HTMLElement>('#quick-note-meta-title')!;
  const quickNoteCatSelect = container.querySelector<HTMLSelectElement>('#quick-note-cat-select')!;
  const quickNotePrioSelect = container.querySelector<HTMLSelectElement>('#quick-note-prio-select')!;
  const quickNoteMetaDone = container.querySelector<HTMLButtonElement>('#quick-note-meta-done')!;
  let activeQuickNoteId: string | null = null;

  eventBus.on(AppEvents.NOTE_CREATED, (savedNote?: any) => {
    if (savedNote && savedNote.id) {
      activeQuickNoteId = savedNote.id;
      quickNoteMetaTitle.textContent = `"${savedNote.content}"`;
      quickNoteCatSelect.value = savedNote.category || (savedNote.tags && savedNote.tags[0]) || 'personal';
      quickNotePrioSelect.value = savedNote.priority || 'medium';
      quickNoteMetaBar.style.display = 'block';
    }
  });

  quickNoteCatSelect.addEventListener('change', async () => {
    if (!activeQuickNoteId) return;
    const cat = quickNoteCatSelect.value as TaskCategory;
    await noteRepository.updateNote(activeQuickNoteId, { category: cat, tags: [cat] });
    eventBus.emit(AppEvents.NOTE_UPDATED);
  });

  quickNotePrioSelect.addEventListener('change', async () => {
    if (!activeQuickNoteId) return;
    const prio = quickNotePrioSelect.value as UrgencyLevel;
    await noteRepository.updateNote(activeQuickNoteId, { priority: prio });
    eventBus.emit(AppEvents.NOTE_UPDATED);
  });

  quickNoteMetaDone.addEventListener('click', () => {
    quickNoteMetaBar.style.display = 'none';
    activeQuickNoteId = null;
  });

  function renderClarifyDrawer(draft: PendingTaskDraft | null) {
    if (!draft) {
      clarifyDrawer.style.display = 'none';
      return;
    }

    clarifyDrawer.style.display = 'block';
    clarifyHeading.textContent = `"${draft.title}" at ${draft.startTime}`;

    container.querySelectorAll<HTMLButtonElement>('.clarify-cat-chip').forEach(btn => {
      const cat = btn.getAttribute('data-cat') as TaskCategory;
      const isSel = cat === draft.category;
      const col = CATEGORY_COLORS[cat] || '#E52E2E';
      btn.style.background = isSel ? col : 'var(--bg-surface-elevated)';
      btn.style.color = isSel ? '#FFFFFF' : 'var(--color-black-soft)';
      btn.style.borderColor = isSel ? col : 'var(--border-medium)';
    });

    container.querySelectorAll<HTMLButtonElement>('.clarify-dur-chip').forEach(btn => {
      const dur = parseInt(btn.getAttribute('data-dur') || '60', 10);
      const isSel = dur === draft.durationMinutes;
      btn.style.background = isSel ? 'var(--color-black-dominant)' : 'var(--bg-surface-elevated)';
      btn.style.color = isSel ? '#FAF7F2' : 'var(--color-black-soft)';
      btn.style.borderColor = isSel ? 'var(--color-black-dominant)' : 'var(--border-medium)';
    });

    container.querySelectorAll<HTMLButtonElement>('.clarify-urg-chip').forEach(btn => {
      const urg = btn.getAttribute('data-urg') as UrgencyLevel;
      const isSel = urg === draft.urgency;
      btn.style.background = isSel
        ? urg === 'high'
          ? 'var(--color-red-primary)'
          : 'var(--color-black-dominant)'
        : 'var(--bg-surface-elevated)';
      btn.style.color = isSel ? '#FFFFFF' : 'var(--color-black-soft)';
      btn.style.borderColor = isSel
        ? urg === 'high'
          ? 'var(--color-red-primary)'
          : 'var(--color-black-dominant)'
        : 'var(--border-medium)';
    });
  }

  eventBus.on(AppEvents.VOICE_CLARIFY_TASK, (draft: PendingTaskDraft | null) => {
    renderClarifyDrawer(draft);
  });

  container.querySelectorAll<HTMLButtonElement>('.clarify-cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-cat') as TaskCategory;
      voiceService.updatePendingTaskDraft({ category: cat, categorySpecified: true });
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.clarify-dur-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const dur = parseInt(btn.getAttribute('data-dur') || '60', 10);
      voiceService.updatePendingTaskDraft({ durationMinutes: dur, durationSpecified: true });
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.clarify-urg-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const urg = btn.getAttribute('data-urg') as UrgencyLevel;
      voiceService.updatePendingTaskDraft({ urgency: urg, urgencySpecified: true });
    });
  });

  clarifyCancelBtn.addEventListener('click', () => {
    voiceService.cancelPendingTaskDraft();
  });

  clarifyConfirmBtn.addEventListener('click', async () => {
    await voiceService.confirmPendingTaskDraft(resolveActiveDate());
  });

  const proposalsBox = container.querySelector<HTMLDivElement>('#ai-task-proposals')!;
  const proposalTitle = container.querySelector<HTMLElement>('#ai-proposal-title')!;
  const proposalSub = container.querySelector<HTMLElement>('#ai-proposal-sub')!;
  const proposalList = container.querySelector<HTMLDivElement>('#ai-proposal-list')!;
  const proposalClose = container.querySelector<HTMLButtonElement>('#ai-proposal-close')!;

  proposalClose.addEventListener('click', () => {
    proposalsBox.style.display = 'none';
    proposalList.innerHTML = '';
  });

  function populateVoiceDropdown() {
    const voices = voiceService.getEnglishVoices();
    const preferred = voiceService.getPreferredVoice();
    voiceSelect.innerHTML = '';

    if (voices.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Default Browser Voice';
      voiceSelect.appendChild(opt);
      return;
    }

    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (preferred && v.voiceURI === preferred.voiceURI) {
        opt.selected = true;
      }
      voiceSelect.appendChild(opt);
    });
  }

  guideBtn.addEventListener('click', () => {
    const isHidden = guideDrawer.style.display === 'none';
    guideDrawer.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      populateVoiceDropdown();
    }
  });

  guideClose.addEventListener('click', () => {
    guideDrawer.style.display = 'none';
  });

  eventBus.on(AppEvents.VOICE_STATE_CHANGED, () => {
    if (guideDrawer.style.display !== 'none' && voiceSelect.options.length <= 1) {
      populateVoiceDropdown();
    }
  });

  voiceSelect.addEventListener('change', () => {
    if (voiceSelect.value) {
      voiceService.setPreferredVoiceURI(voiceSelect.value);
      voiceService.speak('I got you, Bruv. Voice updated and ready.', true);
    }
  });

  voiceTestBtn.addEventListener('click', () => {
    voiceService.speak("I got you, Bruv. Think it through, CereBruv's got you.", true);
  });

  // Clicking a rule row only pre-fills the command prefix into the input box (never creates fake data)
  container.querySelectorAll<HTMLDivElement>('.voice-rule-row').forEach(row => {
    row.addEventListener('click', () => {
      const prefix = row.getAttribute('data-prefix') || '';
      inputEl.value = prefix;
      inputEl.focus();
    });
  });

  // Show predictive + guiding bar immediately on focus or while typing/speaking
  inputEl.addEventListener('focus', () => {
    const hint = voiceService.getLiveSyntaxTemplate(inputEl.value);
    updateSyntaxBar(hint);
  });

  inputEl.addEventListener('input', () => {
    const val = inputEl.value;
    voiceService.setLiveTranscriptFromInput(val);
    const hint = voiceService.getLiveSyntaxTemplate(val);
    updateSyntaxBar(hint);
  });

  inputEl.addEventListener('blur', () => {
    setTimeout(() => {
      if (!voiceService.isListening() && !inputEl.value.trim() && document.activeElement !== inputEl) {
        updateSyntaxBar(null);
      }
    }, 150);
  });

  // Handle Typed Input Submission & Tab Autocomplete
  inputEl.addEventListener('keydown', async (e) => {
    if (e.key === 'Tab' && currentActiveHint && currentActiveHint.predictions.length > 0) {
      e.preventDefault();
      const topPred = currentActiveHint.predictions[0];
      applyPredictionChip(topPred.insertText, topPred.replaceInput);
      return;
    }

    if (e.key === 'Enter' && inputEl.value.trim()) {
      if (voiceService.isListening()) {
        voiceService.stopListening();
        return;
      }
      const text = inputEl.value.trim();
      inputEl.value = '';
      updateSyntaxBar(null);
      inputEl.disabled = true;

      if (voiceService.isCommandPhrase(text)) {
        const outcome = await voiceService.executeVoiceCommand(text, resolveActiveDate());
        inputEl.disabled = false;
        inputEl.placeholder = outcome.headline;
      } else {
        const detectedNoteLinks = extractLinksFromText(text);
        const savedNote = await noteRepository.createNote({
          content: text,
          tags: ['personal'],
          category: 'personal',
          priority: 'medium',
          ...(detectedNoteLinks.length > 0 ? { links: detectedNoteLinks } : {}),
        });
        eventBus.emit(AppEvents.NOTE_CREATED, savedNote);
        const spoken = `Got it, Bruv. Saved "${text}" to your Thoughts.`;
        eventBus.emit(AppEvents.MASCOT_SPEAK, {
          headline: `Saved idea: "${text}"`,
          subspeech: 'Use the Category and Priority dropdowns below to tag its importance.',
        });
        voiceService.speak(spoken);
        inputEl.disabled = false;
        inputEl.placeholder = 'Saved to Thoughts! Type another...';
      }

      setTimeout(() => {
        inputEl.placeholder = "Tap CereBruv above to speak, or type 'Add [Task] at [Time]'";
      }, 3000);
    }
  });

  // Handle Screenshot / Photo Upload, Live Camera & Clipboard Paste -> Zero-Hallucination AI Task + QR/Link Rescue
  function formatTime12(time24: string): string {
    if (!time24) return '';
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr || '0', 10);
    const m = parseInt(mStr || '0', 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function escapeAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function processUploadedScreenshot(file: File) {
    proposalsBox.style.display = 'block';
    proposalTitle.textContent = 'Scanning Image & QR Codes...';
    proposalSub.textContent = `Reading "${file.name}" for exact text, deadlines, links & QR codes...`;
    proposalList.innerHTML = `
      <div id="scan-live-status" style="font-size: var(--font-size-xs); color: var(--color-black-muted); padding: 12px 0; text-align: center; font-weight: 600;">
        Preparing image, decoding QR codes & reading text...
      </div>
    `;

    try {
      const scanResult = await screenshotScannerService.scanScreenshot(file, '', (statusText) => {
        const statusEl = proposalList.querySelector<HTMLElement>('#scan-live-status');
        if (statusEl) statusEl.textContent = statusText;
      });

      let currentTasks: ExtractedScreenshotTask[] = [...scanResult.tasks];
      let currentLinks: SavedLink[] = [...(scanResult.links || [])];
      const qrOnlyLinks: SavedLink[] = currentLinks.filter(l => l.kind === 'qr');

      const engineBadgeLabel =
        scanResult.engine === 'gemini-vision'
          ? 'Google Gemini 2.5 Vision'
          : scanResult.engine === 'offline-ocr'
            ? 'On-Device Offline OCR + QR Scanner'
            : 'Smart Image Rescue';

      const renderScreenshotRescueUI = () => {
        proposalTitle.textContent = `Image Rescue • ${currentTasks.length} Suggestion${currentTasks.length === 1 ? '' : 's'}${currentLinks.length > 0 ? ` • ${currentLinks.length} Link${currentLinks.length === 1 ? '' : 's'}` : ''}`;
        proposalSub.textContent = `Engine: ${engineBadgeLabel} — Fields not present in the image are left blank.`;
        proposalList.innerHTML = '';

        // 1. Screenshot Preview + Editable Text + Saved Links/QR Bar + Save as Idea Card
        const defaultIdeaCat = currentTasks[0]?.category || 'work';
        const defaultIdeaPrio = currentTasks[0]?.urgency || 'high';
        const previewCard = document.createElement('div');
        previewCard.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #FFFDF9;
          border: 1.5px dashed var(--border-medium);
          border-radius: var(--radius-md);
          padding: 10px;
          margin-bottom: 6px;
        `;

        const linksSectionHtml = `
          <div style="display: flex; flex-direction: column; gap: 5px; padding-top: 6px; border-top: 1px solid var(--border-subtle);">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
              <span style="font-size: 0.6rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">
                Saved Links & QR Codes (${currentLinks.length}):
              </span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <input
                  type="text"
                  id="manual-link-add-input"
                  placeholder="Paste URL or bit.ly/..."
                  style="padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.64rem; width: 135px; font-family: inherit;"
                />
                <button type="button" id="manual-link-add-btn" class="pill-badge" style="cursor: pointer; font-size: 0.6rem; padding: 2px 7px;">
                  + Save Link
                </button>
              </div>
            </div>
            <div id="scan-links-pills-wrap" style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
              ${
                currentLinks.length === 0
                  ? `<span style="font-size: 0.64rem; color: var(--color-black-faint);">No links or QR codes detected — paste one above if needed.</span>`
                  : currentLinks
                      .map(
                        (lnk, lIdx) => `
                        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 999px; background: rgba(229,46,46,0.09); border: 1px solid rgba(229,46,46,0.34); font-size: 0.64rem; font-weight: 800;">
                          <a href="${escapeAttr(lnk.url)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeAttr(lnk.url)}" style="color: #C81E1E; text-decoration: none;">
                            ${escapeAttr(lnk.label)} ↗
                          </a>
                          <button type="button" class="remove-scan-link-btn" data-link-idx="${lIdx}" title="Remove link" style="border: none; background: transparent; color: var(--color-black-muted); font-size: 0.75rem; line-height: 1; cursor: pointer; padding: 0 1px;">&times;</button>
                        </span>
                      `
                      )
                      .join('')
              }
            </div>
          </div>
        `;

        previewCard.innerHTML = `
          <div style="display: flex; gap: 10px; align-items: flex-start;">
            <div id="screenshot-thumb-wrap" title="Click to zoom image full-screen" style="position: relative; width: 74px; height: 74px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-medium); cursor: pointer; flex-shrink: 0; background: #121216;">
              <img src="${scanResult.photoDataUrl}" alt="Captured Image" style="width: 100%; height: 100%; object-fit: cover;" />
              <span style="position: absolute; bottom: 0; inset-inline: 0; background: rgba(18,18,22,0.75); color: #FFFFFF; font-size: 0.55rem; font-weight: 800; text-align: center; padding: 2px 0;">
                ZOOM
              </span>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
                <span style="font-size: 0.62rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">
                  Extracted Text (Editable):
                </span>
                <button type="button" id="rescan-text-btn" class="pill-badge" style="cursor: pointer; font-size: 0.6rem; padding: 2px 7px;" title="Re-extract tasks & links from edited text">
                  Re-Parse Text
                </button>
              </div>
              <textarea id="screenshot-ocr-textarea" rows="2" placeholder="Extracted text from image..." style="width: 100%; padding: 5px 7px; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-surface); font-family: inherit; font-size: 0.72rem; color: var(--color-black-dominant); resize: vertical;">${escapeAttr(scanResult.rawText || scanResult.suggestedNoteSummary)}</textarea>
            </div>
          </div>

          ${linksSectionHtml}

          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; padding-top: 6px; border-top: 1px solid var(--border-subtle);">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 3px; font-size: 0.6rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">
                Idea Cat:
                <select id="screenshot-note-cat" style="padding: 2px 5px; border-radius: 4px; border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.66rem; font-weight: 700;">
                  <option value="study" ${defaultIdeaCat === 'study' ? 'selected' : ''}>Study</option>
                  <option value="work" ${defaultIdeaCat === 'work' ? 'selected' : ''}>Work</option>
                  <option value="personal" ${defaultIdeaCat === 'personal' ? 'selected' : ''}>Personal</option>
                  <option value="event" ${defaultIdeaCat === 'event' ? 'selected' : ''}>Event</option>
                  <option value="rest" ${defaultIdeaCat === 'rest' ? 'selected' : ''}>Rest</option>
                </select>
              </label>
              <label style="display: flex; align-items: center; gap: 3px; font-size: 0.6rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">
                Importance:
                <select id="screenshot-note-prio" style="padding: 2px 5px; border-radius: 4px; border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.66rem; font-weight: 700;">
                  <option value="high" ${defaultIdeaPrio === 'high' ? 'selected' : ''}>High Priority</option>
                  <option value="medium" ${defaultIdeaPrio === 'medium' ? 'selected' : ''}>Medium Priority</option>
                  <option value="low" ${defaultIdeaPrio === 'low' ? 'selected' : ''}>Low Priority</option>
                </select>
              </label>
            </div>
            <button type="button" id="save-screenshot-note-btn" class="pill-badge" style="cursor: pointer; background: var(--color-black-dominant); color: #FAF7F2; border: none; font-size: 0.65rem; font-weight: 700; padding: 4px 10px;">
              Save Image & Links to Thoughts
            </button>
          </div>
        `;

        const ocrTextarea = previewCard.querySelector<HTMLTextAreaElement>('#screenshot-ocr-textarea')!;
        const noteCatSelect = previewCard.querySelector<HTMLSelectElement>('#screenshot-note-cat')!;
        const notePrioSelect = previewCard.querySelector<HTMLSelectElement>('#screenshot-note-prio')!;
        const saveNoteBtn = previewCard.querySelector<HTMLButtonElement>('#save-screenshot-note-btn')!;
        const rescanBtn = previewCard.querySelector<HTMLButtonElement>('#rescan-text-btn')!;
        const manualLinkInput = previewCard.querySelector<HTMLInputElement>('#manual-link-add-input')!;
        const manualLinkBtn = previewCard.querySelector<HTMLButtonElement>('#manual-link-add-btn')!;

        previewCard.querySelector('#screenshot-thumb-wrap')?.addEventListener('click', () => {
          openImageLightbox(scanResult.photoDataUrl, ocrTextarea.value || file.name);
        });

        const handleAddManualLink = () => {
          const raw = manualLinkInput.value.trim();
          if (!raw) return;
          const normalized = normalizeToSavedLink(raw);
          if (normalized) {
            scanResult.rawText = ocrTextarea.value;
            currentLinks = mergeSavedLinks(currentLinks, [normalized]);
            renderScreenshotRescueUI();
          }
        };

        manualLinkBtn.addEventListener('click', handleAddManualLink);
        manualLinkInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAddManualLink();
          }
        });

        previewCard.querySelectorAll<HTMLButtonElement>('.remove-scan-link-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-link-idx') || '-1', 10);
            if (idx >= 0 && idx < currentLinks.length) {
              scanResult.rawText = ocrTextarea.value;
              currentLinks.splice(idx, 1);
              renderScreenshotRescueUI();
            }
          });
        });

        rescanBtn.addEventListener('click', () => {
          const editedText = ocrTextarea.value.trim();
          scanResult.rawText = editedText;
          currentLinks = mergeSavedLinks(qrOnlyLinks, currentLinks, extractLinksFromText(editedText));
          currentTasks = screenshotScannerService.parseAnnouncementTextToTasks(
            editedText,
            file.name,
            '',
            currentLinks
          );
          renderScreenshotRescueUI();
        });

        saveNoteBtn.addEventListener('click', async () => {
          const noteText = ocrTextarea.value.trim() || `Image Note: ${file.name}`;
          const cat = (noteCatSelect.value as TaskCategory) || 'work';
          const prio = (notePrioSelect.value as UrgencyLevel) || 'high';
          const finalNoteLinks = mergeSavedLinks(currentLinks, extractLinksFromText(noteText));
          saveNoteBtn.disabled = true;
          saveNoteBtn.textContent = 'Saved to Thoughts';
          saveNoteBtn.style.background = '#047857';

          await noteRepository.createNote({
            content: noteText,
            tags: [cat],
            category: cat,
            priority: prio,
            photoUrl: scanResult.photoDataUrl,
            ...(finalNoteLinks.length > 0 ? { links: finalNoteLinks } : {}),
          });
          eventBus.emit(AppEvents.NOTE_CREATED);
          const spoken = `Saved your image${finalNoteLinks.length > 0 ? ' and clickable links' : ''} under ${cat} in your Thoughts tab, Bruv.`;
          eventBus.emit(AppEvents.MASCOT_SPEAK, {
            headline: 'Image & links saved to Thoughts!',
            subspeech: spoken,
          });
          voiceService.speak(spoken);
          notificationService.playAlarmChime('success');
        });

        proposalList.appendChild(previewCard);

        // 2. Editable "Approve AI Tasks" Cards (Blank date/time/duration when absent on image)
        const approveCallbacks: Array<() => Promise<void>> = [];
        const presetDurations = [0, 15, 30, 45, 60, 90, 120];

        currentTasks.forEach((item, index) => {
          const itemCard = document.createElement('div');
          const catColor = CATEGORY_COLORS[item.category] || '#E52E2E';
          const durValues = presetDurations.includes(item.durationMinutes)
            ? presetDurations
            : [...presetDurations, item.durationMinutes].sort((a, b) => a - b);

          itemCard.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 6px;
            background: var(--bg-surface-elevated);
            padding: 10px;
            border-radius: var(--radius-sm);
            border: 1px solid var(--border-medium);
            border-left: 4px solid ${catColor};
          `;

          itemCard.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 0.6rem; font-weight: 800; padding: 2px 6px; border-radius: 999px; background: rgba(229,46,46,0.12); color: var(--color-red-primary);">
                TASK #${index + 1}
              </span>
              <input
                type="text"
                class="scan-task-title-input"
                value="${escapeAttr(item.title)}"
                placeholder="Task title..."
                style="flex: 1; padding: 4px 7px; border-radius: 4px; border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-dominant); font-family: inherit;"
              />
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                <input
                  type="date"
                  class="scan-task-date-input"
                  value="${item.date}"
                  title="Date / Deadline (Blank if not in image)"
                  style="padding: 3px 5px; border-radius: 4px; border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.66rem; font-weight: 700; color: var(--color-black-dominant); font-family: inherit;"
                />
                <input
                  type="time"
                  class="scan-task-time-input"
                  value="${item.startTime}"
                  title="Start Time (Blank if not in image)"
                  style="padding: 3px 5px; border-radius: 4px; border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.66rem; font-weight: 700; color: var(--color-black-dominant); font-family: inherit;"
                />
                <select class="scan-task-dur-select" title="Duration (Optional)" style="padding: 3px 5px; border-radius: 4px; border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.66rem; font-weight: 700;">
                  ${durValues
                    .map(
                      d =>
                        `<option value="${d}" ${d === item.durationMinutes ? 'selected' : ''}>${d === 0 ? 'No duration' : `${d}m`}</option>`
                    )
                    .join('')}
                </select>
                <select class="scan-task-cat-select" title="Category" style="padding: 3px 5px; border-radius: 4px; border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.66rem; font-weight: 700;">
                  <option value="study" ${item.category === 'study' ? 'selected' : ''}>Study</option>
                  <option value="work" ${item.category === 'work' ? 'selected' : ''}>Work</option>
                  <option value="personal" ${item.category === 'personal' ? 'selected' : ''}>Personal</option>
                  <option value="event" ${item.category === 'event' ? 'selected' : ''}>Event</option>
                  <option value="rest" ${item.category === 'rest' ? 'selected' : ''}>Rest</option>
                </select>
                <select class="scan-task-urg-select" title="Priority / Urgency" style="padding: 3px 5px; border-radius: 4px; border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.66rem; font-weight: 700;">
                  <option value="high" ${item.urgency === 'high' ? 'selected' : ''}>High Priority</option>
                  <option value="medium" ${item.urgency === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="low" ${item.urgency === 'low' ? 'selected' : ''}>Low</option>
                </select>
              </div>

              <button type="button" class="pill-badge approve-scan-task-btn" style="background: var(--color-red-primary); color: #FAF7F2; border: none; font-size: 0.66rem; font-weight: 800; cursor: pointer; padding: 5px 11px; flex-shrink: 0;">
                Approve Task
              </button>
            </div>
          `;

          const titleInput = itemCard.querySelector<HTMLInputElement>('.scan-task-title-input')!;
          const dateInput = itemCard.querySelector<HTMLInputElement>('.scan-task-date-input')!;
          const timeInput = itemCard.querySelector<HTMLInputElement>('.scan-task-time-input')!;
          const durSelect = itemCard.querySelector<HTMLSelectElement>('.scan-task-dur-select')!;
          const catSelect = itemCard.querySelector<HTMLSelectElement>('.scan-task-cat-select')!;
          const urgSelect = itemCard.querySelector<HTMLSelectElement>('.scan-task-urg-select')!;
          const approveBtn = itemCard.querySelector<HTMLButtonElement>('.approve-scan-task-btn')!;

          let isApproved = false;
          const approveThisTask = async () => {
            if (isApproved) return;
            isApproved = true;
            const finalTitle = titleInput.value.trim() || item.title || 'Captured Task';
            const finalDate = dateInput.value.trim(); // "" if left blank!
            const finalTime = timeInput.value.trim(); // "" if left blank (never invent 04:00 or 09:00)!
            const finalDur = parseInt(durSelect.value || '0', 10);
            const finalCat = (catSelect.value as TaskCategory) || 'work';
            const finalUrg = (urgSelect.value as UrgencyLevel) || 'high';
            const finalTaskLinks = mergeSavedLinks(currentLinks, extractLinksFromText(ocrTextarea.value));

            approveBtn.disabled = true;
            approveBtn.textContent = 'Saved';
            approveBtn.style.background = '#047857';
            itemCard.style.opacity = '0.72';

            await taskRepository.createTask({
              title: finalTitle,
              category: finalCat,
              date: finalDate,
              startTime: finalTime,
              durationMinutes: finalDur,
              urgency: finalUrg,
              notes: ocrTextarea.value.trim()
                ? `${ocrTextarea.value.trim().slice(0, 220)}`
                : undefined,
              photoUrl: scanResult.photoDataUrl,
              ...(finalTaskLinks.length > 0 ? { links: finalTaskLinks } : {}),
            });

            if (finalDate && finalDate !== resolveActiveDate()) {
              eventBus.emit(AppEvents.DATE_SELECTED, finalDate);
            }
            eventBus.emit(AppEvents.TASK_CREATED);

            const whenPhrase = finalTime
              ? ` at ${formatTime12(finalTime)}${finalDate ? ` on ${finalDate}` : ''}`
              : finalDate
                ? ` for ${finalDate}`
                : '';
            const linkPhrase = finalTaskLinks.length > 0 ? ' with your saved links ready to click' : '';
            const spoken = `Saved "${finalTitle}"${whenPhrase} under ${finalCat}${linkPhrase}, Bruv.`;
            eventBus.emit(AppEvents.MASCOT_SPEAK, {
              headline: `Saved "${finalTitle}"${whenPhrase}`,
              subspeech: spoken,
            });
            voiceService.speak(spoken);
            notificationService.playAlarmChime('success');
          };

          approveBtn.addEventListener('click', approveThisTask);
          approveCallbacks.push(approveThisTask);
          proposalList.appendChild(itemCard);
        });

        // 3. Footer row: "+ Add Blank Task" & "Approve All"
        const footerRow = document.createElement('div');
        footerRow.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 4px;
        `;

        footerRow.innerHTML = `
          <button type="button" id="add-extra-scan-task-btn" class="pill-badge" style="cursor: pointer; font-size: 0.65rem;">
            + Add Another Task Row
          </button>
          ${
            currentTasks.length > 1
              ? `<button type="button" id="approve-all-scan-tasks-btn" class="btn btn-primary" style="padding: 5px 12px; font-size: 0.68rem;">
                   Approve All (${currentTasks.length})
                 </button>`
              : ''
          }
        `;

        footerRow.querySelector('#add-extra-scan-task-btn')?.addEventListener('click', () => {
          currentTasks.push({
            id: `scan_task_${Date.now()}_${currentTasks.length}`,
            title: '',
            date: '',
            startTime: '',
            durationMinutes: 0,
            category: 'work',
            urgency: 'medium',
            links: currentLinks,
          });
          renderScreenshotRescueUI();
        });

        footerRow.querySelector('#approve-all-scan-tasks-btn')?.addEventListener('click', async () => {
          for (const fn of approveCallbacks) {
            await fn();
          }
        });

        proposalList.appendChild(footerRow);
      };

      renderScreenshotRescueUI();

      const firstTask = currentTasks[0];
      const timeDesc = firstTask?.startTime
        ? ` at ${formatTime12(firstTask.startTime)}`
        : firstTask?.date
          ? ` (deadline ${firstTask.date})`
          : '';
      const linksDesc =
        currentLinks.length > 0
          ? ` I also saved ${currentLinks.length} clickable link${currentLinks.length === 1 ? '' : 's'} from the image.`
          : '';
      const spokenIntro = firstTask
        ? `Scanned your image, Bruv! Found "${firstTask.title}"${timeDesc}.${linksDesc}`
        : `Scanned your image, Bruv!${linksDesc} Review below to approve or save to Thoughts.`;

      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: `Image scanned${currentLinks.length > 0 ? ` • ${currentLinks.length} link${currentLinks.length === 1 ? '' : 's'} ready` : ''}`,
        subspeech: spokenIntro,
      });
      voiceService.speak(spokenIntro);
    } catch (err) {
      console.warn('Screenshot rescue error:', err);
      proposalTitle.textContent = 'Could Not Read Image File';
      proposalSub.textContent = 'Please select a valid PNG, JPG, or WEBP image.';
    }
  }

  const photoSourceMenu = container.querySelector<HTMLDivElement>('#photo-source-menu')!;
  const menuUploadPhotoBtn = container.querySelector<HTMLButtonElement>('#menu-upload-photo-btn')!;
  const menuLiveCameraBtn = container.querySelector<HTMLButtonElement>('#menu-live-camera-btn')!;

  photoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = photoSourceMenu.style.display === 'flex';
    photoSourceMenu.style.display = isOpen ? 'none' : 'flex';
  });

  menuUploadPhotoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    photoSourceMenu.style.display = 'none';
    fileInput.click();
  });

  menuLiveCameraBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    photoSourceMenu.style.display = 'none';
    openLiveCameraModal(
      (capturedFile) => {
        processUploadedScreenshot(capturedFile);
      },
      () => {
        fileInput.click();
      }
    );
  });

  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    if (
      photoSourceMenu.style.display !== 'none' &&
      !photoSourceMenu.contains(target) &&
      !photoBtn.contains(target)
    ) {
      photoSourceMenu.style.display = 'none';
    }
  });

  fileInput.addEventListener('change', async () => {
    if (!fileInput.files || !fileInput.files[0]) return;
    const file = fileInput.files[0];
    fileInput.value = '';
    await processUploadedScreenshot(file);
  });

  // Also allow pasting a screenshot directly from clipboard (Ctrl+V) into Quick Capture!
  inputEl.addEventListener('paste', async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const blob = items[i].getAsFile();
        if (blob) {
          e.preventDefault();
          const pastedFile = new File([blob], `Clipboard_Screenshot_${Date.now()}.png`, {
            type: blob.type || 'image/png',
          });
          await processUploadedScreenshot(pastedFile);
          return;
        }
      }
    }
  });

  return container;
}
