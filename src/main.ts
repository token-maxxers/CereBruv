import mascotImg from './assets/mascot.png';
import mascotTalk1Img from './assets/CerebruvTalk-1.png';
import mascotTalk2Img from './assets/CerebruvTalk-2.png';
import mascotListenImg from './assets/CerebruvListen.png';
import './styles/auth.css';
import { initAnalytics } from './services/firebase';
import { authService, type AuthUser } from './services/auth/AuthService';
import { userStatsRepository, taskRepository } from './services/storage';
import { migrateLocalStorageToFirestore } from './services/storage/migrate';
import { geminiService } from './services/ai/GeminiService';
import { voiceService } from './services/voice/VoiceService';
import { eventBus, AppEvents } from './services/events';
import { notificationService } from './services/notifications/NotificationService';
import { renderAuthScreen } from './components/Auth/AuthScreen';
import { renderQuickCapture } from './components/QuickCapture/QuickCapture';
import { renderTaskFormModal } from './components/Tasks/TaskForm';
import { renderTaskList } from './components/Tasks/TaskList';
import { renderCloudView } from './components/Cloud/CloudView';
import { renderFocusOrbit } from './components/FocusOrbit/FocusOrbit';
import { renderDotGraph } from './components/DotGraph/DotGraph';
import type { UserStats } from './types/user';

// Mascot AI request debouncer & race-condition cancellation ID
let mascotAiDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let latestMascotRequestId = 0;

const appContainer = document.querySelector<HTMLDivElement>('#app')!;

/**
 * Mounts the main application shell and binds interactive views.
 */
