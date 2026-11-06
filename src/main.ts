import mascotImg from './assets/mascot.png';
import mascotTalk1Img from './assets/CerebruvTalk-1.png';
import mascotTalk2Img from './assets/CerebruvTalk-2.png';
import mascotListenImg from './assets/CerebruvListen.png';
import './styles/auth.css';
import { initAnalytics } from './services/firebase';
import { authService, type AuthUser } from './services/auth/AuthService';
import { userStatsRepository, taskRepository } from './services/storage';
import { migrateLocalStorageToFirestore } from './services/storage/migrate';
import { voiceService } from './services/voice/VoiceService';
import { eventBus, AppEvents } from './services/events';
import { notificationService, type AlarmPopupPayload } from './services/notifications/NotificationService';
import { renderAuthScreen } from './components/Auth/AuthScreen';
import { renderQuickCapture } from './components/QuickCapture/QuickCapture';
import { renderTaskFormModal } from './components/Tasks/TaskForm';
import { renderTaskList } from './components/Tasks/TaskList';
import { renderCloudView } from './components/Cloud/CloudView';
import { renderFocusOrbit } from './components/FocusOrbit/FocusOrbit';
import { sortTasksSmartly, timeStringToFractionalHour } from './components/FocusOrbit/orbitCalculator';
import { renderDotGraph } from './components/DotGraph/DotGraph';
import { renderThoughtsView } from './components/Thoughts/ThoughtsView';
import type { UserStats } from './types/user';

