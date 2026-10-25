import { taskRepository, noteRepository, userStatsRepository } from '../../services/storage';

export function renderCloudView(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';

  async function loadData() {
    const tasks = await taskRepository.getAllTasks();
    const notes = await noteRepository.getAllNotes();
    const stats = await userStatsRepository.getStats();

    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Cloud & Storage Status</h2>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--spacing-3);">
        <div style="background: var(--bg-surface-elevated); padding: var(--spacing-3); border-radius: var(--radius-md); border: 1px solid var(--border-medium);">
          <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-muted); text-transform: uppercase;">
            ACTIVE ENGINE
          </div>
          <div style="font-size: var(--font-size-base); font-weight: 800; color: var(--color-black-dominant); margin-top: 2px;">
            Local-First Browser Persistence
          </div>
          <p style="font-size: var(--font-size-xs); color: var(--color-black-muted); margin-top: 4px;">
            Zero mock data. Real user tasks and notes persist on reload.
          </p>
        </div>

        <div class="form-row">
          <div style="background: var(--bg-surface-elevated); padding: var(--spacing-3); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); text-align: center;">
            <div style="font-size: var(--font-size-2xl); font-weight: 800; color: var(--color-red-primary);">${tasks.length}</div>
            <div style="font-size: var(--font-size-xs); color: var(--color-black-muted);">Stored Tasks</div>
          </div>

          <div style="background: var(--bg-surface-elevated); padding: var(--spacing-3); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); text-align: center;">
            <div style="font-size: var(--font-size-2xl); font-weight: 800; color: var(--color-black-dominant);">${notes.length}</div>
            <div style="font-size: var(--font-size-xs); color: var(--color-black-muted);">Brain-Dumps</div>
          </div>

          <div style="background: var(--bg-surface-elevated); padding: var(--spacing-3); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); text-align: center; grid-column: span 2;">
            <div style="font-size: var(--font-size-lg); font-weight: 800; color: var(--color-black-dominant);">Level ${stats.level} &bull; ${stats.experiencePoints} XP</div>
            <div style="font-size: var(--font-size-xs); color: var(--color-black-muted);">${stats.streakDays} Day Active Streak</div>
          </div>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: var(--spacing-3); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-muted);">
            GOOGLE FIREBASE HAND-OFF (FOR TEAMMATE B)
          </div>
          <p style="font-size: var(--font-size-xs); color: var(--color-black-muted); margin-top: 4px; line-height: 1.5;">
            File target: <code>src/services/storage/FirestoreAdapter.ts</code>.<br/>
            Swap export in <code>src/services/storage/index.ts</code> to activate Google Cloud Firestore without modifying UI components.
          </p>
        </div>

        <button class="btn btn-secondary" id="clear-storage-btn" style="color: var(--color-red-primary); border-color: var(--color-red-primary);">
          Reset Local Database
        </button>
      </div>
    `;

    container.querySelector('#clear-storage-btn')?.addEventListener('click', async () => {
      if (confirm('Clear all tasks and notes from browser storage?')) {
        await taskRepository.clearAllTasks();
        location.reload();
      }
    });
  }

  loadData();
  return container;
}
