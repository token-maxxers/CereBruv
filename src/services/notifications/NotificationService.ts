import type { Task } from '../../types/task';
import { timeStringToFractionalHour } from '../../components/FocusOrbit/orbitCalculator';

class NotificationService {
  private permissionGranted: boolean = false;
  private activeTimers: Map<string, number> = new Map();

  constructor() {
    if ('Notification' in window) {
      this.permissionGranted = Notification.permission === 'granted';
    }
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
      return this.permissionGranted;
    } catch {
      return false;
    }
  }

  isGranted(): boolean {
    return this.permissionGranted;
  }

  /**
   * Show immediate local notification pop-up.
   */
  showNotification(title: string, body: string): void {
    if (!this.permissionGranted) return;

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        } as any);
      });
    } else {
      new Notification(title, {
        body,
        icon: '/icon-192.png',
      });
    }
  }

  /**
   * Schedules a reminder 10 minutes before task starts.
   */
  scheduleTaskAlert(task: Task): void {
    if (!this.permissionGranted || task.completed) return;

    // Clear previous timer if exists
    if (this.activeTimers.has(task.id)) {
      window.clearTimeout(this.activeTimers.get(task.id));
      this.activeTimers.delete(task.id);
    }

    const taskHour = timeStringToFractionalHour(task.startTime);
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;

    // Minutes until task starts
    const diffHours = taskHour - currentHour;
    const diffMinutes = diffHours * 60;

    // Alert 10 mins before, or immediately if starting within 10 mins
    const triggerInMinutes = diffMinutes - 10;

    if (triggerInMinutes > 0) {
      const ms = triggerInMinutes * 60 * 1000;
      const timerId = window.setTimeout(() => {
        this.showNotification(
          `CereBruv: Starting in 10 mins`,
          `"${task.title}" (${task.durationMinutes}m) is scheduled at ${task.startTime}.`
        );
        this.activeTimers.delete(task.id);
      }, ms);

      this.activeTimers.set(task.id, timerId);
    }
  }

  /**
   * Hook for Teammate D: Connect Google Firebase Cloud Messaging (FCM).
   * 
   * Example:
   * import { getMessaging, getToken, onMessage } from 'firebase/messaging';
   * const messaging = getMessaging(firebaseApp);
   * const token = await getToken(messaging, { vapidKey: '...' });
   */
  initFirebaseCloudMessaging(): void {
    console.log('[NotificationService] Ready for Teammate D to plug Firebase Cloud Messaging (FCM).');
  }
}

export const notificationService = new NotificationService();
