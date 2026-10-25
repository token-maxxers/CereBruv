import mascotImg from './assets/mascot.png';
import { userStatsRepository, taskRepository } from './services/storage';
import { eventBus, AppEvents } from './services/events';
import { notificationService } from './services/notifications/NotificationService';
import { renderQuickCapture } from './components/QuickCapture/QuickCapture';
import { renderTaskFormModal } from './components/Tasks/TaskForm';
import { renderTaskList } from './components/Tasks/TaskList';
import { renderCloudView } from './components/Cloud/CloudView';
import { renderFocusOrbit } from './components/FocusOrbit/FocusOrbit';
import { renderDotGraph } from './components/DotGraph/DotGraph';

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
        <button class="icon-btn" id="notif-bell-btn" title="Enable Task Alerts" style="width: 28px; height: 28px;">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </button>
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

// Active Calendar Date tracker
let currentSelectedDate = new Date().toISOString().split('T')[0];
eventBus.on(AppEvents.DATE_SELECTED, (date: string) => {
  currentSelectedDate = date;
});

// Initialize Modal Sheet for Task Creation
const taskFormModal = renderTaskFormModal();
document.body.appendChild(taskFormModal.backdrop);

// Mount Quick Capture
const qcMount = document.querySelector('#quick-capture-mount')!;
qcMount.appendChild(renderQuickCapture());

// Mount Floating Action Button
const fabBtn = document.querySelector('#fab-add-task')!;
fabBtn.addEventListener('click', () => {
  taskFormModal.open(currentSelectedDate);
});

// Notification Bell Toggle
const bellBtn = document.querySelector<HTMLButtonElement>('#notif-bell-btn')!;
bellBtn.addEventListener('click', async () => {
  const granted = await notificationService.requestPermission();
  if (granted) {
    bellBtn.style.color = 'var(--color-red-primary)';
    notificationService.showNotification('CereBruv Alerts Active', 'Task reminder popups will alert you 10 minutes prior.');
  } else {
    alert('Notifications blocked in browser settings. Enable them to receive task reminders.');
  }
});

// View Router
const viewContainer = document.querySelector('#view-container')!;

function switchTab(tab: string) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });

  viewContainer.innerHTML = '';

  if (tab === 'orbit') {
    renderOrbitView();
  } else if (tab === 'tasks') {
    viewContainer.appendChild(renderTaskList((date) => taskFormModal.open(date)));
  } else if (tab === 'graph') {
    viewContainer.appendChild(renderDotGraph());
  } else if (tab === 'cloud') {
    viewContainer.appendChild(renderCloudView());
  }
}

function renderOrbitView() {
  viewContainer.appendChild(renderFocusOrbit((date) => taskFormModal.open(date)));
  viewContainer.appendChild(renderTaskList((date) => taskFormModal.open(date)));
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
  const todayStr = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(t => (t.date || todayStr) === todayStr);
  const pending = todayTasks.filter(t => !t.completed);
  const statusTitle = document.querySelector('#mascot-status-title');
  const subspeech = document.querySelector('#mascot-subspeech');

  if (statusTitle && subspeech) {
    if (todayTasks.length === 0) {
      statusTitle.textContent = 'Ready for input, Bruv.';
      subspeech.textContent = 'No tasks for today. Tap the red + button to plan or browse upcoming days.';
    } else if (pending.length === 0) {
      statusTitle.textContent = 'All tasks crushed today, Bruv!';
      subspeech.textContent = 'Streak protected. Great job staying focused.';
    } else {
      statusTitle.textContent = `${pending.length} tasks today, Bruv.`;
      subspeech.textContent = `Next up: "${pending[0].title}" at ${pending[0].startTime}.`;
    }
  }

  // Schedule notification alarms
  pending.forEach(t => notificationService.scheduleTaskAlert(t));
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

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service Worker registration skipped:', err);
    });
  });
}

// Handle Mobile App Shortcut Query Params
const urlParams = new URLSearchParams(window.location.search);
const actionParam = urlParams.get('action');
const tabParam = urlParams.get('tab');

initUserStats();

if (tabParam && ['orbit', 'tasks', 'graph', 'cloud'].includes(tabParam)) {
  switchTab(tabParam);
} else {
  switchTab('orbit');
}

if (actionParam === 'new_task') {
  setTimeout(() => taskFormModal.open(), 300);
}
