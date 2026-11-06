import { taskRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import { voiceService } from '../../services/voice/VoiceService';
import { notificationService } from '../../services/notifications/NotificationService';
import {
  extractLinksFromText,
  mergeSavedLinks,
  normalizeToSavedLink,
} from '../../utils/imageUtils';
import type { SavedLink, Task, TaskCategory, UrgencyLevel } from '../../types/task';

export function renderTaskFormModal(): {
  backdrop: HTMLElement;
  open: (prefillDate?: string, editTask?: Task) => void;
  close: () => void;
} {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  let editingTaskId: string | null = null;
  let draftLinks: SavedLink[] = [];

  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h3 class="modal-title" id="task-modal-heading">New Task & Time-Block</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>

      <form id="create-task-form">
        <div class="form-group">
          <label class="form-label" for="task-title-input">Task Title *</label>
          <input 
            type="text" 
            id="task-title-input" 
            class="form-input" 
            placeholder="e.g. Capstone manuscript, Startup Challenge, Gym" 
            required 
          />
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
            <label class="form-label" for="task-urgency-select">Urgency</label>
            <select id="task-urgency-select" class="form-select">
              <option value="medium">Medium</option>
              <option value="high">High (Priority)</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="task-date-input">Scheduled Date / Deadline (Optional)</label>
          <input 
            type="date" 
            id="task-date-input" 
            class="form-input" 
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="task-start-input">Start Time (Optional)</label>
            <input 
              type="time" 
              id="task-start-input" 
              class="form-input" 
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="task-duration-input">Duration Mins (0 = None)</label>
            <input 
              type="number" 
              id="task-duration-input" 
              class="form-input" 
              min="0" 
              max="480" 
              step="5" 
              value="60" 
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="task-link-input">Saved Website / QR Link (Optional)</label>
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

        <div class="form-group">
          <label class="form-label" for="task-notes-input">Notes (Optional)</label>
          <textarea 
            id="task-notes-input" 
            class="form-textarea" 
            rows="2" 
            placeholder="Key reminders, subtasks, or links..."
          ></textarea>
        </div>

        <button type="submit" id="task-submit-btn" class="btn btn-primary btn-full" style="margin-top: var(--spacing-2);">
          Add to Schedule & Focus Orbit
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
  const linkInput = backdrop.querySelector<HTMLInputElement>('#task-link-input')!;
  const addLinkBtn = backdrop.querySelector<HTMLButtonElement>('#task-add-link-btn')!;
  const draftLinksList = backdrop.querySelector<HTMLDivElement>('#task-draft-links-list')!;
  const notesInput = backdrop.querySelector<HTMLTextAreaElement>('#task-notes-input')!;

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
      headingEl.textContent = 'Edit Task & Time-Block';
      submitBtn.textContent = 'Save Changes';
      titleInput.value = editTask.title;
      categorySelect.value = editTask.category;
      urgencySelect.value = editTask.urgency;
      dateInput.value = typeof editTask.date === 'string' ? editTask.date : prefillDate || todayString;
      startInput.value = editTask.startTime || '';
      durationInput.value = String(editTask.durationMinutes ?? 0);
      notesInput.value = editTask.notes || '';
      draftLinks = [...(editTask.links || [])];
      linkInput.value = '';
      renderDraftLinks();
    } else {
      editingTaskId = null;
      headingEl.textContent = 'New Task & Time-Block';
      submitBtn.textContent = 'Add to Schedule & Focus Orbit';
      form.reset();
      dateInput.value = prefillDate || todayString;
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
      startInput.value = `${hours}:${minutes}`;
      durationInput.value = '60';
      draftLinks = [];
      linkInput.value = '';
      renderDraftLinks();
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
    // Auto-include any URL typed into linkInput even if user didn't click "+ Add"
    if (linkInput.value.trim()) {
      commitTypedLink();
    }

    const title = titleInput.value.trim();
    const category = categorySelect.value as TaskCategory;
    const urgency = urgencySelect.value as UrgencyLevel;
    const date = dateInput.value.trim();
    const startTime = startInput.value.trim();
    const parsedDur = parseInt(durationInput.value, 10);
    const durationMinutes = isNaN(parsedDur) || parsedDur < 0 ? 0 : parsedDur;
    const notes = notesInput.value.trim();
    const finalLinks = mergeSavedLinks(draftLinks, extractLinksFromText(notes));

    if (editingTaskId) {
      const updatedTask = await taskRepository.updateTask(editingTaskId, {
        title,
        category,
        urgency,
        date,
        startTime,
        durationMinutes,
        notes: notes || undefined,
        links: finalLinks,
      });
      eventBus.emit(AppEvents.TASK_UPDATED, updatedTask);
      eventBus.emit(AppEvents.TASK_CREATED, updatedTask);
      const timePhrase = updatedTask.startTime ? ` at ${updatedTask.startTime}` : '';
      const msg = `I got you, Bruv. Updated "${updatedTask.title}" under ${updatedTask.category} (${updatedTask.urgency} priority)${timePhrase}.`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: `Updated "${updatedTask.title}", Bruv!`,
        subspeech: msg,
      });
      voiceService.speak(msg);
      notificationService.playAlarmChime('success');
    } else {
      const newTask = await taskRepository.createTask({
        title,
        category,
        urgency,
        date,
        startTime,
        durationMinutes,
        notes: notes || undefined,
        ...(finalLinks.length > 0 ? { links: finalLinks } : {}),
      });
      eventBus.emit(AppEvents.TASK_CREATED, newTask);
      const timePhrase = newTask.startTime
        ? ` at ${newTask.startTime}${newTask.durationMinutes > 0 ? ` for ${newTask.durationMinutes} minutes` : ''}`
        : '';
      const msg = `I got you, Bruv. Saved "${newTask.title}" under ${newTask.category} (${newTask.urgency} priority)${timePhrase}.`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: `Saved "${newTask.title}", Bruv!`,
        subspeech: msg,
      });
      voiceService.speak(msg);
      notificationService.playAlarmChime('success');
    }

    form.reset();
    draftLinks = [];
    renderDraftLinks();
    close();
  });

  return { backdrop, open, close };
}
