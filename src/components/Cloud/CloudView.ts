import { taskRepository, noteRepository, userStatsRepository } from '../../services/storage';
import { authService, type AuthUser } from '../../services/auth/AuthService';
import { updateProfile } from 'firebase/auth';
import { auth } from '../../services/firebase';
import type { Task } from '../../types/task';

const LOCAL_DISPLAY_NAME_KEY = 'cerebruv_custom_display_name';

export interface CloudViewOptions {
  onUpgradeGuest?: () => void;
  onSignOut?: () => void;
}

/**
 * Renders a lightweight 7-row by 12-column GitHub-style activity contribution grid.
 */
function renderContributionHeatmapHtml(
  activityHistory: Record<string, number> | undefined,
  tasks: Task[]
): string {
  // Approximate backfill: If activityHistory is empty, aggregate completed tasks by their date or updatedAt timestamp.
  const history: Record<string, number> = activityHistory ? { ...activityHistory } : {};
  if (Object.keys(history).length === 0) {
    tasks.forEach((t) => {
      if (t.completed) {
        let dateKey = t.date;
        if (!dateKey && t.updatedAt) {
          const d = new Date(t.updatedAt);
          dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        if (dateKey) {
          history[dateKey] = (history[dateKey] || 0) + 1;
        }
      }
    });
  }

  // Generate 84 days (12 weeks of 7 days) ending today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: Array<{ dateStr: string; count: number }> = [];
  for (let i = 83; i >= 0; i--) {
    const cur = new Date(today);
    cur.setDate(today.getDate() - i);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const count = history[dateStr] || 0;
    days.push({ dateStr, count });
  }

  // 12 columns x 7 rows CSS Grid
  const cellsHtml = days
    .map((day) => {
      let bg = 'var(--bg-cream, #F5EFEB)';
      let border = '1px solid var(--border-subtle)';
      if (day.count >= 4) {
        bg = 'var(--color-red-primary, #E52E2E)';
        border = 'none';
      } else if (day.count >= 2) {
        bg = 'rgba(229, 46, 46, 0.45)';
        border = 'none';
      } else if (day.count >= 1) {
        bg = 'var(--color-red-subtle, #FDEDEC)';
        border = '1px solid rgba(229, 46, 46, 0.25)';
      }

      const tooltip = `${day.count} task${day.count === 1 ? '' : 's'} on ${day.dateStr}`;
      return `<div class="contrib-cell" title="${tooltip}" style="width: 11px; height: 11px; border-radius: 2px; background: ${bg}; border: ${border}; box-sizing: border-box; cursor: pointer;"></div>`;
    })
    .join('');

  return `
    <div style="display: grid; grid-template-rows: repeat(7, 11px); grid-auto-flow: column; grid-auto-columns: 11px; gap: 3.5px; width: fit-content;">
      ${cellsHtml}
    </div>
  `;
}

export function renderCloudView(options?: CloudViewOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';

  async function loadData() {
    const tasks = await taskRepository.getAllTasks();
    const notes = await noteRepository.getAllNotes();
    const stats = await userStatsRepository.getStats();
    const user: AuthUser | null = authService.getCurrentUser();

    const localCustomName = localStorage.getItem(LOCAL_DISPLAY_NAME_KEY) || '';

    // Determine account display properties
    const displayName = localCustomName || user?.displayName || user?.email || (user?.isAnonymous ? 'Guest Bruv' : 'CereBruv User');
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
            <div id="display-name-view-container" style="display: flex; align-items: center; gap: 8px;">
              <span id="display-name-text" style="font-size: var(--font-size-base); font-weight: 800; color: var(--color-black-dominant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${displayName}
              </span>
              <button type="button" id="edit-display-name-btn" title="Edit name" style="background: none; border: none; cursor: pointer; color: var(--color-black-muted); padding: 2px; display: flex; align-items: center;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
            </div>

            <div id="display-name-edit-container" style="display: none; align-items: center; gap: 6px; margin-top: 2px;">
              <input type="text" id="display-name-input" maxlength="30" value="${displayName === 'Guest Bruv' || displayName === 'CereBruv User' ? '' : displayName}" placeholder="Enter name" style="padding: 4px 8px; font-size: var(--font-size-xs); border: 1px solid var(--border-medium); border-radius: var(--radius-sm); outline: none; background: var(--bg-surface-elevated); color: var(--color-black-dominant); width: 140px;" />
              <button type="button" id="save-display-name-btn" class="pill-badge" style="background: var(--color-red-primary); color: #FAF7F2; border: none; padding: 4px 8px; cursor: pointer; font-size: 10px; font-weight: 700;">Save</button>
              <button type="button" id="cancel-display-name-btn" class="pill-badge" style="background: var(--bg-cream); color: var(--color-black-muted); border: 1px solid var(--border-subtle); padding: 4px 8px; cursor: pointer; font-size: 10px;">Cancel</button>
            </div>

            ${emailSubtitle ? `<div style="font-size: var(--font-size-xs); color: var(--color-black-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">${emailSubtitle}</div>` : ''}
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: var(--spacing-3); border-top: 1px solid var(--border-subtle); padding-top: var(--spacing-2);">
          ${accountActionBtnHtml}
        </div>
      </div>

      <div class="section-header">
        <h2 class="section-title">Your Activity & Overview</h2>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--spacing-3);">
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
            <div style="font-size: var(--font-size-lg); font-weight: 800; color: var(--color-black-dominant);">${stats.streakDays} Day Active Streak</div>
            <div style="font-size: var(--font-size-xs); color: var(--color-black-muted);">${stats.tasksCompletedTotal} Tasks Completed</div>
          </div>
        </div>

        <!-- 7x12-Week Activity Contribution Heatmap -->
        <div style="background: var(--bg-surface-elevated); padding: var(--spacing-3); border-radius: var(--radius-md); border: 1px solid var(--border-medium); margin-top: var(--spacing-1);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-muted); text-transform: uppercase; letter-spacing: 0.05em;">
              Activity Contribution Heatmap
            </div>
            <span style="font-size: 10px; color: var(--color-black-muted); font-weight: 600;">Last 12 Weeks</span>
          </div>

          <div style="overflow-x: auto; padding-bottom: 4px;">
            ${renderContributionHeatmapHtml(stats.activityHistory, tasks)}
          </div>

          <!-- Heatmap Legend -->
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 8px; font-size: 10px; color: var(--color-black-muted);">
            <span>Less</span>
            <div style="width: 10px; height: 10px; border-radius: 2px; background: var(--bg-cream, #F5EFEB); border: 1px solid var(--border-subtle);"></div>
            <div style="width: 10px; height: 10px; border-radius: 2px; background: var(--color-red-subtle, #FDEDEC);"></div>
            <div style="width: 10px; height: 10px; border-radius: 2px; background: rgba(229, 46, 46, 0.45);"></div>
            <div style="width: 10px; height: 10px; border-radius: 2px; background: var(--color-red-primary, #E52E2E);"></div>
            <span style="margin-left: 2px;">More</span>
          </div>
        </div>
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

    // Inline display name edit listeners
    const nameViewContainer = container.querySelector<HTMLDivElement>('#display-name-view-container');
    const nameEditContainer = container.querySelector<HTMLDivElement>('#display-name-edit-container');
    const nameInput = container.querySelector<HTMLInputElement>('#display-name-input');
    const editNameBtn = container.querySelector<HTMLButtonElement>('#edit-display-name-btn');
    const saveNameBtn = container.querySelector<HTMLButtonElement>('#save-display-name-btn');
    const cancelNameBtn = container.querySelector<HTMLButtonElement>('#cancel-display-name-btn');

    editNameBtn?.addEventListener('click', () => {
      if (nameViewContainer && nameEditContainer && nameInput) {
        nameViewContainer.style.display = 'none';
        nameEditContainer.style.display = 'flex';
        nameInput.focus();
      }
    });

    cancelNameBtn?.addEventListener('click', () => {
      if (nameViewContainer && nameEditContainer) {
        nameEditContainer.style.display = 'none';
        nameViewContainer.style.display = 'flex';
      }
    });

    saveNameBtn?.addEventListener('click', async () => {
      if (!nameInput) return;
      const trimmed = nameInput.value.trim().slice(0, 30);
      if (!trimmed) {
        alert('Please enter a non-empty name (up to 30 characters).');
        return;
      }

      saveNameBtn.disabled = true;
      saveNameBtn.textContent = 'Saving...';

      // Always save to localStorage for offline/guest retention
      localStorage.setItem(LOCAL_DISPLAY_NAME_KEY, trimmed);

      // If user is authenticated in Firebase, sync to Firebase Auth user profile
      const currentAuthUser = auth.currentUser;
      if (currentAuthUser) {
        try {
          await updateProfile(currentAuthUser, { displayName: trimmed });
        } catch (err) {
          console.warn('Could not update Firebase Auth profile, saved locally:', err);
        }
      }

      await loadData();
    });
  }

  loadData();
  return container;
}