let realTimeAlarmInterval: ReturnType<typeof setInterval> | null = null;

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
      <div class="status-badge-group" style="position: relative;">
        <button class="icon-btn" id="notif-bell-btn" title="Voice, Sound & Alarm Settings" style="width: 30px; height: 30px;">
          <svg viewBox="0 0 24 24" width="15" height="15">
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

        <!-- Top Navbar Voice, Sound, Vibration & Popup Settings Popover -->
        <div class="header-settings-popover" id="header-settings-popover" style="display: none;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <span style="font-size: 11px; font-weight: 800; color: var(--color-red-primary); letter-spacing: 0.05em;">CEREBRUV ASSISTANT SETTINGS</span>
            <button type="button" id="close-header-settings" style="background: none; border: none; font-size: 15px; font-weight: 800; color: var(--color-black-muted); cursor: pointer;">&times;</button>
          </div>

          <label class="settings-toggle-row">
            <div>
              <strong>Talkative Voice Mode</strong>
              <span>Speak confirmations, 1h/30m reminders & alarms</span>
            </div>
            <input type="checkbox" id="pref-voice-talkative" />
          </label>

          <label class="settings-toggle-row">
            <div>
              <strong>Alarm & Action Chimes</strong>
              <span>Synthesized sound effects on reminders & XP</span>
            </div>
            <input type="checkbox" id="pref-sound-chime" />
          </label>

          <label class="settings-toggle-row">
            <div>
              <strong>Vibrate & Haptic Pulse</strong>
              <span>Device vibration + visual shake on alarms</span>
            </div>
            <input type="checkbox" id="pref-vibrate" />
          </label>

          <label class="settings-toggle-row">
            <div>
              <strong>Notification Popups</strong>
              <span>In-app alarm banner + background OS alerts</span>
            </div>
            <input type="checkbox" id="pref-popups" />
          </label>

          <div style="display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-subtle);">
            <button type="button" id="test-alarm-popup-btn" style="flex: 1; padding: 7px 10px; border-radius: 999px; border: none; background: var(--color-red-primary); color: #FFFFFF; font-size: 11px; font-weight: 800; cursor: pointer;">
              Test Alarm & Voice
            </button>
            <button type="button" id="req-os-notif-btn" style="padding: 7px 10px; border-radius: 999px; border: 1px solid var(--border-subtle); background: var(--bg-cream); color: var(--color-black-dominant); font-size: 11px; font-weight: 700; cursor: pointer;">
              Allow OS Alerts
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- In-App Floating Alarm / Reminder Toast Popup -->
    <div id="alarm-toast-container" style="display: none;"></div>

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

      <button class="nav-item" data-tab="thoughts">
        <svg class="nav-icon" viewBox="0 0 24 24">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2z" />
        </svg>
        <span>Thoughts</span>
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

  function getLocalDateString(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Active Calendar Date tracker
  let currentSelectedDate = getLocalDateString();
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

  // Top Navbar Voice, Sound, Vibration & Popup Settings Popover + In-App Alarm Toast
  const bellBtn = document.querySelector<HTMLButtonElement>('#notif-bell-btn')!;
  const settingsPopover = document.querySelector<HTMLDivElement>('#header-settings-popover')!;
  const closeSettingsBtn = document.querySelector<HTMLButtonElement>('#close-header-settings')!;
  const prefVoiceCheckbox = document.querySelector<HTMLInputElement>('#pref-voice-talkative')!;
  const prefSoundCheckbox = document.querySelector<HTMLInputElement>('#pref-sound-chime')!;
  const prefVibrateCheckbox = document.querySelector<HTMLInputElement>('#pref-vibrate')!;
  const prefPopupsCheckbox = document.querySelector<HTMLInputElement>('#pref-popups')!;
  const testAlarmBtn = document.querySelector<HTMLButtonElement>('#test-alarm-popup-btn')!;
  const reqOsNotifBtn = document.querySelector<HTMLButtonElement>('#req-os-notif-btn')!;
  const alarmToastContainer = document.querySelector<HTMLDivElement>('#alarm-toast-container')!;

  function syncSettingsPopoverUI() {
    const prefs = notificationService.getPreferences();
    const isMuted = voiceService.isMuted();
    prefVoiceCheckbox.checked = !isMuted;
    prefSoundCheckbox.checked = prefs.soundChime;
    prefVibrateCheckbox.checked = prefs.vibrateEnabled;
    prefPopupsCheckbox.checked = prefs.popupEnabled;
    bellBtn.style.color = (!isMuted || prefs.soundChime || prefs.popupEnabled)
      ? 'var(--color-red-primary)'
      : 'var(--color-black-faint)';
  }

  // Sync initial voice mute state with saved preferences
  voiceService.setMuted(notificationService.getPreferences().voiceMuted);
  syncSettingsPopoverUI();

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = settingsPopover.style.display !== 'none';
    settingsPopover.style.display = isOpen ? 'none' : 'block';
    syncSettingsPopoverUI();
  });

  closeSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPopover.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    if (settingsPopover.style.display !== 'none' && !settingsPopover.contains(target) && !bellBtn.contains(target)) {
      settingsPopover.style.display = 'none';
    }
  });

  prefVoiceCheckbox.addEventListener('change', () => {
    const shouldMute = !prefVoiceCheckbox.checked;
    voiceService.setMuted(shouldMute);
    renderVoiceButtonState();
    syncSettingsPopoverUI();
    if (!shouldMute) {
      voiceService.speak('Talkative voice mode enabled, Bruv! I will voice out your confirmations, reminders, and alarms.', true);
    }
  });

  prefSoundCheckbox.addEventListener('change', () => {
    notificationService.updatePreferences({ soundChime: prefSoundCheckbox.checked });
    syncSettingsPopoverUI();
    if (prefSoundCheckbox.checked) {
      notificationService.playAlarmChime('reminder');
    }
  });

  prefVibrateCheckbox.addEventListener('change', () => {
    notificationService.updatePreferences({ vibrateEnabled: prefVibrateCheckbox.checked });
    syncSettingsPopoverUI();
    if (prefVibrateCheckbox.checked) {
      notificationService.triggerVibration([120, 60, 120]);
    }
  });

  prefPopupsCheckbox.addEventListener('change', async () => {
    notificationService.updatePreferences({ popupEnabled: prefPopupsCheckbox.checked });
    syncSettingsPopoverUI();
    if (prefPopupsCheckbox.checked) {
      await notificationService.requestPermission();
    }
  });

  reqOsNotifBtn.addEventListener('click', async () => {
    const granted = await notificationService.requestPermission();
    if (granted) {
      reqOsNotifBtn.textContent = 'OS Alerts Active';
      notificationService.showNotification(
        'CereBruv Background Alerts Active',
        'Your 1-hour, 30-minute, and start-time alarms are synced!',
        true
      );
    } else {
      alert('Browser notifications are blocked. Allow notifications in your browser site settings to receive background alerts.');
    }
  });

  function showAlarmPopupToast(payload: AlarmPopupPayload) {
    if (!notificationService.getPreferences().popupEnabled) return;

    const badgeConfig: Record<AlarmPopupPayload['stage'], { label: string; bg: string; color: string }> = {
      '60min': { label: '1 HR REMINDER', bg: 'rgba(99, 102, 241, 0.14)', color: '#4F46E5' },
      '30min': { label: '30 MIN REMINDER', bg: 'rgba(245, 158, 11, 0.16)', color: '#B45309' },
      'start': { label: 'ALARM NOW', bg: 'rgba(229, 46, 46, 0.15)', color: '#E52E2E' },
      'missed': { label: `MISSED (${payload.xpDelta || -10} XP)`, bg: 'rgba(18, 18, 22, 0.12)', color: '#E52E2E' }
    };

    const cfg = badgeConfig[payload.stage];

    alarmToastContainer.style.display = 'block';
    alarmToastContainer.innerHTML = `
      <div class="alarm-toast-popup ${payload.stage === 'start' || payload.stage === 'missed' ? 'urgent' : ''}">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: ${cfg.bg}; color: ${cfg.color}; letter-spacing: 0.04em;">
              ${cfg.label}
            </span>
            <span style="font-size: 10px; font-weight: 800; color: var(--color-black-muted); text-transform: uppercase;">
              ${payload.task.startTime} • ${payload.task.durationMinutes}m • ${payload.task.urgency} priority
            </span>
          </div>
          <button type="button" id="alarm-toast-dismiss" style="background: none; border: none; font-size: 16px; font-weight: 800; color: var(--color-black-muted); cursor: pointer; line-height: 1;">&times;</button>
        </div>

        <div style="font-size: 14px; font-weight: 800; color: var(--color-black-dominant); margin-bottom: 3px;">
          ${payload.headline}
        </div>
        <div style="font-size: 12px; color: var(--color-black-muted); line-height: 1.4; margin-bottom: 10px;">
          ${payload.message}
        </div>

        <div style="display: flex; gap: 8px;">
          <button type="button" id="alarm-toast-complete" style="flex: 1; padding: 7px 10px; border-radius: 999px; border: none; background: #10B981; color: #FFFFFF; font-size: 11px; font-weight: 800; cursor: pointer;">
            Complete (+25 XP)
          </button>
          <button type="button" id="alarm-toast-reschedule" style="padding: 7px 12px; border-radius: 999px; border: 1px solid var(--border-subtle); background: var(--bg-cream); color: var(--color-black-dominant); font-size: 11px; font-weight: 700; cursor: pointer;">
            Edit / Reschedule
          </button>
        </div>
      </div>
    `;

    alarmToastContainer.querySelector('#alarm-toast-dismiss')?.addEventListener('click', () => {
      alarmToastContainer.style.display = 'none';
    });

    alarmToastContainer.querySelector('#alarm-toast-complete')?.addEventListener('click', async () => {
      alarmToastContainer.style.display = 'none';
      if (payload.task.id !== 'test-alarm') {
        await taskRepository.toggleTaskCompletion(payload.task.id);
        const updatedStats = await userStatsRepository.addExperience(25);
        eventBus.emit(AppEvents.TASK_COMPLETED, payload.task);
        eventBus.emit(AppEvents.STATS_UPDATED, updatedStats);
      }
      notificationService.playAlarmChime('success');
      notificationService.triggerVibration([80, 50, 120]);
      const msg = `Awesome job, Bruv! You crushed "${payload.task.title}" and earned 25 XP!`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: `Crushed "${payload.task.title}"! (+25 XP)`,
        subspeech: msg
      });
      voiceService.speak(msg);
    });

    alarmToastContainer.querySelector('#alarm-toast-reschedule')?.addEventListener('click', () => {
      alarmToastContainer.style.display = 'none';
      if (payload.task.id !== 'test-alarm') {
        taskFormModal.open(payload.task.date || currentSelectedDate, payload.task);
      }
    });
  }

  testAlarmBtn.addEventListener('click', () => {
    settingsPopover.style.display = 'none';
    notificationService.playAlarmChime('start');
    notificationService.triggerVibration([200, 100, 200]);
    const demoPayload: AlarmPopupPayload = {
      id: 'test-alarm-popup',
      task: {
        id: 'test-alarm',
        title: 'Deep Focus Sprint',
        category: 'work',
        startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        durationMinutes: 30,
        urgency: 'high',
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        date: currentSelectedDate
      },
      stage: 'start',
      headline: 'Alarm: "Deep Focus Sprint" starts now!',
      message: 'Voice + Chime + Vibration + Popup test is working smoothly, Bruv!',
      spokenText: 'Heads up, Bruv! Alarm test: your high priority task Deep Focus Sprint is starting right now. Let us crush it!'
    };
    showAlarmPopupToast(demoPayload);
    notificationService.showNotification(demoPayload.headline, demoPayload.message, true);
    eventBus.emit(AppEvents.MASCOT_SPEAK, {
      headline: demoPayload.headline,
      subspeech: demoPayload.spokenText
    });
    voiceService.speak(demoPayload.spokenText);
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
      viewContainer.appendChild(renderTaskList((date, editTask) => taskFormModal.open(date, editTask)));
    } else if (tab === 'thoughts') {
      viewContainer.appendChild(
        renderThoughtsView(
          (date, draftTask) => taskFormModal.open(date, draftTask),
          () => currentSelectedDate
        )
      );
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
    viewContainer.appendChild(renderFocusOrbit((date, editTask) => taskFormModal.open(date, editTask)));
    viewContainer.appendChild(renderTaskList((date, editTask) => taskFormModal.open(date, editTask)));
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
  let hasTemporaryVoiceBanner = false;
  let bannerResetTimer: ReturnType<typeof setTimeout> | null = null;
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

    voiceToggleBtn.style.color = isSpeaking
      ? '#FFFFFF'
      : isMuted
        ? 'var(--color-black-faint)'
        : 'var(--color-red-primary)';
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
    syncSettingsPopoverUI();
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
    // Once speaking/listening completes after a command (and no clarification drawer is awaiting answer), reset banner back to default schedule status
    if (
      !voiceService.isSpeaking() &&
      !voiceService.isListening() &&
      !voiceService.getPendingTaskDraft() &&
      hasTemporaryVoiceBanner
    ) {
      hasTemporaryVoiceBanner = false;
      voiceSubtitleHoldUntil = 0;
      if (bannerResetTimer) {
        clearTimeout(bannerResetTimer);
        bannerResetTimer = null;
      }
      updateMascotStatus();
    }
  });

  eventBus.on(AppEvents.MASCOT_SPEAK, (payload: { headline: string; subspeech: string }) => {
    hasTemporaryVoiceBanner = true;
    voiceSubtitleHoldUntil = Date.now() + 7000;
    const statusTitle = document.querySelector('#mascot-status-title');
    const subspeech = document.querySelector('#mascot-subspeech');
    if (statusTitle && payload.headline) statusTitle.textContent = payload.headline;
    if (subspeech && payload.subspeech) subspeech.textContent = payload.subspeech;

    if (bannerResetTimer) clearTimeout(bannerResetTimer);
    bannerResetTimer = setTimeout(() => {
      if (!voiceService.isSpeaking() && !voiceService.isListening() && !voiceService.getPendingTaskDraft()) {
        hasTemporaryVoiceBanner = false;
        voiceSubtitleHoldUntil = 0;
        updateMascotStatus();
      }
    }, 3500);
  });

  eventBus.on(AppEvents.NAVIGATE_TAB, (tab: string) => {
    if (['orbit', 'tasks', 'thoughts', 'graph', 'cloud'].includes(tab)) {
      switchTab(tab);
    }
  });

  // Real-time 15-second alarm & missed-task check loop
  async function runRealTimeAlarmCheck() {
    const tasks = await taskRepository.getAllTasks();
    const todayStr = getLocalDateString();
    const todayTasks = tasks.filter(t => (t.date || todayStr) === todayStr);

    const triggeredAlarms = notificationService.checkRealTimeTaskAlarms(todayTasks);
    for (const alarm of triggeredAlarms) {
      if (alarm.xpDelta && alarm.xpDelta < 0) {
        const newStats = await userStatsRepository.addExperience(alarm.xpDelta);
        updateStatsUI(newStats);
        eventBus.emit(AppEvents.STATS_UPDATED, newStats);
      }

      // 1. Play chime sound
      if (alarm.stage === 'start') {
        notificationService.playAlarmChime('start');
      } else if (alarm.stage === 'missed') {
        notificationService.playAlarmChime('missed');
      } else {
        notificationService.playAlarmChime('reminder');
      }

      // 2. Trigger vibration + visual shake
      notificationService.triggerVibration(
        alarm.stage === 'start' || alarm.stage === 'missed' ? [250, 100, 250, 100, 300] : [160, 80, 160]
      );

      // 3. Show OS / Browser notification
      notificationService.showNotification(alarm.headline, alarm.message, true);

      // 4. Show in-app interactive toast popup
      showAlarmPopupToast(alarm);

      // 5. Update Mascot Banner & speak aloud in Voice Mode
      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: alarm.headline,
        subspeech: alarm.spokenText
      });
      voiceService.speak(alarm.spokenText);
    }
  }

  function formatFriendlyTime(time24: string): string {
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr || '0', 10);
    const m = parseInt(mStr || '0', 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  // Update Mascot Status dynamically with clean, natural assistant phrasing
  async function updateMascotStatus() {
    const tasks = await taskRepository.getAllTasks();
    const todayStr = getLocalDateString();
    const todayTasks = tasks.filter(t => (t.date || todayStr) === todayStr);
    const now = new Date();
    const currentHourFraction = now.getHours() + now.getMinutes() / 60;
    const pending = sortTasksSmartly(
      todayTasks.filter(t => !t.completed),
      currentHourFraction
    );
    const statusTitle = document.querySelector('#mascot-status-title');
    const subspeech = document.querySelector('#mascot-subspeech');

    // Sync background Service Worker alarms & check real-time 1h / 30m / start / missed triggers
    notificationService.syncAlarmsWithServiceWorker(todayTasks);
    await runRealTimeAlarmCheck();

    // Preserve active voice command subtitle for 7s so user can read what CereBruv just said
    if (Date.now() < voiceSubtitleHoldUntil) {
      return;
    }

    // Separate overdue tasks from active/upcoming tasks for crystal-clear assistant reporting
    const overdueTasks = pending.filter(t => {
      const start = timeStringToFractionalHour(t.startTime);
      const end = start + t.durationMinutes / 60;
      return end < currentHourFraction;
    });
    const upcomingOrActive = pending.filter(t => {
      const start = timeStringToFractionalHour(t.startTime);
      const end = start + t.durationMinutes / 60;
      return end >= currentHourFraction;
    });

    const primaryNext = upcomingOrActive[0] || overdueTasks[0] || pending[0];

    if (statusTitle && subspeech) {
      if (todayTasks.length === 0) {
        statusTitle.textContent = 'Ready when you are, Bruv.';
        subspeech.textContent = 'Your schedule is open today. Tap my avatar to speak or tap + to add a task.';
      } else if (pending.length === 0) {
        statusTitle.textContent = 'All tasks crushed today, Bruv!';
        subspeech.textContent = 'Your streak is protected — enjoy your free time.';
      } else if (overdueTasks.length > 0 && upcomingOrActive.length > 0) {
        const topOverdue = overdueTasks[0];
        const nextUp = upcomingOrActive[0];
        statusTitle.textContent = `${pending.length} tasks left today, Bruv.`;
        subspeech.textContent = `"${topOverdue.title}" (${formatFriendlyTime(topOverdue.startTime)}) is past due • Up next: "${nextUp.title}" at ${formatFriendlyTime(nextUp.startTime)}.`;
      } else if (overdueTasks.length > 0) {
        const topOverdue = overdueTasks[0];
        statusTitle.textContent = `Heads up, Bruv — ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}.`;
        subspeech.textContent = `"${topOverdue.title}" was set for ${formatFriendlyTime(topOverdue.startTime)}. Complete it now or reschedule!`;
      } else if (primaryNext) {
        const prioLabel = primaryNext.urgency === 'high' ? ' • High Priority' : '';
        statusTitle.textContent = `${pending.length} task${pending.length > 1 ? 's' : ''} on your schedule, Bruv.`;
        subspeech.textContent = `Up next at ${formatFriendlyTime(primaryNext.startTime)}: "${primaryNext.title}" (${primaryNext.durationMinutes}m${prioLabel}).`;
      }
    }
  }

  if (realTimeAlarmInterval) {
    clearInterval(realTimeAlarmInterval);
  }
  realTimeAlarmInterval = setInterval(() => {
    runRealTimeAlarmCheck().catch(() => {});
  }, 15000);

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
  eventBus.on(AppEvents.TASK_UPDATED, () => updateMascotStatus());
  eventBus.on(AppEvents.TASK_COMPLETED, () => updateMascotStatus());
  eventBus.on(AppEvents.TASK_DELETED, () => updateMascotStatus());
  eventBus.on(AppEvents.VOICE_CLARIFY_TASK, (draft) => {
    if (!draft) {
      hasTemporaryVoiceBanner = false;
      voiceSubtitleHoldUntil = Date.now() + 2500;
      setTimeout(() => {
        if (!voiceService.isSpeaking() && !voiceService.isListening() && !voiceService.getPendingTaskDraft()) {
          voiceSubtitleHoldUntil = 0;
          updateMascotStatus();
        }
      }, 2600);
    } else {
      isCardExpanded = true;
      renderVoiceButtonState();
    }
  });

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

  if (tabParam && ['orbit', 'tasks', 'thoughts', 'graph', 'cloud'].includes(tabParam)) {
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
