import { taskRepository, userStatsRepository } from '../../services/storage';
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
import type { Task } from '../../types/task';

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

  function formatShortDateBadge(dateStr: string): string {
    if (!dateStr) return 'No date';
    const parsed = new Date(dateStr + 'T00:00:00');
    if (isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function loadTasks() {
    const allTasks = await taskRepository.getAllTasks();
    const todayStr = getTodayString();
    const isToday = activeDate === todayStr;

    // Tasks for activeDate (include undated uncompleted tasks when viewing Today)
    const rawTasks = allTasks.filter(
      t => t.date === activeDate || (isToday && !t.date)
    );

    // Also surface uncompleted deadlines saved on other dates so saved links/QR codes are always reachable
    const otherDateDeadlines = allTasks
      .filter(t => !t.completed && Boolean(t.date) && t.date !== activeDate)
      .sort((a, b) => a.date.localeCompare(b.date));

    const now = new Date();
    const currentFraction = isToday ? now.getHours() + now.getMinutes() / 60 : 0;
    const tasks = sortTasksSmartly(rawTasks, currentFraction);

    const dateFormatted = new Date(activeDate + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const headerTitle = isToday
      ? `Today's Schedule (${tasks.length})`
      : `${dateFormatted} Schedule (${tasks.length})`;

    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">${headerTitle}</h2>
        <button class="section-action" id="header-add-task-btn">+ Add Task</button>
      </div>
      ${
        tasks.length === 0
          ? `<div class="empty-state">
               <h3 class="empty-state-title">No scheduled tasks for this day</h3>
               <p class="empty-state-sub">Tap "+ Add Task" or scan a screenshot/QR poster above.</p>
             </div>`
          : `<div class="task-list" id="task-items-container"></div>`
      }
      ${
        otherDateDeadlines.length > 0
          ? `<div style="margin-top: var(--spacing-3); padding-top: var(--spacing-2); border-top: 1px dashed var(--border-medium);">
               <div style="font-size: 0.68rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">
                 Saved Deadlines & Upcoming Dates (${otherDateDeadlines.length})
               </div>
               <div class="task-list" id="other-deadlines-container"></div>
             </div>`
          : ''
      }
    `;

    container.querySelector('#header-add-task-btn')?.addEventListener('click', () => onOpenForm(activeDate));

    const listContainer = container.querySelector('#task-items-container');
    if (listContainer) {
      tasks.forEach(task => {
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
    if (task.startTime && task.durationMinutes > 0) {
      return `${task.startTime} (${task.durationMinutes}m)`;
    }
    if (task.startTime) {
      return task.startTime;
    }
    if (task.durationMinutes > 0) {
      return `${task.durationMinutes}m`;
    }
    return 'No set time';
  }

  function createTaskItemElement(task: Task, showDateBadge: boolean = false): HTMLElement {
    const el = document.createElement('div');
    el.className = `task-item ${task.completed ? 'completed' : ''}`;
    el.id = `task-item-${task.id}`;

    const mergedLinks = mergeSavedLinks(task.links, extractLinksFromText(task.notes || ''));
    const linksHtml = renderSavedLinksHtml(mergedLinks);

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
        <div class="task-meta" style="flex-wrap: wrap;">
          <span class="tag-badge tag-${task.category}">${task.category}</span>
          ${
            showDateBadge
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
        ${linksHtml}
      </div>

      ${
        task.photoUrl
          ? `<img src="${task.photoUrl}" alt="Attached Screenshot" class="task-mini-thumb" title="Tap to zoom image" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-medium); cursor: pointer; flex-shrink: 0;" />`
          : ''
      }

      <div style="display: flex; align-items: center; gap: 4px;">
        <button class="task-delete-btn task-edit-btn" data-edit-id="${task.id}" title="Edit Task" style="color: var(--color-black-muted);">
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="task-delete-btn task-remove-btn" data-delete-id="${task.id}" title="Delete Task">
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

    const checkbox = el.querySelector('.task-checkbox')!;
    checkbox.addEventListener('click', async () => {
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
      if (confirm(`Delete task "${task.title}"?`)) {
        await taskRepository.deleteTask(task.id);
        eventBus.emit(AppEvents.TASK_DELETED, task.id);
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
  eventBus.on(AppEvents.DATE_SELECTED, (newDate: string) => {
    if (newDate) {
      activeDate = newDate;
      loadTasks();
    }
  });

  loadTasks();
  return container;
}
