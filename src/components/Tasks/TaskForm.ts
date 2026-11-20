import { taskRepository, noteRepository, userStatsRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import { voiceService } from '../../services/voice/VoiceService';
import { notificationService } from '../../services/notifications/NotificationService';
import {
  extractLinksFromText,
  mergeSavedLinks,
  normalizeToSavedLink,
  openImageLightbox,
} from '../../utils/imageUtils';
import {
  resolveReminderTimeMode,
  type ReminderBodyFormat,
  type ReminderChecklistItem,
  type ReminderTimeMode,
  type SavedLink,
  type Task,
  type TaskAttachment,
  type TaskCategory,
  type UrgencyLevel,
} from '../../types/task';

async function compressAttachmentImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(String(reader.result));
      img.onload = () => {
        const maxDim = 960;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height / width) * maxDim);
            width = maxDim;
          } else {
            width = Math.round((width / height) * maxDim);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function renderTaskFormModal(): {
  backdrop: HTMLElement;
  open: (prefillDate?: string, editTask?: Task) => void;
  close: () => void;
} {
  const backdrop = document.createElement('div');
  backdrop.className = 'note-page-backdrop';

  let editingTaskId: string | null = null;
  let editingIsNote = false;
  let editingCompleted = false;
  let editingPhotoUrl: string | undefined = undefined;
  let draftLinks: SavedLink[] = [];
  let draftAttachments: TaskAttachment[] = [];
  let currentTimeMode: ReminderTimeMode = 'duration';
  let currentBodyFormat: ReminderBodyFormat = 'paragraph';
  let checklist: ReminderChecklistItem[] = [];

  backdrop.innerHTML = `
    <div class="note-page-sheet" role="dialog" aria-modal="true" aria-labelledby="task-modal-heading">
      <!-- Top Navigation Bar -->
      <div class="note-page-topbar">
        <button type="button" id="modal-close-btn" class="pill-badge" style="padding: 6px 12px; gap: 4px;">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.4">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Back
        </button>

        <span id="task-modal-heading" style="font-size: 0.72rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase; letter-spacing: 0.05em;">New Note</span>

        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" id="note-complete-btn" class="pill-badge" style="display: none; padding: 6px 10px; font-size: 0.7rem;">Done</button>
          <button type="button" id="note-delete-btn" class="pill-badge" style="display: none; padding: 6px 10px; font-size: 0.7rem; color: var(--color-red-primary);">Delete</button>
          <button type="submit" form="create-task-form" id="task-submit-btn" class="pill-badge" style="background: var(--color-red-primary); color: #FFFFFF; border-color: var(--color-red-primary); padding: 6px 14px; font-size: 0.72rem;">Save</button>
        </div>
      </div>

      <!-- Scrollable Document Body -->
      <form id="create-task-form" class="note-page-scroll">
        <!-- Title -->
        <input
          type="text"
          id="task-title-input"
          class="note-page-title"
          placeholder="Untitled reminder or note..."
          required
        />

        <!-- Timing Type & Meta Pills -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; gap: 6px; padding: 4px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-full);" id="time-mode-switcher">
            <button type="button" class="pill-badge time-mode-btn active" data-mode="duration" style="flex: 1; justify-content: center; font-size: 0.72rem;">Timed</button>
            <button type="button" class="pill-badge time-mode-btn" data-mode="one-time" style="flex: 1; justify-content: center; font-size: 0.72rem;">Deadline</button>
            <button type="button" class="pill-badge time-mode-btn" data-mode="none" style="flex: 1; justify-content: center; font-size: 0.72rem;">Note</button>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <select id="task-category-select" class="form-select" style="padding: 8px 10px; font-size: 0.78rem;">
              <option value="study">Study</option>
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              <option value="event">Event</option>
              <option value="rest">Rest</option>
            </select>
            <select id="task-urgency-select" class="form-select" style="padding: 8px 10px; font-size: 0.78rem;">
              <option value="high">High Priority</option>
              <option value="medium" selected>Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>

          <div id="datetime-fields-wrap" style="display: grid; grid-template-columns: 1.3fr 1fr 0.8fr; gap: 8px;">
            <input type="date" id="task-date-input" class="form-input" style="padding: 8px 10px; font-size: 0.75rem;" />
            <input type="time" id="task-start-input" class="form-input" style="padding: 8px 10px; font-size: 0.75rem;" />
            <div id="duration-field-col" style="display: flex;">
              <input type="number" id="task-duration-input" class="form-input" min="5" max="720" step="5" value="45" placeholder="Mins" title="Duration in minutes" style="padding: 8px 10px; font-size: 0.75rem;" />
            </div>
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid var(--border-subtle); margin: 2px 0;" />

        <!-- Live Rich Editor (Paragraph / Bullets) -->
        <textarea
          id="task-notes-input"
          class="note-page-editor"
          placeholder="Start writing notes, ideas, or bullet points..."
        ></textarea>

        <!-- Interactive Checklist Editor (Shown in Checkboxes mode) -->
        <div id="checklist-editor" style="display: none; flex-direction: column; gap: 8px;">
          <div id="checklist-items-container" style="display: flex; flex-direction: column; gap: 6px;"></div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="text" id="new-checklist-text" class="form-input" placeholder="+ Add checklist item..." style="flex: 1; padding: 8px 12px; font-size: 0.82rem;" />
            <button type="button" id="add-checklist-item-btn" class="pill-badge" style="padding: 7px 12px;">Add</button>
          </div>
        </div>

        <!-- Attachments & Links Section -->
        <div style="display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px dashed var(--border-medium);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 0.68rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase; letter-spacing: 0.05em;">Attachments &amp; Links</span>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="note-attach-img-btn" class="pill-badge" style="font-size: 0.68rem;">+ Image</button>
              <button type="button" id="note-attach-file-btn" class="pill-badge" style="font-size: 0.68rem;">+ File</button>
            </div>
            <input type="file" id="note-img-input" accept="image/*" style="display: none;" />
            <input type="file" id="note-file-input" style="display: none;" />
          </div>

          <!-- Snapped Photo + Uploaded Images + Files -->
          <div id="note-attachments-list" class="note-attachment-grid"></div>

          <!-- Link Input & Chips -->
          <div style="display: flex; gap: 6px;">
            <input type="text" id="task-link-input" class="form-input" placeholder="Paste URL or link..." style="flex: 1; padding: 7px 12px; font-size: 0.78rem;" />
            <button type="button" id="task-add-link-btn" class="pill-badge" style="padding: 6px 12px; font-size: 0.7rem;">+ Link</button>
          </div>
          <div id="task-draft-links-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
        </div>
      </form>

      <!-- Bottom Sticky Format Bar (Matching Inspiration) -->
      <div class="note-page-format-bar">
        <span style="font-size: 0.68rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">Format</span>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="pill-badge format-btn active" data-fmt="paragraph" style="font-size: 0.7rem;">Paragraph</button>
          <button type="button" class="pill-badge format-btn" data-fmt="bullets" style="font-size: 0.7rem;">&bull; Bullets</button>
          <button type="button" class="pill-badge format-btn" data-fmt="checkboxes" style="font-size: 0.7rem;">&#9745; Checkboxes</button>
        </div>
      </div>
    </div>
  `;

  const form = backdrop.querySelector<HTMLFormElement>('#create-task-form')!;
  const headingEl = backdrop.querySelector<HTMLElement>('#task-modal-heading')!;
  const submitBtn = backdrop.querySelector<HTMLButtonElement>('#task-submit-btn')!;
  const closeBtn = backdrop.querySelector<HTMLButtonElement>('#modal-close-btn')!;
  const completeBtn = backdrop.querySelector<HTMLButtonElement>('#note-complete-btn')!;
  const deleteBtn = backdrop.querySelector<HTMLButtonElement>('#note-delete-btn')!;

  const titleInput = backdrop.querySelector<HTMLInputElement>('#task-title-input')!;
  const categorySelect = backdrop.querySelector<HTMLSelectElement>('#task-category-select')!;
  const urgencySelect = backdrop.querySelector<HTMLSelectElement>('#task-urgency-select')!;
  const dateInput = backdrop.querySelector<HTMLInputElement>('#task-date-input')!;
  const startInput = backdrop.querySelector<HTMLInputElement>('#task-start-input')!;
  const durationInput = backdrop.querySelector<HTMLInputElement>('#task-duration-input')!;
  const datetimeWrap = backdrop.querySelector<HTMLDivElement>('#datetime-fields-wrap')!;
  const durationFieldCol = backdrop.querySelector<HTMLDivElement>('#duration-field-col')!;

  const notesInput = backdrop.querySelector<HTMLTextAreaElement>('#task-notes-input')!;
  const checklistEditor = backdrop.querySelector<HTMLDivElement>('#checklist-editor')!;
  const checklistContainer = backdrop.querySelector<HTMLDivElement>('#checklist-items-container')!;
  const newChecklistText = backdrop.querySelector<HTMLInputElement>('#new-checklist-text')!;
  const addChecklistBtn = backdrop.querySelector<HTMLButtonElement>('#add-checklist-item-btn')!;

  const attachImgBtn = backdrop.querySelector<HTMLButtonElement>('#note-attach-img-btn')!;
  const attachFileBtn = backdrop.querySelector<HTMLButtonElement>('#note-attach-file-btn')!;
  const imgFileInput = backdrop.querySelector<HTMLInputElement>('#note-img-input')!;
  const genericFileInput = backdrop.querySelector<HTMLInputElement>('#note-file-input')!;
  const attachmentsList = backdrop.querySelector<HTMLDivElement>('#note-attachments-list')!;

  const linkInput = backdrop.querySelector<HTMLInputElement>('#task-link-input')!;
  const addLinkBtn = backdrop.querySelector<HTMLButtonElement>('#task-add-link-btn')!;
  const draftLinksList = backdrop.querySelector<HTMLDivElement>('#task-draft-links-list')!;

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
      datetimeWrap.style.display = 'grid';
      datetimeWrap.style.gridTemplateColumns = '1.3fr 1fr';
      durationFieldCol.style.display = 'none';
      durationInput.value = '0';
    } else {
      datetimeWrap.style.display = 'grid';
      datetimeWrap.style.gridTemplateColumns = '1.3fr 1fr 0.8fr';
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

  function applyFormatTransformation(prevFmt: ReminderBodyFormat, nextFmt: ReminderBodyFormat) {
    // 1. Convert from checkboxes -> text if leaving checkboxes
    if (prevFmt === 'checkboxes' && nextFmt !== 'checkboxes' && checklist.length > 0) {
      const lines = checklist.map(c => c.text.trim()).filter(Boolean);
      if (lines.length > 0) {
        notesInput.value = lines.join('\n');
      }
    }

    // 2. Convert text -> checkboxes if entering checkboxes
    if (nextFmt === 'checkboxes' && prevFmt !== 'checkboxes') {
      const rawLines = notesInput.value
        .split('\n')
        .map(l => l.replace(/^\s*[•\-*]\s*/, '').trim())
        .filter(Boolean);
      if (rawLines.length > 0 && checklist.length === 0) {
        checklist = rawLines.map(text => ({
          id: 'chk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          text,
          done: false,
        }));
      }
    }

    // 3. Transform text <-> bullets live
    if (nextFmt === 'bullets') {
      const val = notesInput.value;
      if (!val.trim()) {
        notesInput.value = '• ';
      } else {
        notesInput.value = val
          .split('\n')
          .map(l => {
            const clean = l.replace(/^\s*[•\-*]\s*/, '').trim();
            return clean ? `• ${clean}` : '• ';
          })
          .join('\n');
      }
      notesInput.focus();
    } else if (nextFmt === 'paragraph' && prevFmt === 'bullets') {
      notesInput.value = notesInput.value
        .split('\n')
        .map(l => l.replace(/^\s*[•\-*]\s*/, ''))
        .join('\n')
        .trim();
      notesInput.focus();
    }
  }

  function updateBodyFormatUI(fmt: ReminderBodyFormat, transform = false) {
    const prevFmt = currentBodyFormat;
    currentBodyFormat = fmt;

    if (transform && prevFmt !== fmt) {
      applyFormatTransformation(prevFmt, fmt);
    }

    backdrop.querySelectorAll<HTMLButtonElement>('.format-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-fmt') === fmt);
    });

    if (fmt === 'checkboxes') {
      notesInput.style.display = 'none';
      checklistEditor.style.display = 'flex';
      renderChecklistItems();
    } else {
      notesInput.style.display = 'block';
      checklistEditor.style.display = 'none';
    }
  }

  backdrop.querySelectorAll<HTMLButtonElement>('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fmt = (btn.getAttribute('data-fmt') as ReminderBodyFormat) || 'paragraph';
      updateBodyFormatUI(fmt, true);
    });
  });

  // Auto-bullet on Enter & clean Backspace in Bullets mode
  notesInput.addEventListener('keydown', (e) => {
    if (currentBodyFormat !== 'bullets') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const start = notesInput.selectionStart;
      const end = notesInput.selectionEnd;
      const val = notesInput.value;
      notesInput.value = val.slice(0, start) + '\n• ' + val.slice(end);
      notesInput.selectionStart = notesInput.selectionEnd = start + 3;
    } else if (e.key === 'Backspace') {
      const pos = notesInput.selectionStart;
      const lineStart = notesInput.value.lastIndexOf('\n', pos - 1) + 1;
      const lineText = notesInput.value.slice(lineStart, pos);
      if (lineText === '• ') {
        e.preventDefault();
        const removeStart = lineStart > 0 ? lineStart - 1 : 0;
        notesInput.value = notesInput.value.slice(0, removeStart) + notesInput.value.slice(pos);
        notesInput.selectionStart = notesInput.selectionEnd = removeStart;
      }
    }
  });

  function renderChecklistItems() {
    checklistContainer.innerHTML = '';
    checklist.forEach((item, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius-md); background: var(--bg-surface-elevated);';
      row.innerHTML = `
        <input type="checkbox" ${item.done ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--color-red-primary); cursor: pointer;" />
        <input type="text" class="chk-edit-input" value="${item.text.replace(/"/g, '&quot;')}" style="flex: 1; border: none; background: transparent; outline: none; font-size: 0.85rem; font-weight: 600; color: var(--color-black-dominant); ${item.done ? 'text-decoration: line-through; opacity: 0.55;' : ''}" />
        <button type="button" style="border: none; background: transparent; color: var(--color-black-muted); cursor: pointer; font-size: 1rem;">&times;</button>
      `;
      row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.addEventListener('change', (e) => {
        checklist[idx].done = (e.target as HTMLInputElement).checked;
        renderChecklistItems();
      });
      row.querySelector<HTMLInputElement>('.chk-edit-input')?.addEventListener('input', (e) => {
        checklist[idx].text = (e.target as HTMLInputElement).value;
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

  function renderAttachments() {
    attachmentsList.innerHTML = '';

    if (editingPhotoUrl) {
      const card = document.createElement('div');
      card.className = 'note-attachment-card';
      card.style.padding = '4px';
      card.innerHTML = `
        <img src="${editingPhotoUrl}" alt="Attached snapshot" style="width: 48px; height: 48px; border-radius: 8px; object-fit: cover; cursor: pointer;" />
        <span style="font-size: 0.68rem;">Snapshot</span>
        <button type="button" title="Remove photo" style="border: none; background: transparent; color: var(--color-black-muted); cursor: pointer; font-size: 0.9rem;">&times;</button>
      `;
      card.querySelector('img')?.addEventListener('click', () => {
        if (editingPhotoUrl) openImageLightbox(editingPhotoUrl, titleInput.value || 'Snapshot');
      });
      card.querySelector('button')?.addEventListener('click', () => {
        editingPhotoUrl = undefined;
        renderAttachments();
      });
      attachmentsList.appendChild(card);
    }

    draftAttachments.forEach((att, idx) => {
      const card = document.createElement('div');
      card.className = 'note-attachment-card';
      const isImg = att.mimeType.startsWith('image/');
      if (isImg) {
        card.style.padding = '4px 8px 4px 4px';
        card.innerHTML = `
          <img src="${att.dataUrl}" alt="${att.name}" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; cursor: pointer;" />
          <span style="max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${att.name}</span>
          <button type="button" title="Remove" style="border: none; background: transparent; color: var(--color-black-muted); cursor: pointer; font-size: 0.9rem;">&times;</button>
        `;
        card.querySelector('img')?.addEventListener('click', () => openImageLightbox(att.dataUrl, att.name));
      } else {
        const kb = Math.max(1, Math.round(att.size / 1024));
        card.innerHTML = `
          <a href="${att.dataUrl}" download="${att.name}" style="color: var(--color-red-primary); text-decoration: none; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${att.name}</a>
          <span style="font-size: 0.62rem; color: var(--color-black-muted);">${kb} KB</span>
          <button type="button" title="Remove" style="border: none; background: transparent; color: var(--color-black-muted); cursor: pointer; font-size: 0.9rem;">&times;</button>
        `;
      }
      card.querySelector('button')?.addEventListener('click', () => {
        draftAttachments.splice(idx, 1);
        renderAttachments();
      });
      attachmentsList.appendChild(card);
    });
  }

  attachImgBtn.addEventListener('click', () => imgFileInput.click());
  attachFileBtn.addEventListener('click', () => genericFileInput.click());

  imgFileInput.addEventListener('change', async () => {
    const file = imgFileInput.files?.[0];
    imgFileInput.value = '';
    if (!file) return;
    const dataUrl = await compressAttachmentImage(file);
    draftAttachments.push({
      id: 'att_' + Date.now(),
      name: file.name,
      mimeType: file.type || 'image/jpeg',
      size: file.size,
      dataUrl,
    });
    renderAttachments();
  });

  genericFileInput.addEventListener('change', async () => {
    const file = genericFileInput.files?.[0];
    genericFileInput.value = '';
    if (!file) return;
    if (file.size > 1200 * 1024) {
      alert('Please keep attached files under 1.2 MB for fast offline & cloud sync.');
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    draftAttachments.push({
      id: 'att_' + Date.now(),
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl,
    });
    renderAttachments();
  });

  function renderDraftLinks() {
    draftLinksList.innerHTML = '';
    draftLinks.forEach((lnk, idx) => {
      const chip = document.createElement('span');
      chip.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 9px;
        border-radius: 999px;
        background: var(--color-red-subtle);
        border: 1px solid rgba(229, 46, 46, 0.25);
        font-size: 0.68rem;
        font-weight: 800;
      `;
      const a = document.createElement('a');
      a.href = lnk.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `${lnk.label} ↗`;
      a.style.cssText = 'color: var(--color-red-primary); text-decoration: none;';
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = '×';
      rm.style.cssText =
        'border: none; background: transparent; color: var(--color-black-muted); font-size: 0.85rem; cursor: pointer; padding: 0 2px; line-height: 1;';
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

  completeBtn.addEventListener('click', async () => {
    if (!editingTaskId || editingIsNote) return;
    const updated = await taskRepository.toggleTaskCompletion(editingTaskId);
    editingCompleted = updated.completed;
    completeBtn.textContent = editingCompleted ? 'Reopen' : 'Done';
    if (updated.completed) {
      const stats = await userStatsRepository.incrementTaskCount();
      eventBus.emit(AppEvents.STATS_UPDATED, stats);
    } else if (userStatsRepository.decrementTaskCount) {
      const stats = await userStatsRepository.decrementTaskCount();
      eventBus.emit(AppEvents.STATS_UPDATED, stats);
    }
    eventBus.emit(AppEvents.TASK_COMPLETED, updated);
    close();
  });

  deleteBtn.addEventListener('click', async () => {
    if (!editingTaskId) return;
    if (editingIsNote) {
      await noteRepository.deleteNote(editingTaskId.replace('note_as_task_', ''));
      eventBus.emit(AppEvents.NOTE_DELETED);
    } else {
      await taskRepository.deleteTask(editingTaskId);
      eventBus.emit(AppEvents.TASK_DELETED);
    }
    close();
  });

  const open = (prefillDate?: string, editTask?: Task) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayString = `${y}-${m}-${day}`;

    if (editTask) {
      editingTaskId = editTask.id || null;
      editingIsNote = Boolean(editTask.id && editTask.id.startsWith('note_as_task_'));
      editingCompleted = Boolean(editTask.completed);
      editingPhotoUrl = editTask.photoUrl;
      draftAttachments = [...(editTask.attachments || [])];

      headingEl.textContent = editingTaskId ? 'Note Details' : 'New Note';
      submitBtn.textContent = 'Save';
      completeBtn.style.display = editingTaskId && !editingIsNote ? 'inline-flex' : 'none';
      completeBtn.textContent = editingCompleted ? 'Reopen' : 'Done';
      deleteBtn.style.display = editingTaskId ? 'inline-flex' : 'none';

      titleInput.value = editTask.title || '';
      categorySelect.value = editTask.category || 'personal';
      urgencySelect.value = editTask.urgency || 'medium';
      dateInput.value = typeof editTask.date === 'string' ? editTask.date : prefillDate || todayString;
      startInput.value = editTask.startTime || '';
      durationInput.value = String(editTask.durationMinutes ?? 0);
      notesInput.value = editTask.notes || '';
      draftLinks = [...(editTask.links || [])];
      checklist = editTask.checklistItems ? [...editTask.checklistItems] : [];
      linkInput.value = '';
      renderDraftLinks();
      renderAttachments();
      updateTimeModeUI(resolveReminderTimeMode(editTask));
      updateBodyFormatUI(editTask.bodyFormat || (checklist.length > 0 ? 'checkboxes' : 'paragraph'), false);
    } else {
      editingTaskId = null;
      editingIsNote = false;
      editingCompleted = false;
      editingPhotoUrl = undefined;
      draftAttachments = [];
      headingEl.textContent = 'New Note';
      submitBtn.textContent = 'Save';
      completeBtn.style.display = 'none';
      deleteBtn.style.display = 'none';

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
      renderAttachments();
      updateTimeModeUI('duration');
      updateBodyFormatUI('paragraph', false);
    }

    backdrop.classList.add('open');
    titleInput?.focus();
  };

  const close = () => {
    editingTaskId = null;
    editingIsNote = false;
    backdrop.classList.remove('open');
  };

  closeBtn.addEventListener('click', close);

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

    if (editingTaskId && editingIsNote) {
      const realNoteId = editingTaskId.replace('note_as_task_', '');
      if (currentTimeMode === 'none') {
        await noteRepository.updateNote(realNoteId, {
          content: notes || title,
          category,
          priority: urgency,
          bodyFormat: currentBodyFormat,
          checklistItems: checklist.length > 0 ? checklist : undefined,
          photoUrl: editingPhotoUrl,
          links: finalLinks.length > 0 ? finalLinks : undefined,
        });
        eventBus.emit(AppEvents.NOTE_UPDATED);
      } else {
        // Promoted timeless Note -> Timed/Deadline Task seamlessly
        await noteRepository.deleteNote(realNoteId);
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
          photoUrl: editingPhotoUrl,
          links: finalLinks.length > 0 ? finalLinks : undefined,
          attachments: draftAttachments.length > 0 ? draftAttachments : undefined,
        });
        eventBus.emit(AppEvents.NOTE_DELETED);
        eventBus.emit(AppEvents.TASK_CREATED);
      }
    } else if (editingTaskId) {
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
        photoUrl: editingPhotoUrl,
        links: finalLinks.length > 0 ? finalLinks : undefined,
        attachments: draftAttachments.length > 0 ? draftAttachments : undefined,
      });
      eventBus.emit(AppEvents.TASK_UPDATED);
      const spoken = `Updated "${title}", Bruv.`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, { headline: `Updated "${title}"`, subspeech: spoken });
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
        photoUrl: editingPhotoUrl,
        links: finalLinks.length > 0 ? finalLinks : undefined,
        attachments: draftAttachments.length > 0 ? draftAttachments : undefined,
      });
      eventBus.emit(AppEvents.TASK_CREATED);
      const spoken = `I got you, Bruv! Saved "${title}".`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, { headline: `Saved "${title}"`, subspeech: spoken });
      voiceService.speak(spoken);
      notificationService.playAlarmChime('success');
    }

    close();
  });

  return { backdrop, open, close };
}
