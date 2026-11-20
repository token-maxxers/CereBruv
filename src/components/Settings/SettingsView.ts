import { voiceService } from '../../services/voice/VoiceService';
import { notificationService } from '../../services/notifications/NotificationService';

export interface SettingsViewOptions {
  onBack: () => void;
  onTestAlarm: () => void;
  onVoiceStateChange?: () => void;
  onToggleTheme?: (mode: 'clucky' | 'obsidian') => void;
}

type PermState = 'granted' | 'denied' | 'prompt' | 'unknown';

export function renderSettingsView(options: SettingsViewOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = 'settings-page';
  container.style.cssText = 'display: flex; flex-direction: column; gap: var(--spacing-3);';

  const isObsidian = document.documentElement.getAttribute('data-theme') === 'obsidian';

  container.innerHTML = `
    <div class="card-section" style="padding: var(--spacing-3) var(--spacing-4);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <button type="button" id="settings-back-btn" class="icon-btn" title="Back to Profile" aria-label="Back to Profile">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div>
          <h2 class="section-title" style="margin: 0;">Settings</h2>
          <div style="font-size: var(--font-size-xs); color: var(--color-black-muted);">Assistant, alerts &amp; device permissions</div>
        </div>
      </div>
    </div>

    <div class="card-section">
      <div class="section-header" style="margin-bottom: var(--spacing-2);">
        <h3 class="section-title" style="font-size: var(--font-size-base);">Assistant &amp; Alerts</h3>
      </div>

      <label class="settings-toggle-row">
        <div>
          <strong>Talkative Voice Mode</strong>
          <span>Speak confirmations, 1h/30m reminders &amp; alarms</span>
        </div>
        <input type="checkbox" id="settings-voice-talkative" />
      </label>

      <label class="settings-toggle-row">
        <div>
          <strong>Alarm &amp; Action Chimes</strong>
          <span>Synthesized sound effects on reminders &amp; XP</span>
        </div>
        <input type="checkbox" id="settings-sound-chime" />
      </label>

      <label class="settings-toggle-row">
        <div>
          <strong>Vibrate &amp; Haptic Pulse</strong>
          <span>Device vibration + visual shake on alarms</span>
        </div>
        <input type="checkbox" id="settings-vibrate" />
      </label>

      <label class="settings-toggle-row">
        <div>
          <strong>Notification Popups</strong>
          <span>In-app alarm banner + background OS alerts</span>
        </div>
        <input type="checkbox" id="settings-popups" />
      </label>

      <label class="settings-toggle-row">
        <div>
          <strong>Quiet Hours (11 PM – 7 AM)</strong>
          <span>Mute Gentle &amp; Standard alerts at night (Escalating still breaks through)</span>
        </div>
        <input type="checkbox" id="settings-quiet-hours" />
      </label>

      <div style="margin-top: var(--spacing-3); padding-top: var(--spacing-3); border-top: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <strong style="font-size: var(--font-size-xs); color: var(--color-black-dominant); text-transform: uppercase; letter-spacing: 0.04em;">Default Alert Style by Priority</strong>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
          <label style="display: flex; flex-direction: column; gap: 3px; font-size: 0.7rem; font-weight: 700; color: var(--color-black-muted);">
            High Priority
            <select id="settings-style-high" class="form-select" style="padding: 6px 8px; font-size: 0.72rem;">
              <option value="escalating">Escalating</option>
              <option value="standard">Standard</option>
              <option value="gentle">Gentle</option>
              <option value="silent">Silent</option>
            </select>
          </label>
          <label style="display: flex; flex-direction: column; gap: 3px; font-size: 0.7rem; font-weight: 700; color: var(--color-black-muted);">
            Medium Priority
            <select id="settings-style-medium" class="form-select" style="padding: 6px 8px; font-size: 0.72rem;">
              <option value="escalating">Escalating</option>
              <option value="standard">Standard</option>
              <option value="gentle">Gentle</option>
              <option value="silent">Silent</option>
            </select>
          </label>
          <label style="display: flex; flex-direction: column; gap: 3px; font-size: 0.7rem; font-weight: 700; color: var(--color-black-muted);">
            Low Priority
            <select id="settings-style-low" class="form-select" style="padding: 6px 8px; font-size: 0.72rem;">
              <option value="escalating">Escalating</option>
              <option value="standard">Standard</option>
              <option value="gentle">Gentle</option>
              <option value="silent">Silent</option>
            </select>
          </label>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-top: var(--spacing-3); padding-top: var(--spacing-3); border-top: 1px solid var(--border-subtle);">
        <button type="button" id="settings-test-alarm-btn" class="btn btn-primary" style="flex: 1; padding: 9px 14px; font-size: var(--font-size-xs);">
          Test Alarm &amp; Voice
        </button>
        <button type="button" id="settings-os-notif-btn" class="btn btn-secondary" style="padding: 9px 14px; font-size: var(--font-size-xs);">
          Allow OS Alerts
        </button>
      </div>
    </div>

    <div class="card-section">
      <div class="section-header" style="margin-bottom: var(--spacing-2);">
        <h3 class="section-title" style="font-size: var(--font-size-base);">Appearance</h3>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div>
          <strong style="font-size: var(--font-size-sm); color: var(--color-black-dominant); display: block;">Theme Mode</strong>
          <span style="font-size: var(--font-size-xs); color: var(--color-black-muted);">Switch between Clucky Light &amp; Obsidian Dark</span>
        </div>
        <div class="orbit-view-switch">
          <button type="button" id="settings-theme-light" class="orbit-view-btn ${!isObsidian ? 'active' : ''}">Light</button>
          <button type="button" id="settings-theme-dark" class="orbit-view-btn ${isObsidian ? 'active' : ''}">Obsidian</button>
        </div>
      </div>
    </div>

    <div class="card-section">
      <div class="section-header" style="margin-bottom: var(--spacing-2);">
        <h3 class="section-title" style="font-size: var(--font-size-base);">System Permissions</h3>
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div>
            <strong style="font-size: var(--font-size-sm); color: var(--color-black-dominant); display: block;">Notifications</strong>
            <span id="settings-perm-status-notif" style="font-size: var(--font-size-xs); font-weight: 700;">Checking...</span>
          </div>
          <button type="button" id="settings-perm-btn-notif" class="pill-badge" style="display: none;">Request</button>
        </div>
        <div id="settings-perm-guide-notif" style="display: none; font-size: var(--font-size-xs); color: var(--color-red-primary); line-height: 1.35;">
          Notifications are blocked. Tap the padlock/tune icon in your browser address bar &rarr; Site settings &rarr; Allow notifications.
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div>
            <strong style="font-size: var(--font-size-sm); color: var(--color-black-dominant); display: block;">Microphone</strong>
            <span id="settings-perm-status-mic" style="font-size: var(--font-size-xs); font-weight: 700;">Checking...</span>
          </div>
          <button type="button" id="settings-perm-btn-mic" class="pill-badge" style="display: none;">Request</button>
        </div>
        <div id="settings-perm-guide-mic" style="display: none; font-size: var(--font-size-xs); color: var(--color-red-primary); line-height: 1.35;">
          Microphone is blocked. Tap the padlock/tune icon in your browser address bar &rarr; Site settings &rarr; Allow microphone.
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div>
            <strong style="font-size: var(--font-size-sm); color: var(--color-black-dominant); display: block;">Camera</strong>
            <span id="settings-perm-status-cam" style="font-size: var(--font-size-xs); font-weight: 700;">Checking...</span>
          </div>
          <button type="button" id="settings-perm-btn-cam" class="pill-badge" style="display: none;">Request</button>
        </div>
        <div id="settings-perm-guide-cam" style="display: none; font-size: var(--font-size-xs); color: var(--color-red-primary); line-height: 1.35;">
          Camera is blocked. Tap the padlock/tune icon in your browser address bar &rarr; Site settings &rarr; Allow camera.
        </div>
      </div>
    </div>
  `;

  const backBtn = container.querySelector<HTMLButtonElement>('#settings-back-btn')!;
  const prefVoice = container.querySelector<HTMLInputElement>('#settings-voice-talkative')!;
  const prefSound = container.querySelector<HTMLInputElement>('#settings-sound-chime')!;
  const prefVibrate = container.querySelector<HTMLInputElement>('#settings-vibrate')!;
  const prefPopups = container.querySelector<HTMLInputElement>('#settings-popups')!;
  const prefQuiet = container.querySelector<HTMLInputElement>('#settings-quiet-hours')!;
  const styleHighSelect = container.querySelector<HTMLSelectElement>('#settings-style-high')!;
  const styleMedSelect = container.querySelector<HTMLSelectElement>('#settings-style-medium')!;
  const styleLowSelect = container.querySelector<HTMLSelectElement>('#settings-style-low')!;
  const testAlarmBtn = container.querySelector<HTMLButtonElement>('#settings-test-alarm-btn')!;
  const osNotifBtn = container.querySelector<HTMLButtonElement>('#settings-os-notif-btn')!;
  const themeLightBtn = container.querySelector<HTMLButtonElement>('#settings-theme-light')!;
  const themeDarkBtn = container.querySelector<HTMLButtonElement>('#settings-theme-dark')!;

  const permStatusNotif = container.querySelector<HTMLSpanElement>('#settings-perm-status-notif')!;
  const permBtnNotif = container.querySelector<HTMLButtonElement>('#settings-perm-btn-notif')!;
  const permGuideNotif = container.querySelector<HTMLDivElement>('#settings-perm-guide-notif')!;
  const permStatusMic = container.querySelector<HTMLSpanElement>('#settings-perm-status-mic')!;
  const permBtnMic = container.querySelector<HTMLButtonElement>('#settings-perm-btn-mic')!;
  const permGuideMic = container.querySelector<HTMLDivElement>('#settings-perm-guide-mic')!;
  const permStatusCam = container.querySelector<HTMLSpanElement>('#settings-perm-status-cam')!;
  const permBtnCam = container.querySelector<HTMLButtonElement>('#settings-perm-btn-cam')!;
  const permGuideCam = container.querySelector<HTMLDivElement>('#settings-perm-guide-cam')!;

  function syncPrefs() {
    const prefs = notificationService.getPreferences();
    prefVoice.checked = !voiceService.isMuted();
    prefSound.checked = prefs.soundChime;
    prefVibrate.checked = prefs.vibrateEnabled;
    prefPopups.checked = prefs.popupEnabled;
    prefQuiet.checked = prefs.quietHoursEnabled;
    styleHighSelect.value = prefs.priorityStyles.high;
    styleMedSelect.value = prefs.priorityStyles.medium;
    styleLowSelect.value = prefs.priorityStyles.low;
  }

  function applyPermUI(state: PermState, statusEl: HTMLSpanElement, btnEl: HTMLButtonElement, guideEl: HTMLDivElement) {
    if (state === 'granted') {
      statusEl.textContent = '✓ Granted';
      statusEl.style.color = '#059669';
      btnEl.style.display = 'none';
      guideEl.style.display = 'none';
    } else if (state === 'denied') {
      statusEl.textContent = '✕ Denied (Blocked)';
      statusEl.style.color = 'var(--color-red-primary)';
      btnEl.style.display = 'none';
      guideEl.style.display = 'block';
    } else if (state === 'prompt') {
      statusEl.textContent = 'Not asked';
      statusEl.style.color = 'var(--color-black-muted)';
      btnEl.style.display = 'inline-flex';
      btnEl.textContent = 'Request';
      guideEl.style.display = 'none';
    } else {
      statusEl.textContent = 'Unknown';
      statusEl.style.color = 'var(--color-black-muted)';
      btnEl.style.display = 'inline-flex';
      btnEl.textContent = 'Check';
      guideEl.style.display = 'none';
    }
  }

  async function updatePermissionsDashboard() {
    let notifState: PermState = 'unknown';
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') notifState = 'granted';
      else if (Notification.permission === 'denied') notifState = 'denied';
      else if (Notification.permission === 'default') notifState = 'prompt';
    }
    applyPermUI(notifState, permStatusNotif, permBtnNotif, permGuideNotif);

    let micState: PermState = 'unknown';
    if (navigator?.permissions?.query) {
      try {
        const res = await navigator.permissions.query({ name: 'microphone' as any });
        micState = res.state as PermState;
        res.onchange = () => updatePermissionsDashboard();
      } catch {
        micState = 'unknown';
      }
    }
    applyPermUI(micState, permStatusMic, permBtnMic, permGuideMic);

    let camState: PermState = 'unknown';
    if (navigator?.permissions?.query) {
      try {
        const res = await navigator.permissions.query({ name: 'camera' as any });
        camState = res.state as PermState;
        res.onchange = () => updatePermissionsDashboard();
      } catch {
        camState = 'unknown';
      }
    }
    applyPermUI(camState, permStatusCam, permBtnCam, permGuideCam);
  }

  backBtn.addEventListener('click', () => options.onBack());

  prefVoice.addEventListener('change', () => {
    const shouldMute = !prefVoice.checked;
    voiceService.setMuted(shouldMute);
    options.onVoiceStateChange?.();
    if (!shouldMute) {
      voiceService.speak('Talkative voice mode enabled, Bruv! I will voice out your confirmations, reminders, and alarms.', true);
    }
  });

  prefSound.addEventListener('change', () => {
    notificationService.updatePreferences({ soundChime: prefSound.checked });
    if (prefSound.checked) notificationService.playAlarmChime('reminder');
  });

  prefVibrate.addEventListener('change', () => {
    notificationService.updatePreferences({ vibrateEnabled: prefVibrate.checked });
    if (prefVibrate.checked) notificationService.triggerVibration([120, 60, 120]);
  });

  prefPopups.addEventListener('change', async () => {
    notificationService.updatePreferences({ popupEnabled: prefPopups.checked });
    if (prefPopups.checked) {
      await notificationService.requestPermission();
      await updatePermissionsDashboard();
    }
  });

  prefQuiet.addEventListener('change', () => {
    notificationService.updatePreferences({ quietHoursEnabled: prefQuiet.checked });
  });

  const handlePriorityStyleChange = () => {
    notificationService.updatePreferences({
      priorityStyles: {
        high: styleHighSelect.value as any,
        medium: styleMedSelect.value as any,
        low: styleLowSelect.value as any,
      },
    });
  };
  styleHighSelect.addEventListener('change', handlePriorityStyleChange);
  styleMedSelect.addEventListener('change', handlePriorityStyleChange);
  styleLowSelect.addEventListener('change', handlePriorityStyleChange);

  testAlarmBtn.addEventListener('click', () => options.onTestAlarm());

  osNotifBtn.addEventListener('click', async () => {
    const granted = await notificationService.requestPermission();
    await updatePermissionsDashboard();
    if (granted) {
      osNotifBtn.textContent = 'OS Alerts Active';
      notificationService.showNotification(
        'CereBruv Background Alerts Active',
        'Your 1-hour, 30-minute, and start-time alarms are synced!',
        true
      );
    } else {
      alert('Browser notifications are blocked. Allow notifications in your browser site settings to receive background alerts.');
    }
  });

  themeLightBtn.addEventListener('click', () => {
    options.onToggleTheme?.('clucky');
    themeLightBtn.classList.add('active');
    themeDarkBtn.classList.remove('active');
  });

  themeDarkBtn.addEventListener('click', () => {
    options.onToggleTheme?.('obsidian');
    themeDarkBtn.classList.add('active');
    themeLightBtn.classList.remove('active');
  });

  permBtnNotif.addEventListener('click', async () => {
    await notificationService.requestPermission();
    await updatePermissionsDashboard();
  });

  permBtnMic.addEventListener('click', async () => {
    if (navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
    }
    await updatePermissionsDashboard();
  });

  permBtnCam.addEventListener('click', async () => {
    if (navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
    }
    await updatePermissionsDashboard();
  });

  syncPrefs();
  updatePermissionsDashboard();
  return container;
}
