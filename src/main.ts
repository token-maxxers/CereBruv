import mascotImg from './assets/mascot.png';
import { userStatsRepository, taskRepository } from './services/storage';
import { eventBus, AppEvents } from './services/events';
import { renderQuickCapture } from './components/QuickCapture/QuickCapture';
import { renderTaskFormModal } from './components/Tasks/TaskForm';
import { renderTaskList } from './components/Tasks/TaskList';
import { renderCloudView } from './components/Cloud/CloudView';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="mobile-container">
    <!-- Header -->
    <header class="app-header">
      <div class="brand-section">
        <img src="${mascotImg}" alt="CereBruv Official Mascot" class="brand-logo" />
        <div class="brand-titles">
          <h1 class="brand-name">Cere<span>Bruv</span></h1>
          <span class="brand-tagline">Think it through, CereBruv's got you</span>
        </div>
      </div>
      <div class="status-badge-group">
        <div class="pill-badge active-streak" id="streak-badge">
          <span>STREAK</span>
          <strong id="streak-count">0d</strong>
        </div>
        <div class="pill-badge" id="xp-badge">
          <span id="xp-count">0 XP</span>
        </div>
      </div>
    </header>

    <!-- Companion Dynamic Banner -->
    <div class="mascot-banner" id="mascot-banner">
      <img src="${mascotImg}" alt="CereBruv Mascot" class="mascot-avatar-small" />
      <div class="mascot-speech" id="mascot-speech">
        <strong id="mascot-status-title">Ready for input, Bruv.</strong>
        <span id="mascot-subspeech">No scheduled tasks yet. Add one below to ignite your Focus Orbit.</span>
      </div>
    </div>

    <!-- Quick Capture Bar -->
    <div id="quick-capture-mount"></div>

    <!-- Main Content Area -->
    <main class="main-content" id="main-content">
      <!-- Active View will be injected here by Navigation router -->
      <div id="view-container"></div>
    </main>

    <!-- Floating Action Button (+ Add Task) -->
    <button class="fab-btn" id="fab-add-task" title="Add New Task">
      <svg viewBox="0 0 24 24">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>

    <!-- Bottom Navigation Bar -->
    <nav class="bottom-nav">
      <button class="nav-item active" data-tab="orbit">
        <svg class="nav-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3 A9 9 0 0 1 21 12" stroke-width="3" />
        </svg>
        <span>Orbit</span>
      </button>

      <button class="nav-item" data-tab="tasks">
        <svg class="nav-icon" viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 12l3 3 7-7" />
        </svg>
        <span>Tasks</span>
      </button>

      <button class="nav-item" data-tab="graph">
        <svg class="nav-icon" viewBox="0 0 24 24">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="12" cy="18" r="3" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="8" x2="12" y2="16" />
          <line x1="16" y1="8" x2="12" y2="16" />
        </svg>
        <span>Graph</span>
      </button>

      <button class="nav-item" data-tab="cloud">
        <svg class="nav-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>Cloud</span>
      </button>
    </nav>
  </div>
