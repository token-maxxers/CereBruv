import { noteRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import { CATEGORY_COLORS } from '../FocusOrbit/orbitCalculator';
import type { QuickNote } from '../../types/note';
import type { Task, TaskCategory } from '../../types/task';

const CATEGORY_OPTIONS: { value: TaskCategory; label: string }[] = [
  { value: 'study', label: 'Study' },
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal' },
  { value: 'event', label: 'Event' },
  { value: 'rest', label: 'Rest' },
];

export function renderThoughtsView(
  onConvertToTask: (prefillDate?: string, draftTask?: Task) => void,
  getSelectedDate: () => string
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';
  container.style.padding = 'var(--spacing-3)';

  let activeCategoryFilter: 'all' | TaskCategory = 'all';

  container.innerHTML = `
    <div class="section-header" style="margin-bottom: var(--spacing-2);">
      <div>
        <h2 class="section-title">Second Brain Thoughts</h2>
        <span style="font-size: var(--font-size-xs); color: var(--color-black-muted);">
          Saved voice & typed brain-dumps — tagged into your Mind Graph
        </span>
      </div>
      <span class="pill-badge" id="thoughts-count-badge" style="font-size: 0.68rem;">0 saved</span>
    </div>

    <!-- Quick Add Thought Bar inside Thoughts View -->
    <div style="display: flex; flex-direction: column; gap: 6px; background: var(--bg-primary); border: 1px solid var(--border-medium); border-radius: var(--radius-md); padding: var(--spacing-2); margin-bottom: var(--spacing-3);">
      <textarea
        id="new-thought-textarea"
        rows="2"
        placeholder="Capture a quick thought, idea, or voice note..."
        style="width: 100%; border: none; background: transparent; resize: none; font-family: inherit; font-size: var(--font-size-sm); color: var(--color-black-dominant); outline: none;"
      ></textarea>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--border-subtle); padding-top: 6px;">
        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;" id="new-thought-tag-pills">
          <span style="font-size: 0.65rem; font-weight: 700; color: var(--color-black-muted); margin-right: 2px;">TAG:</span>
          ${CATEGORY_OPTIONS.map(
            (c, idx) => `
            <button type="button" class="pill-badge thought-tag-Option ${idx === 2 ? 'active' : ''}" data-cat="${c.value}" style="cursor: pointer; font-size: 0.62rem; padding: 2px 7px;">
              ${c.label}
            </button>
          `
          ).join('')}
        </div>
        <button id="save-thought-btn" class="btn btn-primary" style="padding: 5px 12px; font-size: var(--font-size-xs);">
          Save Thought
        </button>
      </div>
    </div>

    <!-- Category Filter Strip -->
    <div id="thoughts-filter-strip" style="display: flex; gap: 4px; overflow-x: auto; padding-bottom: 6px; margin-bottom: var(--spacing-2);">
      <button class="pill-badge active" data-filter="all" style="cursor: pointer; font-size: 0.65rem;">ALL</button>
      ${CATEGORY_OPTIONS.map(
        c => `
        <button class="pill-badge" data-filter="${c.value}" style="cursor: pointer; font-size: 0.65rem;">
          ${c.label.toUpperCase()}
        </button>
      `
      ).join('')}
    </div>

    <!-- Thoughts List Container -->
    <div id="thoughts-list-container" style="display: flex; flex-direction: column; gap: var(--spacing-2);"></div>
  `;

  const countBadge = container.querySelector<HTMLElement>('#thoughts-count-badge')!;
  const textarea = container.querySelector<HTMLTextAreaElement>('#new-thought-textarea')!;
  const saveBtn = container.querySelector<HTMLButtonElement>('#save-thought-btn')!;
  const listContainer = container.querySelector<HTMLDivElement>('#thoughts-list-container')!;
  let selectedNewTag: TaskCategory = 'personal';

  function syncNewTagButtons() {
    container.querySelectorAll<HTMLButtonElement>('.thought-tag-Option').forEach(btn => {
      const cat = btn.getAttribute('data-cat') as TaskCategory;
      const isSelected = cat === selectedNewTag;
      btn.style.background = isSelected ? CATEGORY_COLORS[cat] : 'var(--bg-surface-elevated)';
      btn.style.color = isSelected ? '#FFFFFF' : 'var(--color-black-soft)';
      btn.style.borderColor = isSelected ? CATEGORY_COLORS[cat] : 'var(--border-subtle)';
    });
  }
  syncNewTagButtons();

  container.querySelectorAll<HTMLButtonElement>('.thought-tag-Option').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedNewTag = (btn.getAttribute('data-cat') as TaskCategory) || 'personal';
      syncNewTagButtons();
    });
  });

  saveBtn.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) return;
    textarea.value = '';
    await noteRepository.createNote({
      content,
      tags: [selectedNewTag],
    });
    eventBus.emit(AppEvents.NOTE_CREATED);
    await loadThoughts();
  });

  textarea.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveBtn.click();
    }
  });

  container.querySelectorAll<HTMLButtonElement>('#thoughts-filter-strip button').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#thoughts-filter-strip button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategoryFilter = (btn.getAttribute('data-filter') as 'all' | TaskCategory) || 'all';
      loadThoughts();
    });
  });

  async function loadThoughts() {
    const allNotes = await noteRepository.getAllNotes();
    countBadge.textContent = `${allNotes.length} saved`;

    const filtered = allNotes.filter(n => {
      if (activeCategoryFilter === 'all') return true;
      const primaryTag = (n.tags && n.tags[0]) || 'personal';
      return primaryTag === activeCategoryFilter;
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-state-title">No thoughts captured yet</h3>
          <p class="empty-state-sub">
            Say <code>"Hey Bruv, note [your idea]"</code>, type in the Quick Capture bar above, or write a thought here.
          </p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    filtered.forEach(note => {
      listContainer.appendChild(renderThoughtCard(note));
    });
  }

  function renderThoughtCard(note: QuickNote): HTMLElement {
    const card = document.createElement('div');
    const currentCat = ((note.tags && note.tags[0]) as TaskCategory) || 'personal';
    const catColor = CATEGORY_COLORS[currentCat] || '#38BDF8';
    const createdDate = new Date(note.createdAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    card.style.cssText = `
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-left: 4px solid ${catColor};
      border-radius: var(--radius-md);
      padding: var(--spacing-3);
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    card.innerHTML = `
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
        <p style="font-size: var(--font-size-sm); font-weight: 600; color: var(--color-black-dominant); line-height: 1.4; word-break: break-word; flex: 1;">
          ${escapeHtml(note.content)}
        </p>
        <span style="font-size: 0.65rem; color: var(--color-black-muted); white-space: nowrap;">${createdDate}</span>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; padding-top: 6px; border-top: 1px solid var(--border-subtle);">
        <!-- Category Tag Switcher (Links directly to Mind Graph) -->
        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
          ${CATEGORY_OPTIONS.map(c => {
            const isSel = c.value === currentCat;
            const col = CATEGORY_COLORS[c.value];
            return `
              <button
                type="button"
                class="note-cat-chip"
                data-cat="${c.value}"
                style="cursor: pointer; font-size: 0.6rem; font-weight: 700; padding: 2px 7px; border-radius: 999px; border: 1px solid ${isSel ? col : 'var(--border-medium)'}; background: ${isSel ? col : 'transparent'}; color: ${isSel ? '#FFFFFF' : 'var(--color-black-muted)'}; text-transform: uppercase;"
                title="Link thought to ${c.label} in Mind Graph"
              >
                ${c.label}
              </button>
            `;
          }).join('')}
        </div>

        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" class="pill-badge convert-task-btn" style="cursor: pointer; font-size: 0.65rem; padding: 3px 8px; color: var(--color-black-dominant); border-color: var(--border-focus);" title="Schedule this thought onto your Focus Orbit">
            + To Orbit Task
          </button>
          <button type="button" class="task-delete-btn delete-note-btn" title="Delete Thought">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;

    card.querySelectorAll<HTMLButtonElement>('.note-cat-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        const newCat = (chip.getAttribute('data-cat') as TaskCategory) || 'personal';
        await noteRepository.updateNote(note.id, { tags: [newCat] });
        eventBus.emit(AppEvents.NOTE_UPDATED);
        await loadThoughts();
      });
    });

    card.querySelector<HTMLButtonElement>('.convert-task-btn')?.addEventListener('click', () => {
      const now = new Date();
      const hours = String((now.getHours() + 1) % 24).padStart(2, '0');
      const draftTask: Task = {
        id: '',
        title: note.content.length > 60 ? note.content.slice(0, 57) + '...' : note.content,
        category: currentCat,
        urgency: 'medium',
        date: getSelectedDate(),
        startTime: `${hours}:00`,
        durationMinutes: 60,
        completed: false,
        notes: `Converted from Thought: "${note.content}"`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      onConvertToTask(getSelectedDate(), draftTask);
    });

    card.querySelector<HTMLButtonElement>('.delete-note-btn')?.addEventListener('click', async () => {
      await noteRepository.deleteNote(note.id);
      eventBus.emit(AppEvents.NOTE_DELETED, note.id);
      await loadThoughts();
    });

    return card;
  }

  function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  eventBus.on(AppEvents.NOTE_CREATED, () => loadThoughts());
  eventBus.on(AppEvents.NOTE_UPDATED, () => loadThoughts());
  eventBus.on(AppEvents.NOTE_DELETED, () => loadThoughts());

  loadThoughts();
  return container;
}

