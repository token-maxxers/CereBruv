import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth, getFirebaseMessaging } from '../firebase';
import { eventBus, AppEvents } from '../events';
import type { Task } from '../../types/task';
import { timeStringToFractionalHour } from '../../components/FocusOrbit/orbitCalculator';

export interface CereBruvAlertPreferences {
  voiceMuted: boolean;      // SpeechSynthesis talk-back mute
  soundChime: boolean;      // Web Audio API alarm chime sound
  vibrateEnabled: boolean;  // Haptic vibration + visual shake pulse
  popupEnabled: boolean;    // In-app + OS notification popups
}

export type AlarmStage = '60min' | '30min' | 'start' | 'missed';

export interface AlarmPopupPayload {
  id: string;
  task: Task;
  stage: AlarmStage;
  headline: string;
  message: string;
  spokenText: string;
  xpDelta?: number;
}

const PREFS_STORAGE_KEY = 'cerebruv_alert_prefs_v1';
const FIRED_ALARMS_KEY = 'cerebruv_fired_alarms_v1';

class NotificationService {
  private permissionGranted: boolean = false;
  private fcmInitialized: boolean = false;
  private prefs: CereBruvAlertPreferences = {
    voiceMuted: false,
    soundChime: true,
    vibrateEnabled: true,
    popupEnabled: true,
  };
  private firedAlarms: Set<string> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      if ('Notification' in window) {
        this.permissionGranted = Notification.permission === 'granted';
      }
      this.loadPreferences();
      this.loadFiredAlarms();
    }
  }

  private loadPreferences(): void {
    try {
      const saved = localStorage.getItem(PREFS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.prefs = { ...this.prefs, ...parsed };
      } else {
        const legacyMuted = localStorage.getItem('cerebruv_voice_muted') === 'true';
        this.prefs.voiceMuted = legacyMuted;
      }
    } catch {}
  }

  private savePreferences(): void {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(this.prefs));
      localStorage.setItem('cerebruv_voice_muted', String(this.prefs.voiceMuted));
      eventBus.emit(AppEvents.SETTINGS_CHANGED, this.prefs);
    } catch {}
  }

  private loadFiredAlarms(): void {
    try {
      const raw = localStorage.getItem(FIRED_ALARMS_KEY);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        this.firedAlarms = new Set(arr.slice(-200));
      }
    } catch {}
  }

  private markAlarmFired(key: string): void {
    this.firedAlarms.add(key);
    try {
      localStorage.setItem(FIRED_ALARMS_KEY, JSON.stringify(Array.from(this.firedAlarms).slice(-200)));
    } catch {}
  }

  public hasAlarmFired(key: string): boolean {
    return this.firedAlarms.has(key);
  }

  public getPreferences(): CereBruvAlertPreferences {
    return { ...this.prefs };
  }

  public updatePreferences(partial: Partial<CereBruvAlertPreferences>): CereBruvAlertPreferences {
    this.prefs = { ...this.prefs, ...partial };
    this.savePreferences();
    return { ...this.prefs };
  }

  /**
   * Request system notification permission from user.
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported in this browser.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === 'granted';
      if (this.permissionGranted) {
        this.initFirebaseCloudMessaging();
      }
      return this.permissionGranted;
    } catch {
      return false;
    }
  }

  isGranted(): boolean {
    if ('Notification' in window) {
      this.permissionGranted = Notification.permission === 'granted';
    }
    return this.permissionGranted;
  }

  /**
   * Plays a crisp synthesized Web Audio API alarm chime (zero external audio files needed).
   */
  public playAlarmChime(type: 'reminder' | 'start' | 'missed' | 'success' = 'reminder'): void {
    if (!this.prefs.soundChime || typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx: AudioContext = new AudioCtx();

      const notes =
        type === 'start'
          ? [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6 (energetic start alarm)
          : type === 'missed'
            ? [440, 392, 349.23] // A4 G4 F4 (gentle heads-up tone)
            : type === 'success'
              ? [587.33, 783.99, 987.77] // D5 G5 B5 (celebration chime)
              : [523.25, 659.25, 783.99]; // C5 E5 G5 (friendly reminder chime)

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type === 'missed' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);

        gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.13);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.13 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.24);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.13);
        osc.stop(ctx.currentTime + i * 0.13 + 0.25);
      });

      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 1200);
    } catch {}
  }

  /**
   * Triggers hardware haptic vibration on Android/mobile + visual shake pulse on desktop/iOS.
   */
  public triggerVibration(pattern: number[] = [200, 80, 200]): void {
    if (!this.prefs.vibrateEnabled || typeof window === 'undefined') return;

    try {
      if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {}

    const banner = document.querySelector<HTMLElement>('#mascot-banner');
    if (banner) {
      banner.classList.remove('vibrate-shake');
      void banner.offsetWidth;
      banner.classList.add('vibrate-shake');
      setTimeout(() => banner.classList.remove('vibrate-shake'), 650);
    }
  }

  /**
   * Show immediate OS / Service Worker notification pop-up.
   */
  showNotification(title: string, body: string, requireInteraction = false): void {
    if (!this.prefs.popupEnabled) return;

    if (this.isGranted()) {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body,
            icon: '/mascot.png',
            badge: '/mascot.png',
            requireInteraction,
            vibrate: this.prefs.vibrateEnabled ? [200, 100, 200] : undefined,
          } as any);
        });
      } else {
        try {
          new Notification(title, {
            body,
            icon: '/mascot.png',
            requireInteraction,
          });
        } catch {}
      }
    }
  }

  /**
   * Syncs upcoming task alarms (1 hr before, 30 mins before, exact start time) into the Service Worker
   * so OS notifications still pop up even when the browser tab is minimized or in the background.
   */
  public syncAlarmsWithServiceWorker(todayTasks: Task[]): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${day}`;

    const pending = todayTasks.filter(t => !t.completed && Boolean(t.startTime) && t.date === todayStr);
    const alarms: Array<{
      id: string;
      taskId: string;
      stage: AlarmStage;
      triggerAt: number;
      title: string;
      body: string;
      vibrate: boolean;
      requireInteraction: boolean;
    }> = [];

    pending.forEach(task => {
      if (!task.startTime) return;
      const [hStr, mStr] = task.startTime.split(':');
      const taskStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        parseInt(hStr || '0', 10),
        parseInt(mStr || '0', 10),
        0
      ).getTime();
      const durText = task.durationMinutes > 0 ? ` (${task.durationMinutes}m)` : '';

      const stages: Array<{ stage: AlarmStage; offsetMs: number; title: string; body: string }> = [
        {
          stage: '60min',
          offsetMs: -60 * 60 * 1000,
          title: `CereBruv: 1 Hour Heads-Up`,
          body: `"${task.title}" (${task.category.toUpperCase()}) starts in 1 hour at ${task.startTime}.`,
        },
        {
          stage: '30min',
          offsetMs: -30 * 60 * 1000,
          title: `CereBruv: 30 Mins Before Task`,
          body: `"${task.title}" starts in 30 minutes at ${task.startTime} (${task.urgency} priority).`,
        },
        {
          stage: 'start',
          offsetMs: 0,
          title: `CereBruv Alarm: Time for "${task.title}"!`,
          body: `It's ${task.startTime}, Bruv! Start "${task.title}"${durText} now.`,
        },
      ];

      stages.forEach(s => {
        const triggerAt = taskStart + s.offsetMs;
        if (triggerAt > Date.now()) {
          alarms.push({
            id: `${task.id}_${todayStr}_${s.stage}`,
            taskId: task.id,
            stage: s.stage,
            triggerAt,
            title: s.title,
            body: s.body,
            vibrate: this.prefs.vibrateEnabled,
            requireInteraction: s.stage === 'start',
          });
        }
      });
    });

    navigator.serviceWorker.ready
      .then(reg => {
        reg.active?.postMessage({
          type: 'SYNC_TASK_ALARMS',
          alarms,
        });
      })
      .catch(() => {});
  }

  /**
   * Evaluates all today's tasks against current real time and returns any newly triggered
   * 1-hour reminder, 30-min reminder, exact start-time alarm, or missed task alert.
   */
  public checkRealTimeTaskAlarms(todayTasks: Task[]): AlarmPopupPayload[] {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${day}`;
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const triggered: AlarmPopupPayload[] = [];
    const pending = todayTasks.filter(t => !t.completed && Boolean(t.startTime) && t.date === todayStr);

    pending.forEach(task => {
      if (!task.startTime) return;
      const startHourFrac = timeStringToFractionalHour(task.startTime);
      const startMins = Math.round(startHourFrac * 60);
      const effectiveDur = task.durationMinutes > 0 ? task.durationMinutes : 15;
      const endMins = startMins + effectiveDur;
      const minsUntilStart = startMins - currentMins;
      const minsPastEnd = currentMins - endMins;
      const durInfo = task.durationMinutes > 0 ? `${task.durationMinutes}m • ` : '';

      // 1. 1-Hour Before Reminder (55 to 60 mins before start)
      const key60 = `${task.id}_${todayStr}_60min`;
      if (minsUntilStart >= 55 && minsUntilStart <= 60 && !this.hasAlarmFired(key60)) {
        this.markAlarmFired(key60);
        triggered.push({
          id: key60,
          task,
          stage: '60min',
          headline: `1 Hour Until "${task.title}", Bruv!`,
          message: `Scheduled at ${task.startTime} (${durInfo}${task.urgency} priority).`,
          spokenText: `Heads up, Bruv! You have ${task.title} coming up in 1 hour at ${task.startTime}.`,
        });
      }

      // 2. 30-Minutes Before Reminder (25 to 30 mins before start)
      const key30 = `${task.id}_${todayStr}_30min`;
      if (minsUntilStart >= 25 && minsUntilStart <= 30 && !this.hasAlarmFired(key30)) {
        this.markAlarmFired(key30);
        triggered.push({
          id: key30,
          task,
          stage: '30min',
          headline: `30 Mins Until "${task.title}", Bruv!`,
          message: `Starting at ${task.startTime} (${task.category.toUpperCase()} • ${task.urgency} priority). Wrap up what you're doing!`,
          spokenText: `Reminder, Bruv! ${task.title} starts in 30 minutes at ${task.startTime}. Get ready!`,
        });
      }

      // 3. Exact Start Time / In-Window Alarm (0 to 10 mins after start time)
      const keyStart = `${task.id}_${todayStr}_start`;
      if (minsUntilStart <= 0 && minsUntilStart >= -10 && !this.hasAlarmFired(keyStart)) {
        this.markAlarmFired(keyStart);
        triggered.push({
          id: keyStart,
          task,
          stage: 'start',
          headline: `Alarm: Time for "${task.title}", Bruv!`,
          message: `It's ${task.startTime}! Your ${task.urgency} priority ${task.category} task${task.durationMinutes > 0 ? ` (${task.durationMinutes}m)` : ''} is starting right now.`,
          spokenText: `Alarm check, Bruv! It is time for your ${task.urgency} priority task: ${task.title}. Let's get after it!`,
        });
      }

      // 4. Missed / Overdue Task Check (Task window ended > 2 mins ago and still not completed)
      const keyMissed = `${task.id}_${todayStr}_missed`;
      if (minsPastEnd >= 2 && !this.hasAlarmFired(keyMissed)) {
        this.markAlarmFired(keyMissed);
        const penalty = task.urgency === 'high' ? -15 : -10;
        triggered.push({
          id: keyMissed,
          task,
          stage: 'missed',
          headline: `Missed Task: "${task.title}" (${penalty} XP)`,
          message: `Window ${task.startTime}${task.durationMinutes > 0 ? ` (${task.durationMinutes}m)` : ''} passed without completion. Complete it now or reschedule!`,
          spokenText: `Hey Bruv, the scheduled time for ${task.title} at ${task.startTime} has passed. You lost ${Math.abs(penalty)} XP, but you can still complete it or reschedule it now!`,
          xpDelta: penalty,
        });
      }
    });

    return triggered;
  }

  /**
   * Legacy compatibility wrapper for single task scheduling.
   */
  scheduleTaskAlert(_task: Task): void {
    // Handled by checkRealTimeTaskAlarms + syncAlarmsWithServiceWorker
  }

  /**
   * Initializes Firebase Cloud Messaging (FCM Web Push).
   */
  async initFirebaseCloudMessaging(): Promise<string | null> {
    if (this.fcmInitialized) return null;

    try {
      const messaging = await getFirebaseMessaging();
      if (!messaging) {
        return null;
      }

      const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || undefined;

      let serviceWorkerRegistration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        serviceWorkerRegistration = await navigator.serviceWorker.ready;
      }

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration,
      });

      if (token) {
        this.fcmInitialized = true;
        const uid = auth.currentUser?.uid;
        if (uid) {
          const statsRef = doc(db, 'users', uid, 'stats', 'main');
          await setDoc(statsRef, { fcmToken: token, fcmUpdatedAt: Date.now() }, { merge: true });
        }

        onMessage(messaging, (payload) => {
          const title = payload.notification?.title || payload.data?.title || 'CereBruv Alert';
          const body = payload.notification?.body || payload.data?.body || 'New message from CereBruv';
          this.showNotification(title, body, true);
        });

        return token;
      }
    } catch (err) {
      console.warn('Failed to initialize Firebase Cloud Messaging:', err);
    }

    return null;
  }
}

export const notificationService = new NotificationService();