`;

// Initialize Modal Sheet for Task Creation
const taskFormModal = renderTaskFormModal();
document.body.appendChild(taskFormModal.backdrop);

// Mount Quick Capture
const qcMount = document.querySelector('#quick-capture-mount')!;
qcMount.appendChild(renderQuickCapture());

// Mount Floating Action Button
const fabBtn = document.querySelector('#fab-add-task')!;
fabBtn.addEventListener('click', () => {
  taskFormModal.open();
});

// View Router
const viewContainer = document.querySelector('#view-container')!;

function switchTab(tab: string) {
  // Update navbar active states
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });

  viewContainer.innerHTML = '';

  if (tab === 'orbit') {
    renderOrbitView();
  } else if (tab === 'tasks') {
    viewContainer.appendChild(renderTaskList(() => taskFormModal.open()));
  } else if (tab === 'graph') {
    renderGraphPlaceholder();
  } else if (tab === 'cloud') {
    viewContainer.appendChild(renderCloudView());
  }
}

// Orbit View (Combines Focus Orbit Canvas Engine + Task Schedule)
async function renderOrbitView() {
  const tasks = await taskRepository.getAllTasks();
  const now = new Date();
  const dateFormatted = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const orbitCard = document.createElement('div');
  orbitCard.className = 'card-section';
  orbitCard.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Focus Orbit (Day 24h)</h2>
      <span class="section-action">${dateFormatted}</span>
    </div>
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: var(--spacing-4) 0;">
      <div id="orbit-canvas-container" style="position: relative; width: 260px; height: 260px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 200 200" width="240" height="240">
          <!-- 24h Outer Dial Base Track -->
          <circle cx="100" cy="100" r="80" fill="none" stroke="var(--border-medium)" stroke-width="12" />
          <!-- Dial Ticks (Every 6 hours) -->
          <line x1="100" y1="12" x2="100" y2="24" stroke="var(--color-black-muted)" stroke-width="2" />
          <line x1="188" y1="100" x2="176" y2="100" stroke="var(--color-black-muted)" stroke-width="2" />
          <line x1="100" y1="188" x2="100" y2="176" stroke="var(--color-black-muted)" stroke-width="2" />
          <line x1="12" y1="100" x2="24" y2="100" stroke="var(--color-black-muted)" stroke-width="2" />
        </svg>
        <div style="position: absolute; text-align: center;">
          <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-muted);">TODAY</div>
          <div style="font-size: var(--font-size-xl); font-weight: 800; color: var(--color-black-dominant);">${tasks.length} Tasks</div>
          <div style="font-size: var(--font-size-xs); color: var(--color-red-primary); font-weight: 600; margin-top: 2px;">
            ${tasks.filter(t => !t.completed).length} Pending
          </div>
        </div>
      </div>
      <p style="font-size: var(--font-size-xs); color: var(--color-black-muted); text-align: center; margin-top: var(--spacing-2);">
        Phase 4 will activate live circular arc rendering & free-time analysis.
      </p>
    </div>
  `;

  viewContainer.appendChild(orbitCard);
  // Also append task list directly under Orbit view for quick action
  viewContainer.appendChild(renderTaskList(() => taskFormModal.open()));
}

// Graph Placeholder
function renderGraphPlaceholder() {
  const graphCard = document.createElement('div');
  graphCard.className = 'card-section';
  graphCard.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Obsidian-Style Mind Graph</h2>
    </div>
    <div class="empty-state">
      <h3 class="empty-state-title">Graph Node Network</h3>
      <p class="empty-state-sub">Nodes connect your tasks, quick thoughts, and topics in a dynamic force-directed network (Phase 5 Engine).</p>
      <button class="btn btn-primary" id="graph-create-task-btn">+ Add Node Item</button>
    </div>
  `;
  graphCard.querySelector('#graph-create-task-btn')?.addEventListener('click', () => taskFormModal.open());
  viewContainer.appendChild(graphCard);
}

// Attach Bottom Nav Listeners
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    if (tab) switchTab(tab);
  });
});

// Update Mascot Status dynamically
async function updateMascotStatus() {
  const tasks = await taskRepository.getAllTasks();
  const pending = tasks.filter(t => !t.completed);
  const statusTitle = document.querySelector('#mascot-status-title');
  const subspeech = document.querySelector('#mascot-subspeech');

  if (statusTitle && subspeech) {
    if (tasks.length === 0) {
      statusTitle.textContent = 'Ready for input, Bruv.';
      subspeech.textContent = 'No scheduled tasks yet. Tap the red + button to plan your day.';
    } else if (pending.length === 0) {
      statusTitle.textContent = 'All tasks crushed today, Bruv!';
      subspeech.textContent = 'Streak protected. Great job staying focused.';
    } else {
      statusTitle.textContent = `${pending.length} tasks on deck, Bruv.`;
      subspeech.textContent = `Next up: "${pending[0].title}" at ${pending[0].startTime}.`;
    }
  }
}

// Update User Stats (Streak & XP)
async function initUserStats() {
  const stats = await userStatsRepository.recordDailyActivity();
  updateStatsUI(stats);
  updateMascotStatus();
}

function updateStatsUI(stats: any) {
  const streakEl = document.querySelector('#streak-count');
  const xpEl = document.querySelector('#xp-count');
  if (streakEl) streakEl.textContent = `${stats.streakDays}d`;
  if (xpEl) xpEl.textContent = `${stats.experiencePoints} XP (Lv.${stats.level})`;
}

// Event Listeners for Live Updates
eventBus.on(AppEvents.STATS_UPDATED, (newStats) => updateStatsUI(newStats));
eventBus.on(AppEvents.TASK_CREATED, () => updateMascotStatus());
eventBus.on(AppEvents.TASK_COMPLETED, () => updateMascotStatus());
eventBus.on(AppEvents.TASK_DELETED, () => updateMascotStatus());

// Initial Mount
initUserStats();
switchTab('orbit');