async function mountApp(user: AuthUser) {
  // Ensure background migration runs once if user had legacy local data
  migrateLocalStorageToFirestore().catch((err) => {
    console.warn('Migration check skipped:', err);
  });

  appContainer.innerHTML = `
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

    <!-- Unified Companion & Quick Capture Card -->
    <div class="mascot-banner" id="mascot-banner">
      <button class="icon-btn" id="mascot-voice-toggle" title="Toggle Talk-Back Voice (Speak / Mute)" style="position: absolute; top: 12px; right: 12px; width: 30px; height: 30px; z-index: 5;">
        <svg viewBox="0 0 24 24" id="mascot-voice-icon">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      </button>
      <div class="mascot-top-row" id="mascot-top-row">
        <button class="siri-avatar-orb" id="mascot-siri-orb" title="Tap CereBruv to Speak ('Hey Bruv...')">
          <img src="${mascotImg}" id="mascot-avatar-img" alt="CereBruv Siri Voice Assistant" />
        </button>
        <div class="mascot-speech" id="mascot-speech" title="Tap to interact with CereBruv" style="flex: 1; cursor: pointer;">
          <div class="mascot-headline-row">
            <strong id="mascot-status-title">Ready for input, Bruv.</strong>
            <div class="siri-wave-bars" id="siri-wave-bars">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>
          <span id="mascot-subspeech">Tap my avatar and say "Hey Bruv", or type below.</span>
        </div>
      </div>

      <!-- Nested Quick Capture Input Bar -->
      <div id="quick-capture-mount"></div>
    </div>

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
  qcMount.appendChild(renderQuickCapture(() => currentSelectedDate));

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
      viewContainer.appendChild(
        renderCloudView({
          onUpgradeGuest: () => {
            showAuth(true); // Open in link mode so UID is retained
          },
          onSignOut: () => {
            showAuth(false);
          }
        })
      );
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

  // Mascot Talk-Back Controls, Expandable Card & Sprite Animation Loop
  let voiceSubtitleHoldUntil = 0;
  let isCardExpanded = false;
  let isUserTyping = false;
  let talkAnimationTimer: ReturnType<typeof setInterval> | null = null;
  let talkFrameToggle = false;

  const mascotBanner = document.querySelector<HTMLDivElement>('#mascot-banner')!;
  const mascotTopRow = document.querySelector<HTMLDivElement>('#mascot-top-row')!;
  const mascotSpeechEl = document.querySelector<HTMLDivElement>('#mascot-speech')!;
  const mascotSiriOrb = document.querySelector<HTMLButtonElement>('#mascot-siri-orb')!;
  const mascotAvatarImg = document.querySelector<HTMLImageElement>('#mascot-avatar-img')!;
  const siriWaveBars = document.querySelector<HTMLDivElement>('#siri-wave-bars')!;
  const voiceToggleBtn = document.querySelector<HTMLButtonElement>('#mascot-voice-toggle')!;
  const voiceIconEl = document.querySelector<SVGElement>('#mascot-voice-icon')!;
  const qcInputEl = document.querySelector<HTMLInputElement>('#quick-capture-input');

  function syncMascotAvatarSprite() {
    const isSpeaking = voiceService.isSpeaking();
    const isListening = voiceService.isListening();

    // 1. Talking state: alternate CerebruvTalk-1 and CerebruvTalk-2 in loop
    if (isSpeaking) {
      if (!talkAnimationTimer) {
        talkFrameToggle = false;
        mascotAvatarImg.src = mascotTalk2Img;
        talkAnimationTimer = setInterval(() => {
          talkFrameToggle = !talkFrameToggle;
          mascotAvatarImg.src = talkFrameToggle ? mascotTalk1Img : mascotTalk2Img;
        }, 175);
      }
      return;
    }

    // Stop talking loop if not speaking
    if (talkAnimationTimer) {
      clearInterval(talkAnimationTimer);
      talkAnimationTimer = null;
    }

    // 2. Listening (user speaking) or Typing on the input field -> CerebruvListen
    if (isListening || isUserTyping) {
      mascotAvatarImg.src = mascotListenImg;
      return;
    }

    // 3. Default / Idle expression: always return to original logo (mascot.png)
    mascotAvatarImg.src = mascotImg;
  }

  function renderVoiceButtonState() {
    const isMuted = voiceService.isMuted();
    const isSpeaking = voiceService.isSpeaking();
    const isListening = voiceService.isListening();

    if (isListening || isSpeaking || isUserTyping) {
      isCardExpanded = true;
    }

    mascotBanner.classList.toggle('expanded', isCardExpanded);
    mascotBanner.classList.toggle('siri-active', isListening || isSpeaking);
    mascotSiriOrb.classList.toggle('listening', isListening);
    mascotSiriOrb.classList.toggle('speaking', isSpeaking && !isListening);
    siriWaveBars.classList.toggle('active', isListening || isSpeaking);

    syncMascotAvatarSprite();

    voiceToggleBtn.style.color = isMuted ? 'var(--color-black-faint)' : 'var(--color-red-primary)';
    voiceToggleBtn.classList.toggle('recording', isSpeaking);

    if (isMuted) {
      voiceIconEl.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      `;
    } else {
      voiceIconEl.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      `;
    }
  }

  renderVoiceButtonState();

  // Bind input field focus/typing to expand container and switch to CerebruvListen
  if (qcInputEl) {
    qcInputEl.addEventListener('focus', () => {
      isCardExpanded = true;
      isUserTyping = true;
      renderVoiceButtonState();
    });

    qcInputEl.addEventListener('input', () => {
      isCardExpanded = true;
      isUserTyping = true;
      renderVoiceButtonState();
    });

    qcInputEl.addEventListener('blur', () => {
      isUserTyping = false;
      renderVoiceButtonState();
    });
  }

  const speakCurrentBannerAloud = () => {
    const titleText = document.querySelector('#mascot-status-title')?.textContent || '';
    const subText = document.querySelector('#mascot-subspeech')?.textContent || '';
    voiceService.speak(`${titleText} ${subText}`, true);
  };

  // Clicking the container or speech text expands card and speaks current status aloud (Talk-1 <-> Talk-2 loop)
  mascotBanner.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('#mascot-siri-orb') ||
      target.closest('#mascot-voice-toggle') ||
      target.closest('#quick-capture-mount')
    ) {
      return;
    }
    isCardExpanded = true;
    isUserTyping = false;
    if (voiceService.isListening()) {
      voiceService.stopListening();
    }
    speakCurrentBannerAloud();
    renderVoiceButtonState();
  });

  // Clicking outside #mascot-banner collapses it if idle
  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    if (
      isCardExpanded &&
      !mascotBanner.contains(target) &&
      !voiceService.isListening() &&
      !voiceService.isSpeaking() &&
      !isUserTyping
    ) {
      isCardExpanded = false;
      renderVoiceButtonState();
    }
  });

  voiceToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const nowMuted = voiceService.toggleMute();
    renderVoiceButtonState();
    if (!nowMuted) {
      const subText = document.querySelector('#mascot-subspeech')?.textContent || 'Voice active, Bruv.';
      voiceService.speak(subText, true);
    }
  });

  // Clicking ONLY the CereBruv Avatar Orb triggers Voice Listening (CerebruvListen expression)
  mascotSiriOrb.addEventListener('click', (e) => {
    e.stopPropagation();
    isCardExpanded = true;
    voiceService.toggleListening(
      () => currentSelectedDate,
      (liveText) => {
        if (qcInputEl) qcInputEl.value = liveText;
      }
    );
    renderVoiceButtonState();
  });

  void mascotTopRow;
  void mascotSpeechEl;

  eventBus.on(AppEvents.VOICE_STATE_CHANGED, () => {
    renderVoiceButtonState();
  });

  eventBus.on(AppEvents.MASCOT_SPEAK, (payload: { headline: string; subspeech: string }) => {
    voiceSubtitleHoldUntil = Date.now() + 7000;
    const statusTitle = document.querySelector('#mascot-status-title');
    const subspeech = document.querySelector('#mascot-subspeech');
    if (statusTitle && payload.headline) statusTitle.textContent = payload.headline;
    if (subspeech && payload.subspeech) subspeech.textContent = payload.subspeech;
  });

  eventBus.on(AppEvents.NAVIGATE_TAB, (tab: string) => {
    if (['orbit', 'tasks', 'graph', 'cloud'].includes(tab)) {
      switchTab(tab);
    }
  });

  // Update Mascot Status dynamically with rule-based fallback and debounced AI analysis
  async function updateMascotStatus() {
    const tasks = await taskRepository.getAllTasks();
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => (t.date || todayStr) === todayStr);
    const pending = todayTasks.filter(t => !t.completed);
    const statusTitle = document.querySelector('#mascot-status-title');
    const subspeech = document.querySelector('#mascot-subspeech');

    // Schedule notification alarms
    pending.forEach(t => notificationService.scheduleTaskAlert(t));

    // Preserve active voice command subtitle for 7s so user can read what CereBruv just said
    if (Date.now() < voiceSubtitleHoldUntil) {
      return;
    }

    // Rule-based fallback text (displayed immediately)
    if (statusTitle && subspeech) {
      if (todayTasks.length === 0) {
        statusTitle.textContent = 'Ready for input, Bruv.';
        subspeech.textContent = 'No tasks for today. Tap the mic and say "Hey Bruv" or tap + to plan.';
      } else if (pending.length === 0) {
        statusTitle.textContent = 'All tasks crushed today, Bruv!';
        subspeech.textContent = 'Streak protected. Great job staying focused.';
      } else {
        statusTitle.textContent = `${pending.length} tasks today, Bruv.`;
        subspeech.textContent = `Next up: "${pending[0].title}" at ${pending[0].startTime}.`;
      }
    }

    // Debounce Gemini AI companion analysis (at most 1 call per task-list change batch)
    if (mascotAiDebounceTimer) {
      clearTimeout(mascotAiDebounceTimer);
    }

    const currentRequestId = ++latestMascotRequestId;

    mascotAiDebounceTimer = setTimeout(async () => {
      if (todayTasks.length === 0 || Date.now() < voiceSubtitleHoldUntil) return;

      try {
        const aiMessage = await geminiService.analyzeWorkload(todayTasks);
        if (currentRequestId === latestMascotRequestId && subspeech && aiMessage && Date.now() >= voiceSubtitleHoldUntil) {
          subspeech.textContent = aiMessage;
        }
      } catch (err) {
        console.warn('Gemini AI workload analysis fallback active:', err);
      }
    }, 400);
  }

  // Update User Stats (Streak & XP)
  async function initUserStats() {
    const stats = await userStatsRepository.recordDailyActivity();
    updateStatsUI(stats);
    await updateMascotStatus();
  }

  function updateStatsUI(stats: UserStats) {
    const streakEl = document.querySelector('#streak-count');
    const xpEl = document.querySelector('#xp-count');
    if (streakEl) streakEl.textContent = `${stats.streakDays}d`;
    if (xpEl) xpEl.textContent = `${stats.experiencePoints} XP (Lv.${stats.level})`;
  }

  // Event Listeners for Live Updates
  eventBus.on(AppEvents.STATS_UPDATED, (newStats) => updateStatsUI(newStats as UserStats));
  eventBus.on(AppEvents.TASK_CREATED, () => updateMascotStatus());
  eventBus.on(AppEvents.TASK_COMPLETED, () => updateMascotStatus());
  eventBus.on(AppEvents.TASK_DELETED, () => updateMascotStatus());

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service Worker registration skipped:', err);
    });
  }

  // Handle Mobile App Shortcut Query Params
  const urlParams = new URLSearchParams(window.location.search);
  const actionParam = urlParams.get('action');
  const tabParam = urlParams.get('tab');

  await initUserStats();

  if (tabParam && ['orbit', 'tasks', 'graph', 'cloud'].includes(tabParam)) {
    switchTab(tabParam);
  } else {
    switchTab('orbit');
  }

  if (actionParam === 'new_task') {
    setTimeout(() => taskFormModal.open(), 300);
  }

  initAnalytics();
  if (user && !user.isAnonymous) {
    notificationService.initFirebaseCloudMessaging().catch(() => {});
  }
}

/**
 * Renders the AuthScreen into #app.
 */
function showAuth(isLinkMode: boolean = false) {
  appContainer.innerHTML = '';
  const authScreen = renderAuthScreen({
    isLinkMode,
    isOffline: !navigator.onLine,
    onSuccess: (user: AuthUser) => {
      mountApp(user);
    }
  });
  appContainer.appendChild(authScreen);
}

/**
 * Application Bootstrap with Auth Gate
 */
function bootstrap() {
  let initialCheckDone = false;

  authService.onAuthChange((user: AuthUser | null) => {
    if (!initialCheckDone) {
      initialCheckDone = true;
      if (user) {
        mountApp(user);
      } else {
        showAuth(false);
      }
    } else {
      // Auth state changed after startup (e.g. signed out)
      if (!user) {
        showAuth(false);
      }
    }
  });

  // Safety timer if offline and onAuthStateChanged is delayed
  setTimeout(() => {
    if (!initialCheckDone) {
      initialCheckDone = true;
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        mountApp(currentUser);
      } else {
        showAuth(false);
      }
    }
  }, 1500);
}

bootstrap();
