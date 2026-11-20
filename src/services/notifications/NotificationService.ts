import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth, getFirebaseMessaging } from '../firebase';
import { eventBus, AppEvents } from '../events';
import type {
  NotificationStyle,
  PriorityNotificationDefaults,
  Task,
} from '../../types/task';
import {
  DEFAULT_PRIORITY_NOTIFICATION_STYLES,
  resolveNotificationStyle,
} from '../../types/task';
import { timeStringToFractionalHour } from '../../components/FocusOrbit/orbitCalculator';

export interface CereBruvAlertPreferences {
  voiceMuted: boolean;      // SpeechSynthesis talk-back mute
  soundChime: boolean;      // Web Audio API alarm chime sound
  vibrateEnabled: boolean;  // Haptic vibration + visual shake pulse
  popupEnabled: boolean;    // In-app + OS notification popups
  quietHoursEnabled: boolean;     // Silence non-escalating alerts during sleep hours
  quietStartHour: number;         // 0-23 (default 23 = 11 PM)
  quietEndHour: number;           // 0-23 (default 7 = 7 AM)
  escalatingBreaksQuiet: boolean; // Allow escalating high-priority alerts during quiet hours
  priorityStyles: PriorityNotificationDefaults;
}

export type AlarmStage =
  | '60min'
  | '30min'
  | '20min'
  | '15min'
  | '10min'
  | '5min'
  | 'start'
  | 'missed'
  | 'snooze';

export interface AlarmPopupPayload {
  id: string;
  task: Task;
  stage: AlarmStage;
  headline: string;
  message: string;
  spokenText: string;
  xpDelta?: number;
}

interface StageDefinition {
  stage: AlarmStage;
  minsBefore: number;
  windowMin: number;
  windowMax: number;
  label: string;
}

const STAGE_DEFS: Record<Exclude<AlarmStage, 'missed' | 'snooze'>, StageDefinition> = {
  '60min': { stage: '60min', minsBefore: 60, windowMin: 55, windowMax: 60, label: '1 Hour' },
  '30min': { stage: '30min', minsBefore: 30, windowMin: 25, windowMax: 30, label: '30 Mins' },
  '20min': { stage: '20min', minsBefore: 20, windowMin: 18, windowMax: 20, label: '20 Mins' },
  '15min': { stage: '15min', minsBefore: 15, windowMin: 13, windowMax: 15, label: '15 Mins' },
  '10min': { stage: '10min', minsBefore: 10, windowMin: 8, windowMax: 10, label: '10 Mins' },
  '5min': { stage: '5min', minsBefore: 5, windowMin: 3, windowMax: 5, label: '5 Mins' },
  'start': { stage: 'start', minsBefore: 0, windowMin: -10, windowMax: 0, label: 'Start' },
};

const STYLE_STAGES: Record<Exclude<NotificationStyle, 'auto'>, Array<Exclude<AlarmStage, 'missed' | 'snooze'>>> = {
  silent: [],
  gentle: ['15min', 'start'],
  standard: ['60min', '30min', 'start'],
  escalating: ['60min', '30min', '20min', '10min', '5min', 'start'],
};

const PREFS_STORAGE_KEY = 'cerebruv_alert_prefs_v1';
const FIRED_ALARMS_KEY = 'cerebruv_fired_alarms_v1';
const ACK_ALARMS_KEY = 'cerebruv_ack_alarms_v1';
const SNOOZE_ALARMS_KEY = 'cerebruv_snooze_alarms_v1';

export const ENABLE_MISSED_PENALTY = false;

