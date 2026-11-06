import { taskRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import type { Task, TaskCategory, UrgencyLevel } from '../../types/task';

export function renderTaskFormModal(): { backdrop: HTMLElement; open: (prefillDate?: string, editTask?: Task) => void; close: () => void } {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  let editingTaskId: string | null = null;

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
            placeholder="e.g. Capstone manuscript, GDG Workshop, Gym" 
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
          <label class="form-label" for="task-date-input">Scheduled Date *</label>
          <input 
            type="date" 
            id="task-date-input" 
            class="form-input" 
            required 
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="task-start-input">Start Time *</label>
            <input 
              type="time" 
              id="task-start-input" 
              class="form-input" 
              required 
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="task-duration-input">Duration (Mins) *</label>
            <input 
              type="number" 
              id="task-duration-input" 
              class="form-input" 
              min="10" 
              max="480" 
              step="5" 
              value="60" 
              required 
            />
          </div>
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
  const notesInput = backdrop.querySelector<HTMLTextAreaElement>('#task-notes-input')!;

  const open = (prefillDate?: string, editTask?: Task) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayString = `${y}-${m}-${day}`;

    if (editTask) {
      editingTaskId = editTask.id;
      headingEl.textContent = 'Edit Task & Time-Block';
      submitBtn.textContent = 'Save Changes to Focus Orbit';
      titleInput.value = editTask.title;
      categorySelect.value = editTask.category;
      urgencySelect.value = editTask.urgency;
      dateInput.value = editTask.date || prefillDate || todayString;
      startInput.value = editTask.startTime;
      durationInput.value = String(editTask.durationMinutes);
      notesInput.value = editTask.notes || '';
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
    const title = titleInput.value;
    const category = categorySelect.value as TaskCategory;
    const urgency = urgencySelect.value as UrgencyLevel;
    const date = dateInput.value;
    const startTime = startInput.value;
    const durationMinutes = parseInt(durationInput.value, 10);
    const notes = notesInput.value;

    if (editingTaskId) {
      const updatedTask = await taskRepository.updateTask(editingTaskId, {
        title: title.trim(),
        category,
        urgency,
        date,
        startTime,
        durationMinutes,
        notes: notes.trim() || undefined,
      });
      eventBus.emit(AppEvents.TASK_UPDATED, updatedTask);
      eventBus.emit(AppEvents.TASK_CREATED, updatedTask);
    } else {
      const newTask = await taskRepository.createTask({
        title,
        category,
        urgency,
        date,
        startTime,
        durationMinutes,
        notes: notes.trim() || undefined,
      });
      eventBus.emit(AppEvents.TASK_CREATED, newTask);
    }

    form.reset();
    close();
  });

  return { backdrop, open, close };
}
