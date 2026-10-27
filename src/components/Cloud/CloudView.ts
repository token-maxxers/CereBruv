import { taskRepository, noteRepository, userStatsRepository } from '../../services/storage';
import { authService, type AuthUser } from '../../services/auth/AuthService';

export interface CloudViewOptions {
  onUpgradeGuest?: () => void;
  onSignOut?: () => void;
}

export function renderCloudView(options?: CloudViewOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';

  async function loadData() {
    const tasks = await taskRepository.getAllTasks();
    const notes = await noteRepository.getAllNotes();
    const stats = await userStatsRepository.getStats();
    const user: AuthUser | null = authService.getCurrentUser();

    // Determine account display properties
    const displayName = user?.displayName || user?.email || (user?.isAnonymous ? 'Guest Bruv' : 'CereBruv User');
    const emailSubtitle = user?.email || (user?.isAnonymous ? 'Guest Session (Not linked to email)' : '');
    const initial = (displayName.charAt(0) || 'U').toUpperCase();

    const avatarHtml = user?.photoURL
      ? `<img src="${user.photoURL}" alt="${displayName}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-medium);" />`
      : `<div style="width: 44px; height: 44px; border-radius: 50%; background-color: var(--bg-surface-elevated); border: 2px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-lg); font-weight: 800; color: var(--color-black-dominant);">${initial}</div>`;

    const userBadgeHtml = user?.isAnonymous
      ? `<span class="pill-badge" style="background-color: var(--bg-surface-elevated); color: var(--color-black-muted); border-color: var(--border-medium); font-size: 0.65rem;">GUEST</span>`
      : `<span class="pill-badge" style="background-color: var(--color-red-subtle); color: var(--color-red-primary); border-color: var(--color-red-primary); font-size: 0.65rem;">ACCOUNT</span>`;

    const accountActionBtnHtml = user?.isAnonymous
      ? `<button class="btn btn-secondary" id="account-action-btn" style="background-color: var(--color-red-primary); color: #FAF7F2; border: none; font-size: var(--font-size-xs); font-weight: 700; padding: 8px 14px; border-radius: var(--radius-sm); cursor: pointer;">
           Create Account
         </button>`
      : `<button class="btn btn-secondary" id="account-action-btn" style="color: var(--color-red-primary); border-color: var(--color-red-primary); font-size: var(--font-size-xs); font-weight: 700; padding: 8px 14px; border-radius: var(--radius-sm); cursor: pointer;">
           Sign Out
         </button>`;

    container.innerHTML = `
      <!-- Account Card -->
      <div style="background: var(--bg-surface); padding: var(--spacing-3); border-radius: var(--radius-md); border: 1px solid var(--border-medium); margin-bottom: var(--spacing-3); box-shadow: var(--shadow-card);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-2);">
          <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-muted); text-transform: uppercase; letter-spacing: 0.05em;">
            CereBruv Account
          </div>
          ${userBadgeHtml}
        </div>

        <div style="display: flex; align-items: center; gap: var(--spacing-3); margin-top: 4px;">
          ${avatarHtml}
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: var(--font-size-base); font-weight: 800; color: var(--color-black-dominant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${displayName}
            </div>
            ${emailSubtitle ? `<div style="font-size: var(--font-size-xs); color: var(--color-black-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${emailSubtitle}</div>` : ''}
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: var(--spacing-3); border-top: 1px solid var(--border-subtle); padding-top: var(--spacing-2);">
          ${accountActionBtnHtml}
        </div>
      </div>

      <div class="section-header">
        <h2 class="section-title">Cloud & Storage Status</h2>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--spacing-3);">
        <div style="background: var(--bg-surface-elevated); padding: var(--spacing-3); border-radius: var(--radius-md); border: 1px solid var(--border-medium);">
          <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-muted); text-transform: uppercase;">
            ACTIVE ENGINE
          </div>
          <div style="font-size: var(--font-size-base); font-weight: 800; color: var(--color-black-dominant); margin-top: 2px;">
            Google Firebase Cloud Firestore
          </div>
          <p style="font-size: var(--font-size-xs); color: var(--color-black-muted); margin-top: 4px;">
            Data is scoped under your authenticated user ID and synced offline via persistent local cache.
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

        <button class="btn btn-secondary" id="clear-storage-btn" style="color: var(--color-red-primary); border-color: var(--color-red-primary);">
          Reset Local Database
        </button>
      </div>
    `;

    // Action button listeners
    const actionBtn = container.querySelector<HTMLButtonElement>('#account-action-btn');
    actionBtn?.addEventListener('click', async () => {
      if (user?.isAnonymous) {
        if (options?.onUpgradeGuest) {
          options.onUpgradeGuest();
        }
      } else {
        if (confirm('Are you sure you want to sign out of CereBruv?')) {
          await authService.signOut();
          if (options?.onSignOut) {
            options.onSignOut();
          }
        }
      }
    });

    container.querySelector('#clear-storage-btn')?.addEventListener('click', async () => {
      if (confirm('Clear all tasks from your account database?')) {
        await taskRepository.clearAllTasks();
        location.reload();
      }
    });
  }

  loadData();
  return container;
}
