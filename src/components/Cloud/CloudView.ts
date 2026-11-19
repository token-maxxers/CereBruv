import { taskRepository, noteRepository, userStatsRepository } from '../../services/storage';
import { authService, type AuthUser } from '../../services/auth/AuthService';
import { updateProfile } from 'firebase/auth';
import { auth } from '../../services/firebase';
import type { Task } from '../../types/task';

const LOCAL_DISPLAY_NAME_KEY = 'cerebruv_custom_display_name';

export interface CloudViewOptions {
  onOpenSettings?: () => void;
  onUpgradeGuest?: () => void;
  onSignOut?: () => void;
}

/**
 * Renders Option A: 14-Day Momentum Pulse (Vertical Capsule Bars + Mini Orbit Rings).
 */
function renderMomentumPulseHtml(
  activityHistory: Record<string, number> | undefined,
  tasks: Task[]
): { html: string; bestCount: number; activeDays: number } {
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekdayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const days: Array<{ dateStr: string; label: string; letter: string; count: number; isToday: boolean }> = [];
  let maxCount = 1;
  let bestCount = 0;
  let activeDays = 0;

  for (let i = 13; i >= 0; i--) {
    const cur = new Date(today);
    cur.setDate(today.getDate() - i);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const count = history[dateStr] || 0;
    if (count > maxCount) maxCount = count;
    if (count > bestCount) bestCount = count;
    if (count > 0) activeDays += 1;

    days.push({
      dateStr,
      label: cur.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      letter: weekdayLetters[cur.getDay()],
      count,
      isToday: i === 0,
    });
  }

  const colsHtml = days
    .map((day) => {
      const ratio = day.count > 0 ? Math.max(0.26, day.count / maxCount) : 0.14;
      const barHeight = Math.round(ratio * 46);
      const isActive = day.count > 0;
      const barBg = day.count >= 3
        ? 'var(--color-red-primary)'
        : day.count >= 1
          ? 'rgba(229, 46, 46, 0.62)'
          : 'var(--bg-surface-hover)';
      const barGlow = day.count >= 3 ? '0 3px 10px var(--color-red-glow)' : 'none';

      // Mini Orbit Ring dot below capsule
      const ringDash = day.count >= 3 ? '31.4 31.4' : day.count >= 1 ? '18 31.4' : '0 31.4';
      const ringStroke = isActive ? 'var(--color-red-primary)' : 'transparent';
      const trackStroke = day.isToday ? 'rgba(229, 46, 46, 0.35)' : 'var(--border-medium)';

      return `
        <button
          type="button"
          class="momentum-day${day.isToday ? ' is-today' : ''}"
          data-date="${day.dateStr}"
          data-label="${day.label}"
          data-count="${day.count}"
          title="${day.count} task${day.count === 1 ? '' : 's'} on ${day.label}"
        >
          <div class="momentum-bar-track">
            <div class="momentum-bar-fill" style="height: ${barHeight}px; background: ${barBg}; box-shadow: ${barGlow};"></div>
          </div>
          <svg class="momentum-ring" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="${trackStroke}" stroke-width="1.6" />
            <circle cx="7" cy="7" r="5" fill="none" stroke="${ringStroke}" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="${ringDash}" transform="rotate(-90 7 7)" />
          </svg>
          <span class="momentum-letter">${day.letter}</span>
        </button>
      `;
    })
    .join('');

  return {
    html: `<div class="momentum-grid">${colsHtml}</div>`,
    bestCount,
    activeDays,
  };
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
    const emailSubtitle = user?.email || (user?.isAnonymous ? 'Guest Session • Local Device' : '');
    const initials = displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || 'U';

    const avatarHtml = user?.photoURL
      ? `<img src="${user.photoURL}" alt="${displayName}" style="width: 58px; height: 58px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-subtle); flex-shrink: 0;" />`
      : `<div style="width: 58px; height: 58px; border-radius: 50%; background: var(--color-red-subtle); border: 2px solid rgba(229, 46, 46, 0.28); display: flex; align-items: center; justify-content: center; font-family: var(--font-family-display); font-size: var(--font-size-xl); font-weight: 900; color: var(--color-red-primary); flex-shrink: 0;">${initials}</div>`;

    const accountActionBtnHtml = user?.isAnonymous
      ? `<button class="btn btn-primary btn-full" id="account-action-btn">Create Account to Sync</button>`
      : `<button class="btn btn-secondary btn-full" id="account-action-btn" style="color: var(--color-red-primary);">Sign Out</button>`;

    const momentum = renderMomentumPulseHtml(stats.activityHistory, tasks);

    container.innerHTML = `
      <!-- Profile Identity Card -->
      <div style="display: flex; align-items: center; gap: var(--spacing-3); margin-bottom: var(--spacing-4);">
        ${avatarHtml}
        <div style="flex: 1; min-width: 0;">
          <div id="display-name-view-container" style="display: flex; align-items: center; gap: 6px;">
            <span id="display-name-text" style="font-family: var(--font-family-display); font-size: var(--font-size-lg); font-weight: 900; color: var(--color-black-dominant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
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
            <input type="text" id="display-name-input" maxlength="30" value="${displayName === 'Guest Bruv' || displayName === 'CereBruv User' ? '' : displayName}" placeholder="Enter name" style="padding: 5px 10px; font-size: var(--font-size-xs); border: 1px solid var(--border-medium); border-radius: var(--radius-full); outline: none; background: var(--bg-surface-elevated); color: var(--color-black-dominant); width: 130px;" />
            <button type="button" id="save-display-name-btn" class="pill-badge" style="background: var(--color-red-primary); color: #FFFFFF; border: none; padding: 4px 10px; cursor: pointer; font-size: 10px; font-weight: 800;">Save</button>
            <button type="button" id="cancel-display-name-btn" class="pill-badge" style="padding: 4px 8px; cursor: pointer; font-size: 10px;">Cancel</button>
          </div>

          ${emailSubtitle ? `<div style="font-size: var(--font-size-xs); color: var(--color-black-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">${emailSubtitle}</div>` : ''}
        </div>

        <button type="button" id="open-settings-btn" class="icon-btn" title="Settings &amp; Permissions" aria-label="Open Settings" style="width: 38px; height: 38px;">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>

      <!-- Compact 3-Stat Overview Row -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-2); margin-bottom: var(--spacing-4);">
        <div style="background: var(--bg-surface-elevated); padding: 12px 8px; border-radius: var(--radius-md); text-align: center;">
          <div style="font-family: var(--font-family-display); font-size: var(--font-size-xl); font-weight: 900; color: var(--color-red-primary);">${stats.streakDays}d</div>
          <div style="font-size: 0.7rem; font-weight: 600; color: var(--color-black-muted);">Active Streak</div>
        </div>
        <div style="background: var(--bg-surface-elevated); padding: 12px 8px; border-radius: var(--radius-md); text-align: center;">
          <div style="font-family: var(--font-family-display); font-size: var(--font-size-xl); font-weight: 900; color: var(--color-black-dominant);">${stats.tasksCompletedTotal}</div>
          <div style="font-size: 0.7rem; font-weight: 600; color: var(--color-black-muted);">Completed</div>
        </div>
        <div style="background: var(--bg-surface-elevated); padding: 12px 8px; border-radius: var(--radius-md); text-align: center;">
          <div style="font-family: var(--font-family-display); font-size: var(--font-size-xl); font-weight: 900; color: var(--color-black-dominant);">${notes.length}</div>
          <div style="font-size: 0.7rem; font-weight: 600; color: var(--color-black-muted);">Brain-Dumps</div>
        </div>
      </div>

      <!-- Option A: 14-Day Momentum Pulse (Capsules & Mini Orbit Rings) -->
      <div style="background: var(--bg-surface-elevated); padding: var(--spacing-3); border-radius: var(--radius-md); margin-bottom: var(--spacing-4);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <div>
            <div style="font-family: var(--font-family-display); font-size: var(--font-size-sm); font-weight: 800; color: var(--color-black-dominant);">
              Momentum Pulse
            </div>
            <div id="momentum-readout" style="font-size: 0.7rem; color: var(--color-black-muted); font-weight: 600;">
              ${momentum.activeDays} active day${momentum.activeDays === 1 ? '' : 's'} in last 2 weeks • Best: ${momentum.bestCount}
            </div>
          </div>
          <span class="pill-badge orbit-status-tag" style="font-size: 0.62rem;">14 DAYS</span>
        </div>

        ${momentum.html}
      </div>

      <!-- Account Action -->
      <div>
        ${accountActionBtnHtml}
      </div>
    `;

    container.querySelector('#open-settings-btn')?.addEventListener('click', () => {
      options?.onOpenSettings?.();
    });

    const readoutEl = container.querySelector<HTMLElement>('#momentum-readout');
    container.querySelectorAll<HTMLButtonElement>('.momentum-day').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.momentum-day').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        const label = btn.dataset.label || '';
        const count = parseInt(btn.dataset.count || '0', 10);
        if (readoutEl) {
          readoutEl.textContent = `${label} • ${count} task${count === 1 ? '' : 's'} completed`;
        }
      });
    });

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
