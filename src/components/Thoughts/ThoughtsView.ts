import { noteRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import { voiceService } from '../../services/voice/VoiceService';
import { notificationService } from '../../services/notifications/NotificationService';
import { CATEGORY_COLORS } from '../FocusOrbit/orbitCalculator';
import type { QuickNote } from '../../types/note';
import type { Task, TaskCategory, UrgencyLevel } from '../../types/task';

const CATEGORY_OPTIONS: { value: TaskCategory; label: string }[] = [
  { value: 'study', label: 'Study' },
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal' },
  { value: 'event', label: 'Event' },
  { value: 'rest', label: 'Rest' },
];

const PRIORITY_OPTIONS: { value: UrgencyLevel; label: string; badgeBg: string; badgeColor: string }[] = [
  { value: 'high', label: 'High Priority', badgeBg: 'rgba(229, 46, 46, 0.14)', badgeColor: '#E52E2E' },
  { value: 'medium', label: 'Medium Priority', badgeBg: 'rgba(245, 158, 11, 0.16)', badgeColor: '#B45309' },
  { value: 'low', label: 'Low Priority', badgeBg: 'rgba(18, 18, 22, 0.08)', badgeColor: '#5E5D67' },
];

export function renderThoughtsView(
  _onConvertToTask?: (prefillDate?: string, draftTask?: Task) => void,
  _getSelectedDate?: () => string
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';
  container.style.padding = 'var(--spacing-3)';

  let activeCategoryFilter: 'all' | TaskCategory = 'all';

  container.innerHTML = `
    <div class="section-header" style="margin-bottom: var(--spacing-2);">
      <div>
        <h2 class="section-title">Second-Brain Notes & Ideas</h2>
        <span style="font-size: var(--font-size-xs); color: var(--color-black-muted);">
          Timeless ideas & thoughts — organized by Category & Priority (no alarms or deadlines)
        </span>
      </div>
      <span class="pill-badge" id="thoughts-count-badge" style="font-size: 0.68rem;">0 notes</span>
    </div>

    <!-- Quick Add Idea / Note Composer with Category & Priority Dropdowns -->
    <div style="display: flex; flex-direction: column; gap: 8px; background: var(--bg-primary); border: 1.5px solid var(--border-medium); border-radius: var(--radius-md); padding: var(--spacing-3); margin-bottom: var(--spacing-3);">
      <textarea
        id="new-thought-textarea"
        rows="2"
        placeholder="Jot down an idea, thought, or brain-dump..."
        style="width: 100%; border: none; background: transparent; resize: none; font-family: inherit; font-size: var(--font-size-sm); color: var(--color-black-dominant); outline: none;"
      ></textarea>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.65rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">
            Category:
            <select id="new-thought-category" style="padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-surface-elevated); font-size: 0.72rem; font-weight: 700; color: var(--color-black-dominant); font-family: inherit; cursor: pointer;">
              ${CATEGORY_OPTIONS.map(
                c => `<option value="${c.value}" ${c.value === 'personal' ? 'selected' : ''}>${c.label}</option>`
              ).join('')}
            </select>
          </label>

          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.65rem; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">
            Importance:
            <select id="new-thought-priority" style="padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-surface-elevated); font-size: 0.72rem; font-weight: 700; color: var(--color-black-dominant); font-family: inherit; cursor: pointer;">
              ${PRIORITY_OPTIONS.map(
                p => `<option value="${p.value}" ${p.value === 'medium' ? 'selected' : ''}>${p.label}</option>`
              ).join('')}
            </select>
          </label>
        </div>

        <button id="save-thought-btn" class="btn btn-primary" style="padding: 6px 14px; font-size: var(--font-size-xs);">
          Save Note
        </button>
      </div>
    </div>

    <!-- Category Filter Strip -->
    <div id="thoughts-filter-strip" style="display: flex; gap: 4px; overflow-x: auto; padding-bottom: 6px; margin-bottom: var(--spacing-2);">
      <button class="pill-badge active" data-filter="all" style="cursor: pointer; font-size: 0.65rem;">ALL IDEAS</button>
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
  const newCatSelect = container.querySelector<HTMLSelectElement>('#new-thought-category')!;
  const newPrioSelect = container.querySelector<HTMLSelectElement>('#new-thought-priority')!;
  const saveBtn = container.querySelector<HTMLButtonElement>('#save-thought-btn')!;
  const listContainer = container.querySelector<HTMLDivElement>('#thoughts-list-container')!;

  saveBtn.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) return;
    const cat = (newCatSelect.value as TaskCategory) || 'personal';
    const prio = (newPrioSelect.value as UrgencyLevel) || 'medium';
    textarea.value = '';
    await noteRepository.createNote({
      content,
      tags: [cat],
      category: cat,
      priority: prio,
    });
    eventBus.emit(AppEvents.NOTE_CREATED);
    const spoken = `Saved your ${prio}-priority ${cat} note, Bruv.`;
    eventBus.emit(AppEvents.MASCOT_SPEAK, {
      headline: `Note saved under ${cat.toUpperCase()}, Bruv!`,
      subspeech: spoken,
    });
    voiceService.speak(spoken);
    notificationService.playAlarmChime('success');
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
    // Sort by importance (high > medium > low), then newest first
    const prioRank: Record<UrgencyLevel, number> = { high: 0, medium: 1, low: 2 };
    const sortedNotes = [...allNotes].sort((a, b) => {
      const pA = prioRank[a.priority || 'medium'] ?? 1;
      const pB = prioRank[b.priority || 'medium'] ?? 1;
      if (pA !== pB) return pA - pB;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    countBadge.textContent = `${sortedNotes.length} note${sortedNotes.length === 1 ? '' : 's'}`;

    const filtered = sortedNotes.filter(n => {
      if (activeCategoryFilter === 'all') return true;
      const primaryCat = n.category || ((n.tags && n.tags[0]) as TaskCategory) || 'personal';
      return primaryCat === activeCategoryFilter;
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-state-title">No notes or ideas yet</h3>
          <p class="empty-state-sub">
            Say <code>"Hey Bruv, note [your idea]"</code> or write an idea above. Notes don't trigger alarms or deadlines.
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
    const currentCat: TaskCategory = note.category || ((note.tags && note.tags[0]) as TaskCategory) || 'personal';
    const currentPrio: UrgencyLevel = note.priority || 'medium';
    const catColor = CATEGORY_COLORS[currentCat] || '#38BDF8';
    const prioMeta = PRIORITY_OPTIONS.find(p => p.value === currentPrio) || PRIORITY_OPTIONS[1];
    const createdDate = new Date(note.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    card.style.cssText = `
      background: #FFFDF9;
      border: 1px dashed var(--border-medium);
      border-top: 3.5px solid ${catColor};
      border-radius: var(--radius-md);
      padding: var(--spacing-3);
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 2px 8px rgba(18, 18, 22, 0.04);
    `;

    card.innerHTML = `
      <!-- Idea / Note Header Badges -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span style="font-size: 0.6rem; font-weight: 800; padding: 2px 7px; border-radius: 999px; background: ${catColor}; color: #FFFFFF; text-transform: uppercase; letter-spacing: 0.04em;">
            IDEA • ${currentCat.toUpperCase()}
          </span>
          <span style="font-size: 0.6rem; font-weight: 800; padding: 2px 7px; border-radius: 999px; background: ${prioMeta.badgeBg}; color: ${prioMeta.badgeColor}; text-transform: uppercase; letter-spacing: 0.04em;">
            ${prioMeta.label}
          </span>
        </div>
        <span style="font-size: 0.65rem; color: var(--color-black-muted); font-weight: 600;">Captured ${createdDate}</span>
      </div>

      <!-- Idea Content (or Inline Editor) -->
      <div class="note-content-view" style="font-size: var(--font-size-sm); font-weight: 600; color: var(--color-black-dominant); line-height: 1.45; word-break: break-word;">
        ${escapeHtml(note.content)}
      </div>

      <div class="note-edit-view" style="display: none; flex-direction: column; gap: 6px;">
        <textarea class="note-edit-textarea" rows="2" style="width: 100%; padding: 6px 8px; border-radius: var(--radius-sm); border: 1px solid var(--color-red-primary); background: var(--bg-surface); font-family: inherit; font-size: var(--font-size-sm); color: var(--color-black-dominant); resize: vertical;">${escapeHtml(note.content)}</textarea>
        <div style="display: flex; justify-content: flex-end; gap: 6px;">
          <button type="button" class="pill-badge cancel-note-edit-btn" style="cursor: pointer; font-size: 0.65rem;">Cancel</button>
          <button type="button" class="pill-badge save-note-edit-btn" style="cursor: pointer; font-size: 0.65rem; background: var(--color-red-primary); color: #FFFFFF; border: none;">Save Text</button>
        </div>
      </div>

      <!-- Footer with Category Dropdown + Priority Dropdown + Edit/Delete -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--border-subtle);">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.62rem; font-weight: 700; color: var(--color-black-muted); text-transform: uppercase;">
            Category:
            <select class="note-cat-select" style="padding: 3px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.68rem; font-weight: 700; color: var(--color-black-dominant); cursor: pointer;">
              ${CATEGORY_OPTIONS.map(
                c => `<option value="${c.value}" ${c.value === currentCat ? 'selected' : ''}>${c.label}</option>`
              ).join('')}
            </select>
          </label>

          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.62rem; font-weight: 700; color: var(--color-black-muted); text-transform: uppercase;">
            Priority:
            <select class="note-prio-select" style="padding: 3px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-surface); font-size: 0.68rem; font-weight: 700; color: var(--color-black-dominant); cursor: pointer;">
              ${PRIORITY_OPTIONS.map(
                p => `<option value="${p.value}" ${p.value === currentPrio ? 'selected' : ''}>${p.label}</option>`
              ).join('')}
            </select>
          </label>
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <button type="button" class="task-edit-btn edit-note-btn" title="Edit Note Text" style="background: none; border: none; color: var(--color-black-muted); cursor: pointer; padding: 4px;">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="task-remove-btn delete-note-btn" title="Delete Note" style="background: none; border: none; color: var(--color-black-muted); cursor: pointer; padding: 4px;">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;

    const catSelect = card.querySelector<HTMLSelectElement>('.note-cat-select')!;
    const prioSelect = card.querySelector<HTMLSelectElement>('.note-prio-select')!;
    const contentView = card.querySelector<HTMLDivElement>('.note-content-view')!;
    const editView = card.querySelector<HTMLDivElement>('.note-edit-view')!;
    const editTextarea = card.querySelector<HTMLTextAreaElement>('.note-edit-textarea')!;

    catSelect.addEventListener('change', async () => {
      const newCat = (catSelect.value as TaskCategory) || 'personal';
      await noteRepository.updateNote(note.id, { category: newCat, tags: [newCat] });
      eventBus.emit(AppEvents.NOTE_UPDATED);
      await loadThoughts();
    });

    prioSelect.addEventListener('change', async () => {
      const newPrio = (prioSelect.value as UrgencyLevel) || 'medium';
      await noteRepository.updateNote(note.id, { priority: newPrio });
      eventBus.emit(AppEvents.NOTE_UPDATED);
      await loadThoughts();
    });

    card.querySelector<HTMLButtonElement>('.edit-note-btn')?.addEventListener('click', () => {
      contentView.style.display = 'none';
      editView.style.display = 'flex';
      editTextarea.focus();
    });

    card.querySelector<HTMLButtonElement>('.cancel-note-edit-btn')?.addEventListener('click', () => {
      editView.style.display = 'none';
      contentView.style.display = 'block';
      editTextarea.value = note.content;
    });

    card.querySelector<HTMLButtonElement>('.save-note-edit-btn')?.addEventListener('click', async () => {
      const newText = editTextarea.value.trim();
      if (!newText) return;
      await noteRepository.updateNote(note.id, { content: newText });
      eventBus.emit(AppEvents.NOTE_UPDATED);
      await loadThoughts();
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

