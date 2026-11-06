import { taskRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import { voiceService } from '../../services/voice/VoiceService';
import { notificationService } from '../../services/notifications/NotificationService';
import {
  extractLinksFromText,
  mergeSavedLinks,
  normalizeToSavedLink,
} from '../../utils/imageUtils';
import {
  resolveReminderTimeMode,
  type ReminderBodyFormat,
  type ReminderChecklistItem,
  type ReminderTimeMode,
  type SavedLink,
  type Task,
  type TaskCategory,
  type UrgencyLevel,
} from '../../types/task';

export function renderTaskFormModal(): {
  backdrop: HTMLElement;
  open: (prefillDate?: string, editTask?: Task) => void;
  close: () => void;
} {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  let editingTaskId: string | null = null;
  let draftLinks: SavedLink[] = [];
  let currentTimeMode: ReminderTimeMode = 'duration';
  let currentBodyFormat: ReminderBodyFormat = 'paragraph';
  let checklist: ReminderChecklistItem[] = [];

  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h3 class="modal-title" id="task-modal-heading">New Reminder</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>

      <form id="create-task-form">
        <!-- Title -->
        <div class="form-group">
          <label class="form-label" for="task-title-input">Title / Reminder *</label>
          <input 
            type="text" 
            id="task-title-input" 
            class="form-input" 
            placeholder="e.g. Philippine Startup Challenge, Team Standup, Read Paper" 
            required 
          />
        </div>

        <!-- Time Mode Segmented Switcher (Duration Block vs One-Time vs Timeless) -->
        <div class="form-group">
          <label class="form-label">Timing Type</label>
          <div style="display: flex; gap: 6px; padding: 4px; background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-radius: var(--radius-sm);" id="time-mode-switcher">
            <button type="button" class="pill-badge time-mode-btn active" data-mode="duration" style="flex: 1; justify-content: center; font-size: 0.68rem;">
              Duration Block (Orbit)
            </button>
            <button type="button" class="pill-badge time-mode-btn" data-mode="one-time" style="flex: 1; justify-content: center; font-size: 0.68rem;">
              One-Time (Deadline)
            </button>
            <button type="button" class="pill-badge time-mode-btn" data-mode="none" style="flex: 1; justify-content: center; font-size: 0.68rem;">
              Timeless (Idea / Note)
            </button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="task-category-select">Category</label>
            <select id="task-category-select" class="form-select">
              <option value="study">Study</option>
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              <option value="event">Event</option>
              <option value="rest">Rest</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="task-urgency-select">Importance</label>
            <select id="task-urgency-select" class="form-select">
              <option value="high">High Priority</option>
              <option value="medium" selected>Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>
        </div>

        <!-- Date & Time Row (Hidden when Timeless) -->
        <div id="datetime-fields-wrap" style="display: flex; flex-direction: column; gap: var(--spacing-3);">
          <div class="form-group">
            <label class="form-label" for="task-date-input" id="task-date-label">Date / Deadline</label>
            <input 
              type="date" 
              id="task-date-input" 
              class="form-input" 
            />
          </div>

          <div class="form-row" id="time-and-duration-row">
            <div class="form-group">
              <label class="form-label" for="task-start-input">Time</label>
              <input 
                type="time" 
                id="task-start-input" 
                class="form-input" 
              />
            </div>

            <div class="form-group" id="duration-field-col">
              <label class="form-label" for="task-duration-input">Duration (Mins)</label>
              <input 
                type="number" 
                id="task-duration-input" 
                class="form-input" 
                min="0" 
                max="480" 
                step="5" 
                value="45" 
              />
            </div>
          </div>
        </div>

        <!-- Format Options Bar (Paragraph vs Bullet Points vs Checkboxes) -->
        <div class="form-group" style="margin-top: var(--spacing-2);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <label class="form-label">Note / Body Format</label>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="pill-badge format-btn active" data-fmt="paragraph" style="font-size: 0.62rem; padding: 2px 7px;">Paragraph</button>
              <button type="button" class="pill-badge format-btn" data-fmt="bullets" style="font-size: 0.62rem; padding: 2px 7px;">• Bullets</button>
              <button type="button" class="pill-badge format-btn" data-fmt="checkboxes" style="font-size: 0.62rem; padding: 2px 7px;">☑ Checkboxes</button>
            </div>
          </div>

          <textarea 
            id="task-notes-input" 
            class="form-textarea" 
            rows="3" 
            placeholder="Key reminders, thoughts, or context..."
          ></textarea>

          <!-- Interactive Checklist Editor (Shown when 'checkboxes' format selected) -->
          <div id="checklist-editor" style="display: none; flex-direction: column; gap: 6px; margin-top: 6px; padding: 8px; background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-radius: var(--radius-sm);">
            <div id="checklist-items-container" style="display: flex; flex-direction: column; gap: 4px;"></div>
            <div style="display: flex; gap: 6px; margin-top: 4px;">
              <input type="text" id="new-checklist-text" class="form-input" placeholder="Add checklist item..." style="font-size: 0.72rem; padding: 6px 8px; flex: 1;" />
              <button type="button" id="add-checklist-item-btn" class="pill-badge" style="font-size: 0.68rem; padding: 0 10px; font-weight: 800;">+ Add</button>
            </div>
          </div>
        </div>

        <!-- Saved Links / QR -->
        <div class="form-group">
          <label class="form-label" for="task-link-input">Saved Link / Website / QR (Optional)</label>
          <div style="display: flex; gap: 6px;">
            <input
              type="text"
              id="task-link-input"
              class="form-input"
              placeholder="e.g. bit.ly/PSCXI_ApplicationForm_R6"
              style="flex: 1;"
            />
            <button type="button" id="task-add-link-btn" class="pill-badge" style="cursor: pointer; padding: 0 12px; font-weight: 800;">
              + Add
            </button>
          </div>
          <div id="task-draft-links-list" style="display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px;"></div>
        </div>

        <button type="submit" id="task-submit-btn" class="btn btn-primary btn-full" style="margin-top: var(--spacing-2);">
          Save Reminder
        </button>
      </form>
    </div>
  `;

  const form = backdrop.querySelector<HTMLFormElement>('#create-task-form')!;
  const headingEl = backdrop.querySelector<HTMLElement>('#task-modal-heading')!;
  const submitBtn = backdrop.querySelector<HTMLButtonElement>('#task-submit-btn')!;
  const closeBtn = backdrop.querySelector<HTMLButtonElement>('#modal-close-btn')!;
  const titleInput = backdrop.querySelector<HTMLInputElement>('#task-title-input')!;
  const categorySelect = backdrop.querySelector<HTMLSelectElement>('#task-category-select')!;
  const urgencySelect = backdrop.querySelector<HTMLSelectElement>('#task-urgency-select')!;
  const dateInput = backdrop.querySelector<HTMLInputElement>('#task-date-input')!;
  const startInput = backdrop.querySelector<HTMLInputElement>('#task-start-input')!;
  const durationInput = backdrop.querySelector<HTMLInputElement>('#task-duration-input')!;
  const datetimeWrap = backdrop.querySelector<HTMLDivElement>('#datetime-fields-wrap')!;
  const durationFieldCol = backdrop.querySelector<HTMLDivElement>('#duration-field-col')!;
  const linkInput = backdrop.querySelector<HTMLInputElement>('#task-link-input')!;
  const addLinkBtn = backdrop.querySelector<HTMLButtonElement>('#task-add-link-btn')!;
  const draftLinksList = backdrop.querySelector<HTMLDivElement>('#task-draft-links-list')!;
  const notesInput = backdrop.querySelector<HTMLTextAreaElement>('#task-notes-input')!;
  const checklistEditor = backdrop.querySelector<HTMLDivElement>('#checklist-editor')!;
  const checklistContainer = backdrop.querySelector<HTMLDivElement>('#checklist-items-container')!;
  const newChecklistText = backdrop.querySelector<HTMLInputElement>('#new-checklist-text')!;
  const addChecklistBtn = backdrop.querySelector<HTMLButtonElement>('#add-checklist-item-btn')!;

  function updateTimeModeUI(mode: ReminderTimeMode) {
    currentTimeMode = mode;
    backdrop.querySelectorAll<HTMLButtonElement>('.time-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });

    if (mode === 'none') {
      datetimeWrap.style.display = 'none';
      dateInput.value = '';
      startInput.value = '';
      durationInput.value = '0';
    } else if (mode === 'one-time') {
      datetimeWrap.style.display = 'flex';
      durationFieldCol.style.display = 'none';
      durationInput.value = '0';
    } else {
      // duration
      datetimeWrap.style.display = 'flex';
      durationFieldCol.style.display = 'flex';
      if (!durationInput.value || durationInput.value === '0') {
        durationInput.value = '45';
      }
    }
  }

  backdrop.querySelectorAll<HTMLButtonElement>('.time-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn.getAttribute('data-mode') as ReminderTimeMode) || 'duration';
      updateTimeModeUI(mode);
    });
  });

  function updateBodyFormatUI(fmt: ReminderBodyFormat) {
    currentBodyFormat = fmt;
    backdrop.querySelectorAll<HTMLButtonElement>('.format-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-fmt') === fmt);
    });

    if (fmt === 'checkboxes') {
      checklistEditor.style.display = 'flex';
      renderChecklistItems();
    } else {
      checklistEditor.style.display = 'none';
    }

    if (fmt === 'bullets' && notesInput.value && !notesInput.value.includes('•')) {
      notesInput.value = notesInput.value
        .split('\n')
        .map(l => (l.trim().startsWith('•') || !l.trim() ? l : `• ${l}`))
        .join('\n');
    }
  }

  backdrop.querySelectorAll<HTMLButtonElement>('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fmt = (btn.getAttribute('data-fmt') as ReminderBodyFormat) || 'paragraph';
      updateBodyFormatUI(fmt);
    });
  });

  function renderChecklistItems() {
    checklistContainer.innerHTML = '';
    checklist.forEach((item, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 6px;';
      row.innerHTML = `
        <input type="checkbox" ${item.done ? 'checked' : ''} style="cursor: pointer;" />
        <span style="flex: 1; font-size: 0.72rem; ${item.done ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${item.text}</span>
        <button type="button" style="border: none; background: transparent; color: var(--color-black-muted); cursor: pointer; font-size: 0.8rem;">&times;</button>
      `;
      row.querySelector('input')?.addEventListener('change', (e) => {
        checklist[idx].done = (e.target as HTMLInputElement).checked;
        renderChecklistItems();
      });
      row.querySelector('button')?.addEventListener('click', () => {
        checklist.splice(idx, 1);
        renderChecklistItems();
      });
      checklistContainer.appendChild(row);
    });
  }

  const commitChecklistItem = () => {
    const val = newChecklistText.value.trim();
    if (!val) return;
    checklist.push({
      id: 'chk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      text: val,
      done: false,
    });
    newChecklistText.value = '';
    renderChecklistItems();
  };

  addChecklistBtn.addEventListener('click', commitChecklistItem);
  newChecklistText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitChecklistItem();
    }
  });

  function renderDraftLinks() {
    draftLinksList.innerHTML = '';
    draftLinks.forEach((lnk, idx) => {
      const chip = document.createElement('span');
      chip.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(229, 46, 46, 0.09);
        border: 1px solid rgba(229, 46, 46, 0.32);
        font-size: 0.66rem;
        font-weight: 800;
      `;
      const a = document.createElement('a');
      a.href = lnk.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `${lnk.label} ↗`;
      a.style.cssText = 'color: #C81E1E; text-decoration: none;';
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = '×';
      rm.style.cssText =
        'border: none; background: transparent; color: var(--color-black-muted); font-size: 0.8rem; cursor: pointer; padding: 0 2px; line-height: 1;';
      rm.addEventListener('click', () => {
        draftLinks.splice(idx, 1);
        renderDraftLinks();
      });
      chip.appendChild(a);
      chip.appendChild(rm);
      draftLinksList.appendChild(chip);
    });
  }

  const commitTypedLink = () => {
    const raw = linkInput.value.trim();
    if (!raw) return;
    const normalized = normalizeToSavedLink(raw);
    if (normalized) {
      draftLinks = mergeSavedLinks(draftLinks, [normalized]);
      linkInput.value = '';
      renderDraftLinks();
    }
  };

  addLinkBtn.addEventListener('click', commitTypedLink);
  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTypedLink();
    }
  });

  const open = (prefillDate?: string, editTask?: Task) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayString = `${y}-${m}-${day}`;

    if (editTask) {
      editingTaskId = editTask.id;
      headingEl.textContent = 'Edit Reminder';
      submitBtn.textContent = 'Save Changes';
      titleInput.value = editTask.title;
      categorySelect.value = editTask.category;
      urgencySelect.value = editTask.urgency;
      dateInput.value = typeof editTask.date === 'string' ? editTask.date : prefillDate || todayString;
      startInput.value = editTask.startTime || '';
      durationInput.value = String(editTask.durationMinutes ?? 0);
      notesInput.value = editTask.notes || '';
      draftLinks = [...(editTask.links || [])];
      checklist = editTask.checklistItems ? [...editTask.checklistItems] : [];
      linkInput.value = '';
      renderDraftLinks();
      updateTimeModeUI(resolveReminderTimeMode(editTask));
      updateBodyFormatUI(editTask.bodyFormat || (checklist.length > 0 ? 'checkboxes' : 'paragraph'));
    } else {
      editingTaskId = null;
      headingEl.textContent = 'New Reminder';
      submitBtn.textContent = 'Save Reminder';
      form.reset();
      dateInput.value = prefillDate || todayString;
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
      startInput.value = `${hours}:${minutes}`;
      durationInput.value = '45';
      draftLinks = [];
      checklist = [];
      linkInput.value = '';
      renderDraftLinks();
      updateTimeModeUI('duration');
      updateBodyFormatUI('paragraph');
    }

    backdrop.classList.add('open');
    titleInput?.focus();
  };

  const close = () => {
    editingTaskId = null;
    backdrop.classList.remove('open');
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;

    const category = categorySelect.value as TaskCategory;
    const urgency = urgencySelect.value as UrgencyLevel;
    const finalDate = currentTimeMode === 'none' ? '' : dateInput.value.trim();
    const finalStart = currentTimeMode === 'none' ? '' : startInput.value.trim();
    const finalDuration = currentTimeMode === 'duration' ? parseInt(durationInput.value || '0', 10) : 0;
    const notes = notesInput.value.trim();
    const autoExtracted = extractLinksFromText(notes);
    const finalLinks = mergeSavedLinks(draftLinks, autoExtracted);

    if (editingTaskId) {
      await taskRepository.updateTask(editingTaskId, {
        title,
        category,
        date: finalDate,
        startTime: finalStart,
        durationMinutes: finalDuration,
        urgency,
        timeMode: currentTimeMode,
        bodyFormat: currentBodyFormat,
        checklistItems: checklist.length > 0 ? checklist : undefined,
        notes: notes || undefined,
        links: finalLinks.length > 0 ? finalLinks : undefined,
      });
      eventBus.emit(AppEvents.TASK_UPDATED);
      const spoken = `Updated reminder "${title}", Bruv.`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: `Updated "${title}"`,
        subspeech: spoken,
      });
      voiceService.speak(spoken);
    } else {
      await taskRepository.createTask({
        title,
        category,
        date: finalDate,
        startTime: finalStart,
        durationMinutes: finalDuration,
        urgency,
        timeMode: currentTimeMode,
        bodyFormat: currentBodyFormat,
        checklistItems: checklist.length > 0 ? checklist : undefined,
        notes: notes || undefined,
        links: finalLinks.length > 0 ? finalLinks : undefined,
      });
      eventBus.emit(AppEvents.TASK_CREATED);
      const timingWord = currentTimeMode === 'none'
        ? 'as a timeless idea'
        : currentTimeMode === 'one-time'
          ? `for ${finalDate || 'upcoming'}`
          : `at ${finalStart || 'scheduled time'}`;
      const spoken = `I got you, Bruv! Saved "${title}" ${timingWord}.`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: `Saved "${title}"`,
        subspeech: spoken,
      });
      voiceService.speak(spoken);
      notificationService.playAlarmChime('success');
    }

    close();
  });

  return { backdrop, open, close };
}
