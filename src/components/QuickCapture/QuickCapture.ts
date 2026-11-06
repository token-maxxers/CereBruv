import { noteRepository, taskRepository } from '../../services/storage';
import { geminiService } from '../../services/ai/GeminiService';
import { voiceService, type PendingTaskDraft } from '../../services/voice/VoiceService';
import { eventBus, AppEvents } from '../../services/events';
import { CATEGORY_COLORS } from '../FocusOrbit/orbitCalculator';
import type { TaskCategory, UrgencyLevel } from '../../types/task';

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
      <input 
        type="text" 
        class="quick-capture-input" 
        id="quick-capture-input" 
        placeholder="Tap CereBruv above to speak, or type 'Hey Bruv...' / note"
      />
      <button class="icon-btn" id="voice-guide-btn" title="Voice Command Rules & Voice Settings">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      <button class="icon-btn" id="photo-upload-btn" title="Scan to-do list / notes with Gemini Vision">
        <svg viewBox="0 0 24 24">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>
      <input type="file" id="photo-file-input" accept="image/*" style="display: none;" />
    </div>

    <!-- Live Syntax Guidance Bar (Displays dynamically as user speaks or types "Add...", "Done...", "Note...") -->
    <div id="live-syntax-guide-bar" style="display: none; margin-top: 6px; padding: 6px 10px; border-radius: var(--radius-sm); background: rgba(229, 46, 46, 0.08); border: 1px dashed rgba(229, 46, 46, 0.4); font-size: 0.7rem; color: var(--color-black-dominant); align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
        <span style="font-weight: 800; color: var(--color-red-primary); text-transform: uppercase; font-size: 0.62rem; letter-spacing: 0.04em;">GUIDE:</span>
        <code id="live-syntax-template" style="font-weight: 700; color: var(--color-black-dominant); font-family: inherit;">Add [Task Name] at [Time]</code>
      </div>
      <span id="live-syntax-next" style="font-size: 0.65rem; font-weight: 700; color: var(--color-red-primary);"></span>
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
  const guideBtn = container.querySelector<HTMLButtonElement>('#voice-guide-btn')!;
  const photoBtn = container.querySelector<HTMLButtonElement>('#photo-upload-btn')!;
  const fileInput = container.querySelector<HTMLInputElement>('#photo-file-input')!;

  const liveSyntaxBar = container.querySelector<HTMLDivElement>('#live-syntax-guide-bar')!;
  const liveSyntaxTemplate = container.querySelector<HTMLElement>('#live-syntax-template')!;
  const liveSyntaxNext = container.querySelector<HTMLElement>('#live-syntax-next')!;

  function updateSyntaxBar(hint: { template: string; nextPart: string } | null) {
    if (!hint) {
      liveSyntaxBar.style.display = 'none';
      return;
    }
    liveSyntaxBar.style.display = 'flex';
    liveSyntaxTemplate.textContent = hint.template;
    liveSyntaxNext.textContent = hint.nextPart;
  }

  eventBus.on(AppEvents.VOICE_SYNTAX_HINT, (hint: { template: string; nextPart: string } | null) => {
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

  // Live syntax guide while typing in the input field
  inputEl.addEventListener('input', () => {
    const val = inputEl.value;
    if (val.trim()) {
      const hint = voiceService.getLiveSyntaxTemplate(val);
      updateSyntaxBar(hint);
    } else if (!voiceService.isListening()) {
      updateSyntaxBar(null);
    }
  });

  inputEl.addEventListener('blur', () => {
    if (!voiceService.isListening() && !inputEl.value.trim()) {
      updateSyntaxBar(null);
    }
  });

  // Handle Typed Input Submission
  inputEl.addEventListener('keydown', async (e) => {
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
        await noteRepository.createNote({ content: text, tags: ['personal'] });
        eventBus.emit(AppEvents.NOTE_CREATED);
        eventBus.emit(AppEvents.MASCOT_SPEAK, {
          headline: 'Saved to Thoughts, Bruv!',
          subspeech: `Saved "${text}" to your Thoughts tab and Mind Graph.`,
        });
        inputEl.disabled = false;
        inputEl.placeholder = 'Saved to Thoughts tab! Type another...';
      }

      setTimeout(() => {
        inputEl.placeholder = "Tap CereBruv above to speak, or type 'Hey Bruv...' / note";
      }, 3000);
    }
  });

  // Handle Photo Picker & Gemini Task Extraction
  photoBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    if (!fileInput.files || !fileInput.files[0]) return;
    const file = fileInput.files[0];
    fileInput.value = '';

    await noteRepository.createNote({
      content: `Photo Note: "${file.name}" scanned with Gemini Vision`
    });
    eventBus.emit(AppEvents.NOTE_CREATED);

    proposalsBox.style.display = 'block';
    proposalTitle.textContent = 'Scanning image with Gemini...';
    proposalSub.textContent = `Analyzing "${file.name}" for tasks and to-do items...`;
    proposalList.innerHTML = `
      <div style="font-size: var(--font-size-xs); color: var(--color-black-muted); padding: 8px 0; text-align: center;">
        Reading handwritten / printed text...
      </div>
    `;

    try {
      const extractedTasks = await geminiService.extractTasksFromImage(file);

      if (extractedTasks.length === 0) {
        proposalTitle.textContent = 'No Actionable Tasks Detected';
        proposalSub.textContent = 'Gemini could not find clear to-do items in this image.';
        proposalList.innerHTML = `
          <button class="pill-badge" id="dismiss-empty-proposals" style="cursor: pointer; align-self: center; margin-top: 4px;">
            Dismiss
          </button>
        `;
        container.querySelector('#dismiss-empty-proposals')?.addEventListener('click', () => {
          proposalsBox.style.display = 'none';
        });
        return;
      }

      proposalTitle.textContent = `Gemini Found ${extractedTasks.length} Task${extractedTasks.length > 1 ? 's' : ''}`;
      proposalSub.textContent = 'Tap any item to add it directly to today\'s schedule:';
      proposalList.innerHTML = '';

      const todayStr = resolveActiveDate();

      extractedTasks.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-surface-elevated);
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
        `;

        const categoryTag = (item.category || 'personal').toUpperCase();
        const durationTag = item.durationMinutes ? `${item.durationMinutes}m` : '30m';

        itemRow.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; margin-right: 8px;">
            <strong style="font-size: var(--font-size-xs); color: var(--color-black-dominant); word-break: break-word;">
              ${item.title || 'Untitled'}
            </strong>
            <span style="font-size: 0.65rem; color: var(--color-black-muted); font-weight: 600;">
              ${categoryTag} &bull; ${durationTag} &bull; Urgency: ${item.urgency || 'medium'}
            </span>
          </div>
          <button class="pill-badge" style="background: var(--color-red-primary); color: #FAF7F2; border: none; font-size: 0.65rem; font-weight: 700; cursor: pointer; padding: 3px 8px; flex-shrink: 0;">
            + ADD
          </button>
        `;

        const handleAddTask = async (e: Event) => {
          e.stopPropagation();
          itemRow.style.opacity = '0.5';
          itemRow.style.pointerEvents = 'none';

          const now = new Date();
          const nextHour = (now.getHours() + 1 + index) % 24;
          const startTime = `${String(nextHour).padStart(2, '0')}:00`;

          await taskRepository.createTask({
            title: item.title || 'Extracted Task',
            category: (item.category || 'personal') as TaskCategory,
            date: todayStr,
            startTime,
            durationMinutes: item.durationMinutes || 30,
            urgency: (item.urgency || 'medium') as UrgencyLevel,
            notes: `Extracted via Gemini Vision from "${file.name}"`
          });

          eventBus.emit(AppEvents.TASK_CREATED);

          itemRow.innerHTML = `
            <div style="font-size: var(--font-size-xs); color: var(--color-black-muted); font-weight: 600;">
              Added to Focus Orbit at ${startTime}
            </div>
            <span style="font-size: 0.75rem; color: var(--color-red-primary); font-weight: 800;">ADDED</span>
          `;

          setTimeout(() => {
            const remaining = proposalList.querySelectorAll('[style*="pointer-events: none"]').length;
            if (remaining === extractedTasks.length) {
              proposalsBox.style.display = 'none';
            }
          }, 1200);
        };

        itemRow.addEventListener('click', handleAddTask);
        proposalList.appendChild(itemRow);
      });
    } catch (err) {
      console.warn('Gemini vision extraction failed:', err);
      proposalTitle.textContent = 'Extraction Unavailable';
      proposalSub.textContent = 'Could not process the photo with Gemini Vision (check network or try again).';
      proposalList.innerHTML = `
        <button class="pill-badge" id="dismiss-err-proposals" style="cursor: pointer; align-self: center; margin-top: 4px;">
          Dismiss
        </button>
      `;
      container.querySelector('#dismiss-err-proposals')?.addEventListener('click', () => {
        proposalsBox.style.display = 'none';
      });
    }
  });

  return container;
}
