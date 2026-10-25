import { taskRepository, userStatsRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import type { Task } from '../../types/task';

export function renderTaskList(onOpenForm: () => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';

  async function loadTasks() {
    const tasks = await taskRepository.getAllTasks();

    // Sort by startTime
    tasks.sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-state-title">No scheduled tasks yet</h3>
          <p class="empty-state-sub">Add real tasks with start times to visualize your day on the Focus Orbit.</p>
          <button class="btn btn-primary" id="empty-add-btn">
            + Add Task
          </button>
        </div>
      `;

      container.querySelector('#empty-add-btn')?.addEventListener('click', onOpenForm);
      return;
    }

    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Today's Schedule (${tasks.length})</h2>
        <button class="section-action" id="header-add-task-btn">+ Add Task</button>
      </div>
      <div class="task-list" id="task-items-container"></div>
    `;

    container.querySelector('#header-add-task-btn')?.addEventListener('click', onOpenForm);

    const listContainer = container.querySelector('#task-items-container')!;

    tasks.forEach(task => {
      const itemEl = createTaskItemElement(task);
      listContainer.appendChild(itemEl);
    });
  }

  function createTaskItemElement(task: Task): HTMLElement {
    const el = document.createElement('div');
    el.className = `task-item ${task.completed ? 'completed' : ''}`;
    el.id = `task-item-${task.id}`;

    el.innerHTML = `
      <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-id="${task.id}" title="Toggle Completion">
        ${task.completed ? `
          <svg viewBox="0 0 24 24" width="14" height="14">
            <polyline points="20 6 9 17 4 12" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"></polyline>
          </svg>
        ` : ''}
      </div>

      <div class="task-details">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          <span class="tag-badge tag-${task.category}">${task.category}</span>
          <span>${task.startTime} (${task.durationMinutes}m)</span>
          ${task.urgency === 'high' ? '<span class="urgency-high">PRIORITY</span>' : ''}
        </div>
      </div>

      <button class="task-delete-btn" data-delete-id="${task.id}" title="Delete Task">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    // Checkbox toggle handler
    const checkbox = el.querySelector('.task-checkbox')!;
    checkbox.addEventListener('click', async () => {
      const updated = await taskRepository.toggleTaskCompletion(task.id);
      if (updated.completed) {
        const stats = await userStatsRepository.incrementTaskCount();
        eventBus.emit(AppEvents.STATS_UPDATED, stats);
      }
      eventBus.emit(AppEvents.TASK_COMPLETED, updated);
      loadTasks();
    });

    // Delete handler
    const deleteBtn = el.querySelector('.task-delete-btn')!;
    deleteBtn.addEventListener('click', async () => {
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

  // Subscribe to changes
  eventBus.on(AppEvents.TASK_CREATED, () => loadTasks());
  eventBus.on(AppEvents.TASK_DELETED, () => loadTasks());

  loadTasks();
  return container;
}
