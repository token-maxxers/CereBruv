import { taskRepository, noteRepository, userStatsRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import { voiceService } from '../../services/voice/VoiceService';
import { notificationService } from '../../services/notifications/NotificationService';
import {
  extractLinksFromText,
  mergeSavedLinks,
  openImageLightbox,
  renderSavedLinksHtml,
} from '../../utils/imageUtils';
import { sortTasksSmartly } from '../FocusOrbit/orbitCalculator';
import { resolveReminderTimeMode, type Task } from '../../types/task';

type FilterType = 'all' | 'duration' | 'one-time' | 'timeless';

export function renderTaskList(onOpenForm: (date?: string, editTask?: Task) => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';

  function getTodayString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  let activeDate = getTodayString();
  let currentFilter: FilterType = 'all';

  function formatShortDateBadge(dateStr: string): string {
    if (!dateStr) return 'No date';
    const parsed = new Date(dateStr + 'T00:00:00');
    if (isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function loadTasks() {
    const [allTasks, allNotes] = await Promise.all([
      taskRepository.getAllTasks(),
      noteRepository.getAllNotes(),
    ]);

    // Convert notes into task-compatible reminder view items (seamless unification)
    const noteItemsAsTasks: Task[] = allNotes.map(n => ({
      id: `note_as_task_${n.id}`,
      title: n.content,
      category: n.category || 'personal',
      date: '',
      startTime: '',
      durationMinutes: 0,
      urgency: n.priority || 'medium',
      completed: false,
      timeMode: 'none',
      bodyFormat: n.bodyFormat,
      checklistItems: n.checklistItems,
      eventGroupId: n.eventGroupId,
      notes: n.content,
      photoUrl: n.photoUrl,
      links: n.links,
      createdAt: n.createdAt,
      updatedAt: n.createdAt,
    }));

    const combinedList = [...allTasks, ...noteItemsAsTasks];
    const todayStr = getTodayString();
    const isToday = activeDate === todayStr;

    // Filter by timing type tab (All vs Duration vs One-Time vs Timeless)
    const matchesTimingFilter = (t: Task): boolean => {
      const mode = resolveReminderTimeMode(t);
      if (currentFilter === 'all') return true;
      if (currentFilter === 'duration') return mode === 'duration';
      if (currentFilter === 'one-time') return mode === 'one-time';
      if (currentFilter === 'timeless') return mode === 'none';
      return true;
    };

    // Filter items relevant for activeDate or timeless
    const filteredForDay = combinedList.filter(t => {
      if (!matchesTimingFilter(t)) return false;
      const mode = resolveReminderTimeMode(t);
      if (mode === 'none') {
        return currentFilter === 'timeless' || isToday;
      }
      return t.date === activeDate || (isToday && !t.date);
    });

    const otherDateDeadlines = allTasks
      .filter(t => !t.completed && Boolean(t.date) && t.date !== activeDate && matchesTimingFilter(t))
      .sort((a, b) => a.date.localeCompare(b.date));

    const now = new Date();
    const currentFraction = isToday ? now.getHours() + now.getMinutes() / 60 : 0;
    const sortedTasks = sortTasksSmartly(filteredForDay, currentFraction);

    const dateFormatted = new Date(activeDate + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const headerTitle = isToday
      ? `Today's Reminders (${sortedTasks.length})`
      : `${dateFormatted} Reminders (${sortedTasks.length})`;

    container.innerHTML = `
      <div class="section-header" style="margin-bottom: 6px;">
        <h2 class="section-title">${headerTitle}</h2>
        <button class="section-action" id="header-add-task-btn">+ New Reminder</button>
      </div>

      <!-- Clean Timing Filter Pills (Turns Red when clicked) -->
      <div style="display: flex; gap: 5px; overflow-x: auto; padding-bottom: 6px; margin-bottom: var(--spacing-2);" id="reminders-filter-bar">
        <button type="button" class="pill-badge ${currentFilter === 'all' ? 'active' : ''}" data-filt="all" style="font-size: 0.65rem;">
          ALL (${combinedList.length})
        </button>
        <button type="button" class="pill-badge ${currentFilter === 'duration' ? 'active' : ''}" data-filt="duration" style="font-size: 0.65rem;">
          DURATION BLOCKS (${combinedList.filter(t => resolveReminderTimeMode(t) === 'duration').length})
        </button>
        <button type="button" class="pill-badge ${currentFilter === 'one-time' ? 'active' : ''}" data-filt="one-time" style="font-size: 0.65rem;">
          ONE-TIME / DEADLINES (${combinedList.filter(t => resolveReminderTimeMode(t) === 'one-time').length})
        </button>
        <button type="button" class="pill-badge ${currentFilter === 'timeless' ? 'active' : ''}" data-filt="timeless" style="font-size: 0.65rem;">
          TIMELESS NOTES (${combinedList.filter(t => resolveReminderTimeMode(t) === 'none').length})
        </button>
      </div>

      ${
        sortedTasks.length === 0
          ? `<div class="empty-state">
               <h3 class="empty-state-title">No reminders in this view</h3>
               <p class="empty-state-sub">Tap "+ New Reminder", scan a photo, or say "Remind me..."</p>
             </div>`
          : `<div class="task-list" id="task-items-container"></div>`
      }
      ${
        otherDateDeadlines.length > 0 && currentFilter !== 'timeless'
          ? `<div style="margin-top: var(--spacing-3); padding-top: var(--spacing-2); border-top: 1px dashed var(--border-medium);">
               <div style="font-size: 0.68rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">
                 Saved Deadlines & Other Dates (${otherDateDeadlines.length})
               </div>
               <div class="task-list" id="other-deadlines-container"></div>
             </div>`
          : ''
      }
    `;

    container.querySelectorAll<HTMLButtonElement>('#reminders-filter-bar .pill-badge').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = (btn.getAttribute('data-filt') as FilterType) || 'all';
        loadTasks();
      });
    });

    container.querySelector('#header-add-task-btn')?.addEventListener('click', () => onOpenForm(activeDate));

    const listContainer = container.querySelector('#task-items-container');
    if (listContainer) {
      sortedTasks.forEach(task => {
        listContainer.appendChild(createTaskItemElement(task, !task.date));
      });
    }

    const otherContainer = container.querySelector('#other-deadlines-container');
    if (otherContainer) {
      otherDateDeadlines.forEach(task => {
        otherContainer.appendChild(createTaskItemElement(task, true));
      });
    }
  }

  function formatTaskTimeMeta(task: Task): string {
    const mode = resolveReminderTimeMode(task);
    if (mode === 'duration' && task.startTime) {
      return `${task.startTime} (${task.durationMinutes}m block)`;
    }
    if (mode === 'one-time' && task.startTime) {
      return `Alarm at ${task.startTime}`;
    }
    if (mode === 'none') {
      return 'Timeless Idea';
    }
    if (task.startTime) {
      return task.startTime;
    }
    return 'Flexible / No set time';
  }

  function createTaskItemElement(task: Task, showDateBadge: boolean = false): HTMLElement {
    const el = document.createElement('div');
    el.className = `task-item ${task.completed ? 'completed' : ''}`;
    el.id = `task-item-${task.id}`;

    const isNoteItem = task.id.startsWith('note_as_task_');
    const realNoteId = isNoteItem ? task.id.replace('note_as_task_', '') : null;
    const mode = resolveReminderTimeMode(task);

    const mergedLinks = mergeSavedLinks(task.links, extractLinksFromText(task.notes || ''));
    const linksHtml = renderSavedLinksHtml(mergedLinks);

    const modeBadge = mode === 'duration'
      ? '<span style="font-size: 0.6rem; font-weight: 800; padding: 1px 6px; border-radius: 4px; background: rgba(13,148,136,0.12); color: #0D9488;">ORBIT BLOCK</span>'
      : mode === 'one-time'
        ? '<span style="font-size: 0.6rem; font-weight: 800; padding: 1px 6px; border-radius: 4px; background: rgba(217,119,6,0.12); color: #D97706;">ONE-TIME</span>'
        : '<span style="font-size: 0.6rem; font-weight: 800; padding: 1px 6px; border-radius: 4px; background: rgba(56,189,248,0.14); color: #0284C7;">NOTE</span>';

    // Sub-checklist preview if present
    let checklistPreviewHtml = '';
    if (task.checklistItems && task.checklistItems.length > 0) {
      const doneCount = task.checklistItems.filter(c => c.done).length;
      checklistPreviewHtml = `
        <div style="margin-top: 5px; display: flex; flex-direction: column; gap: 3px; padding-left: 2px;">
          <span style="font-size: 0.62rem; font-weight: 700; color: var(--color-black-muted);">
            Checklist (${doneCount}/${task.checklistItems.length}):
          </span>
          ${task.checklistItems.map((chk, i) => `
            <label style="display: flex; align-items: center; gap: 5px; font-size: 0.68rem; color: var(--color-black-dominant); cursor: pointer;">
              <input type="checkbox" class="task-sub-chk" data-task-id="${task.id}" data-chk-idx="${i}" ${chk.done ? 'checked' : ''} />
              <span style="${chk.done ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escapeHtml(chk.text)}</span>
            </label>
          `).join('')}
        </div>
      `;
    }

    el.innerHTML = `
      <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-id="${task.id}" title="Toggle Completion">
        ${task.completed ? `
          <svg viewBox="0 0 24 24" width="14" height="14">
            <polyline points="20 6 9 17 4 12" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"></polyline>
          </svg>
        ` : ''}
      </div>

      <div class="task-details" style="min-width: 0;">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta" style="flex-wrap: wrap; gap: 4px; align-items: center;">
          ${modeBadge}
          <span class="tag-badge tag-${task.category}">${task.category}</span>
          ${
            showDateBadge && task.date
              ? `<span style="font-size: 0.64rem; font-weight: 800; color: var(--color-black-dominant); background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); padding: 1px 6px; border-radius: 4px;">${escapeHtml(formatShortDateBadge(task.date))}</span>`
              : ''
          }
          <span>${escapeHtml(formatTaskTimeMeta(task))}</span>
          ${task.urgency === 'high' ? '<span class="urgency-high">PRIORITY</span>' : ''}
          ${
            task.photoUrl
              ? '<button type="button" class="pill-badge view-task-photo-btn" style="cursor: pointer; font-size: 0.6rem; padding: 1px 6px;">Image</button>'
              : ''
          }
        </div>
        ${checklistPreviewHtml}
        ${linksHtml}
      </div>

      ${
        task.photoUrl
          ? `<img src="${task.photoUrl}" alt="Attached Screenshot" class="task-mini-thumb" title="Tap to zoom image" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-medium); cursor: pointer; flex-shrink: 0;" />`
          : ''
      }

      <div style="display: flex; align-items: center; gap: 4px;">
        <button class="task-delete-btn task-edit-btn" data-edit-id="${task.id}" title="Edit Reminder" style="color: var(--color-black-muted);">
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="task-delete-btn task-remove-btn" data-delete-id="${task.id}" title="Delete Reminder">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    el.querySelectorAll<HTMLAnchorElement>('.saved-link-pill').forEach(a => {
      a.addEventListener('click', ev => ev.stopPropagation());
    });

    // Sub-item checklist change listeners
    el.querySelectorAll<HTMLInputElement>('.task-sub-chk').forEach(input => {
      input.addEventListener('change', async (e) => {
        e.stopPropagation();
        const chkIdx = parseInt(input.getAttribute('data-chk-idx') || '-1', 10);
        if (chkIdx >= 0 && task.checklistItems && task.checklistItems[chkIdx]) {
          task.checklistItems[chkIdx].done = input.checked;
          if (isNoteItem && realNoteId) {
            await noteRepository.updateNote(realNoteId, { checklistItems: task.checklistItems });
            eventBus.emit(AppEvents.NOTE_UPDATED);
          } else {
            await taskRepository.updateTask(task.id, { checklistItems: task.checklistItems });
            eventBus.emit(AppEvents.TASK_UPDATED);
          }
          loadTasks();
        }
      });
    });

    const checkbox = el.querySelector('.task-checkbox')!;
    checkbox.addEventListener('click', async () => {
      if (isNoteItem && realNoteId) {
        await noteRepository.deleteNote(realNoteId);
        eventBus.emit(AppEvents.NOTE_CREATED);
        loadTasks();
        return;
      }

      const updated = await taskRepository.toggleTaskCompletion(task.id);
      if (updated.completed) {
        const stats = await userStatsRepository.incrementTaskCount();
        eventBus.emit(AppEvents.STATS_UPDATED, stats);
        const congrats = `Awesome job, Bruv! You crushed "${updated.title}" and earned 25 XP!`;
        eventBus.emit(AppEvents.MASCOT_SPEAK, {
          headline: `Crushed "${updated.title}" (+25 XP)!`,
          subspeech: congrats,
        });
        voiceService.speak(congrats);
        notificationService.playAlarmChime('success');
        notificationService.triggerVibration([120, 60, 180]);
      }
      eventBus.emit(AppEvents.TASK_COMPLETED, updated);
      loadTasks();
    });

    const editBtn = el.querySelector('.task-edit-btn')!;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpenForm(task.date, task);
    });

    if (task.photoUrl) {
      const openPhoto = (e: Event) => {
        e.stopPropagation();
        openImageLightbox(task.photoUrl!, task.title);
      };
      el.querySelector('.view-task-photo-btn')?.addEventListener('click', openPhoto);
      el.querySelector('.task-mini-thumb')?.addEventListener('click', openPhoto);
    }

    const deleteBtn = el.querySelector('.task-remove-btn')!;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete reminder "${task.title}"?`)) {
        if (isNoteItem && realNoteId) {
          await noteRepository.deleteNote(realNoteId);
          eventBus.emit(AppEvents.NOTE_CREATED);
        } else {
          await taskRepository.deleteTask(task.id);
          eventBus.emit(AppEvents.TASK_DELETED, task.id);
        }
        loadTasks();
      }
    });

    return el;
  }

  function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  eventBus.on(AppEvents.TASK_CREATED, () => loadTasks());
  eventBus.on(AppEvents.TASK_UPDATED, () => loadTasks());
  eventBus.on(AppEvents.TASK_COMPLETED, () => loadTasks());
  eventBus.on(AppEvents.TASK_DELETED, () => loadTasks());
  eventBus.on(AppEvents.NOTE_CREATED, () => loadTasks());
  eventBus.on(AppEvents.NOTE_UPDATED, () => loadTasks());
  eventBus.on(AppEvents.DATE_SELECTED, (newDate: string) => {
    if (newDate) {
      activeDate = newDate;
      loadTasks();
    }
  });

  loadTasks();
  return container;
}