class NotificationService {
  private permissionGranted: boolean = false;
  private fcmInitialized: boolean = false;
  private prefs: CereBruvAlertPreferences = {
    voiceMuted: false,
    soundChime: true,
    vibrateEnabled: true,
    popupEnabled: true,
    quietHoursEnabled: false,
    quietStartHour: 23,
    quietEndHour: 7,
    escalatingBreaksQuiet: true,
    priorityStyles: { ...DEFAULT_PRIORITY_NOTIFICATION_STYLES },
  };
  private firedAlarms: Set<string> = new Set();
  private ackedTasks: Set<string> = new Set();
  private snoozedAlarms: Map<string, number> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      if ('Notification' in window) {
        this.permissionGranted = Notification.permission === 'granted';
      }
      this.loadPreferences();
      this.loadFiredAlarms();
      this.loadAckAndSnooze();
    }
  }

  private loadPreferences(): void {
    try {
      const saved = localStorage.getItem(PREFS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.prefs = {
          ...this.prefs,
          ...parsed,
          priorityStyles: {
            ...DEFAULT_PRIORITY_NOTIFICATION_STYLES,
            ...(parsed?.priorityStyles || {}),
          },
        };
      } else {
        const legacyMuted = localStorage.getItem('cerebruv_voice_muted') === 'true';
        this.prefs.voiceMuted = legacyMuted;
      }
    } catch {}
  }

  private loadAckAndSnooze(): void {
    try {
      const rawAck = localStorage.getItem(ACK_ALARMS_KEY);
      if (rawAck) {
        this.ackedTasks = new Set((JSON.parse(rawAck) as string[]).slice(-100));
      }
      const rawSnooze = localStorage.getItem(SNOOZE_ALARMS_KEY);
      if (rawSnooze) {
        const entries = JSON.parse(rawSnooze) as Array<[string, number]>;
        const now = Date.now();
        this.snoozedAlarms = new Map(entries.filter(([, ts]) => ts > now - 10 * 60_000));
      }
    } catch {}
  }

  private saveAckAndSnooze(): void {
    try {
      localStorage.setItem(ACK_ALARMS_KEY, JSON.stringify(Array.from(this.ackedTasks).slice(-100)));
      localStorage.setItem(SNOOZE_ALARMS_KEY, JSON.stringify(Array.from(this.snoozedAlarms.entries())));
    } catch {}
  }

  private getTodayStr(now = new Date()): string {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  public acknowledgeTaskAlarms(taskId: string): void {
    const key = `${taskId}_${this.getTodayStr()}`;
    this.ackedTasks.add(key);
    this.snoozedAlarms.delete(taskId);
    this.saveAckAndSnooze();
  }

  public isTaskAcknowledgedToday(taskId: string, todayStr = this.getTodayStr()): boolean {
    return this.ackedTasks.has(`${taskId}_${todayStr}`);
  }

  public snoozeTaskAlarm(task: Task, minutes = 5): void {
    const triggerAt = Date.now() + minutes * 60_000;
    this.snoozedAlarms.set(task.id, triggerAt);
    this.saveAckAndSnooze();
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => {
          reg.active?.postMessage({
            type: 'SYNC_TASK_ALARMS',
            alarms: [
              {
                id: `${task.id}_snooze_${triggerAt}`,
                taskId: task.id,
                stage: 'snooze',
                triggerAt,
                title: `Snoozed Reminder: "${task.title}"`,
                body: `${minutes}m snooze is up! Time to jump into "${task.title}".`,
                vibrate: this.prefs.vibrateEnabled,
                requireInteraction: true,
              },
            ],
          });
        })
        .catch(() => {});
    }
  }

  public getEffectiveStyle(task: Task): Exclude<NotificationStyle, 'auto'> {
    return resolveNotificationStyle(task, this.prefs.priorityStyles);
  }

  public getStageSummary(style: NotificationStyle, urgency: Task['urgency']): string {
    const resolved =
      style === 'auto' ? this.prefs.priorityStyles[urgency] || 'standard' : style;
    const stages = STYLE_STAGES[resolved];
    if (stages.length === 0) return 'No alerts (quietly saved)';
    return `Alerts at: ${stages.map(s => (s === 'start' ? 'Start' : s.replace('min', 'm'))).join(' → ')}`;
  }

  public isQuietHoursNow(style: Exclude<NotificationStyle, 'auto'>): boolean {
    if (!this.prefs.quietHoursEnabled) return false;
    if (style === 'escalating' && this.prefs.escalatingBreaksQuiet) return false;
    const hour = new Date().getHours();
    const { quietStartHour, quietEndHour } = this.prefs;
    if (quietStartHour > quietEndHour) {
      return hour >= quietStartHour || hour < quietEndHour;
    }
    return hour >= quietStartHour && hour < quietEndHour;
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
    this.prefs = {
      ...this.prefs,
      ...partial,
      priorityStyles: {
        ...this.prefs.priorityStyles,
        ...(partial.priorityStyles || {}),
      },
    };
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
  public playAlarmChime(type: 'gentle' | 'reminder' | 'escalating' | 'start' | 'missed' | 'success' = 'reminder'): void {
    if (!this.prefs.soundChime || typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx: AudioContext = new AudioCtx();

      const notes =
        type === 'start'
          ? [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6 (energetic start alarm)
          : type === 'escalating'
            ? [659.25, 880, 659.25, 987.77] // E5 A5 E5 B5 (urgent countdown pulse)
            : type === 'gentle'
              ? [523.25, 659.25] // C5 E5 (soft gentle ping)
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
   * Syncs upcoming task alarms (based on each task's NotificationStyle) into the Service Worker
   * so OS notifications still pop up even when the browser tab is minimized or in the background.
   */
  public syncAlarmsWithServiceWorker(todayTasks: Task[]): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const now = new Date();
    const todayStr = this.getTodayStr(now);

    const pending = todayTasks.filter(
      t => !t.completed && Boolean(t.startTime) && t.date === todayStr && !this.isTaskAcknowledgedToday(t.id, todayStr)
    );
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
      const style = this.getEffectiveStyle(task);
      const stageKeys = STYLE_STAGES[style];
      if (stageKeys.length === 0) return;

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

      stageKeys.forEach(stageKey => {
        const def = STAGE_DEFS[stageKey];
        const triggerAt = taskStart - def.minsBefore * 60 * 1000;
        if (triggerAt <= Date.now()) return;

        const isStart = stageKey === 'start';
        const title = isStart
          ? `CereBruv Alarm: Time for "${task.title}"!`
          : `CereBruv (${def.label} Left): "${task.title}"`;
        const body = isStart
          ? `It's ${task.startTime}, Bruv! Start "${task.title}"${durText} now.`
          : `"${task.title}" starts in ${def.label.toLowerCase()} at ${task.startTime} (${task.urgency} priority).`;

        alarms.push({
          id: `${task.id}_${todayStr}_${stageKey}`,
          taskId: task.id,
          stage: stageKey,
          triggerAt,
          title,
          body,
          vibrate: this.prefs.vibrateEnabled,
          requireInteraction: isStart || style === 'escalating',
        });
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
   * Evaluates all today's tasks against current real time using each task's resolved NotificationStyle
   * (Silent, Gentle, Standard, or Escalating countdown) plus any active snoozed reminders.
   */
  public checkRealTimeTaskAlarms(todayTasks: Task[]): AlarmPopupPayload[] {
    const now = new Date();
    const todayStr = this.getTodayStr(now);
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const nowMs = now.getTime();

    const triggered: AlarmPopupPayload[] = [];
    const pending = todayTasks.filter(t => !t.completed);

    // 0. Check Snoozed Alarms first
    if (this.snoozedAlarms.size > 0) {
      let snoozeChanged = false;
      this.snoozedAlarms.forEach((triggerAt, taskId) => {
        if (nowMs >= triggerAt) {
          const task = pending.find(t => t.id === taskId);
          this.snoozedAlarms.delete(taskId);
          snoozeChanged = true;
          if (task) {
            triggered.push({
              id: `${task.id}_snooze_${triggerAt}`,
              task,
              stage: 'snooze',
              headline: `Snooze Up: "${task.title}", Bruv!`,
              message: `Your snoozed ${task.urgency} priority reminder is ready now.`,
              spokenText: `Snooze timer finished, Bruv! Time to jump into ${task.title}.`,
            });
          }
        }
      });
      if (snoozeChanged) this.saveAckAndSnooze();
    }

    pending
      .filter(t => Boolean(t.startTime) && t.date === todayStr && !this.isTaskAcknowledgedToday(t.id, todayStr))
      .forEach(task => {
        if (!task.startTime) return;
        const style = this.getEffectiveStyle(task);
        if (style === 'silent' || this.isQuietHoursNow(style)) return;

        const stageKeys = STYLE_STAGES[style];
        const startHourFrac = timeStringToFractionalHour(task.startTime);
        const startMins = Math.round(startHourFrac * 60);
        const effectiveDur = task.durationMinutes > 0 ? task.durationMinutes : 15;
        const endMins = startMins + effectiveDur;
        const minsUntilStart = startMins - currentMins;
        const minsPastEnd = currentMins - endMins;
        const durInfo = task.durationMinutes > 0 ? `${task.durationMinutes}m • ` : '';

        stageKeys.forEach(stageKey => {
          const def = STAGE_DEFS[stageKey];
          const key = `${task.id}_${todayStr}_${stageKey}`;
          if (
            minsUntilStart >= def.windowMin &&
            minsUntilStart <= def.windowMax &&
            !this.hasAlarmFired(key)
          ) {
            this.markAlarmFired(key);
            if (stageKey === 'start') {
              triggered.push({
                id: key,
                task,
                stage: 'start',
                headline: `Alarm: Time for "${task.title}", Bruv!`,
                message: `It's ${task.startTime}! Your ${task.urgency} priority ${task.category} task${task.durationMinutes > 0 ? ` (${task.durationMinutes}m)` : ''} is starting right now.`,
                spokenText: `Alarm check, Bruv! It is time for your ${task.urgency} priority task: ${task.title}. Let's get after it!`,
              });
            } else {
              const countdownTag = style === 'escalating' ? 'Countdown: ' : '';
              triggered.push({
                id: key,
                task,
                stage: stageKey,
                headline: `${countdownTag}${def.label} Until "${task.title}"`,
                message: `Scheduled at ${task.startTime} (${durInfo}${task.urgency} priority).`,
                spokenText: `${def.label} until ${task.title} at ${task.startTime}.`,
              });
            }
          }
        });

        // Missed / Overdue Task Check (Task window ended > 2 mins ago and still not completed)
        const keyMissed = `${task.id}_${todayStr}_missed`;
        if (ENABLE_MISSED_PENALTY && minsPastEnd >= 2 && !this.hasAlarmFired(keyMissed)) {
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
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return null;
    }

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

      let token: string | null = null;
      try {
        token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration,
        });
      } catch (tokenErr: any) {
        console.warn('FCM token acquisition skipped or unavailable:', tokenErr?.message || tokenErr);
        return null;
      }

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
    } catch (err: any) {
      console.warn('Failed to initialize Firebase Cloud Messaging:', err?.message || err);
    }

    return null;
  }
}

export const notificationService = new NotificationService();
