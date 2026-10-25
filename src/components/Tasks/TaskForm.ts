import { taskRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import type { TaskCategory, UrgencyLevel } from '../../types/task';

export function renderTaskFormModal(): { backdrop: HTMLElement; open: () => void; close: () => void } {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h3 class="modal-title">New Task & Time-Block</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>

      <form id="create-task-form">
        <div class="form-group">
          <label class="form-label" for="task-title-input">Task Title *</label>
          <input 
            type="text" 
            id="task-title-input" 
            class="form-input" 
            placeholder="e.g. Study Data Structures, Review Slides" 
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
              value="45" 
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

        <button type="submit" class="btn btn-primary btn-full" style="margin-top: var(--spacing-2);">
          Add to Schedule & Focus Orbit
        </button>
      </form>
    </div>
  `;

  const form = backdrop.querySelector<HTMLFormElement>('#create-task-form')!;
  const closeBtn = backdrop.querySelector<HTMLButtonElement>('#modal-close-btn')!;
  const startInput = backdrop.querySelector<HTMLInputElement>('#task-start-input')!;

  const open = () => {
    // Default to current local time in HH:mm
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
    startInput.value = `${hours}:${minutes}`;

    backdrop.classList.add('open');
    const titleInput = backdrop.querySelector<HTMLInputElement>('#task-title-input');
    titleInput?.focus();
  };

  const close = () => {
    backdrop.classList.remove('open');
  };

  closeBtn.addEventListener('click', close);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = (backdrop.querySelector<HTMLInputElement>('#task-title-input')!).value;
    const category = (backdrop.querySelector<HTMLSelectElement>('#task-category-select')!).value as TaskCategory;
    const urgency = (backdrop.querySelector<HTMLSelectElement>('#task-urgency-select')!).value as UrgencyLevel;
    const startTime = (backdrop.querySelector<HTMLInputElement>('#task-start-input')!).value;
    const durationMinutes = parseInt((backdrop.querySelector<HTMLInputElement>('#task-duration-input')!).value, 10);
    const notes = (backdrop.querySelector<HTMLTextAreaElement>('#task-notes-input')!).value;

    const newTask = await taskRepository.createTask({
      title,
      category,
      urgency,
      startTime,
      durationMinutes,
      notes: notes.trim() || undefined,
    });

    eventBus.emit(AppEvents.TASK_CREATED, newTask);
    form.reset();
    close();
  });

  return { backdrop, open, close };
}
