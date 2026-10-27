import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth, getFirebaseMessaging } from '../firebase';
import type { Task } from '../../types/task';
import { timeStringToFractionalHour } from '../../components/FocusOrbit/orbitCalculator';

class NotificationService {
  private permissionGranted: boolean = false;
  private activeTimers: Map<string, number> = new Map();
  private fcmInitialized: boolean = false;

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
      if (this.permissionGranted) {
        this.initFirebaseCloudMessaging();
      }
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
          icon: '/mascot.png',
          badge: '/mascot.png',
        } as any);
      });
    } else {
      new Notification(title, {
        body,
        icon: '/mascot.png',
      });
    }
  }

  /**
   * Primary Path: Local 10-minute task reminder alarms.
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
   * Initializes Firebase Cloud Messaging (FCM Web Push).
   * Retrieves registration token using VAPID key and registers foreground message handler.
   * Saves the token under users/{uid}/stats/main in Firestore.
   */
  async initFirebaseCloudMessaging(): Promise<string | null> {
    if (this.fcmInitialized) return null;

    try {
      const messaging = await getFirebaseMessaging();
      if (!messaging) {
        console.warn('FCM is not supported in this browser environment.');
        return null;
      }

      const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || undefined;

      // Ensure service worker registration is ready
      let serviceWorkerRegistration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        serviceWorkerRegistration = await navigator.serviceWorker.ready;
      }

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration
      });

      if (token) {
        this.fcmInitialized = true;
        console.log('FCM Registration Token acquired:', token);

        // Save token under users/{uid}/stats/main
        const uid = auth.currentUser?.uid;
        if (uid) {
          const statsRef = doc(db, 'users', uid, 'stats', 'main');
          await setDoc(statsRef, { fcmToken: token, fcmUpdatedAt: Date.now() }, { merge: true });
        }

        // Foreground push message listener
        onMessage(messaging, (payload) => {
          console.log('Foreground FCM push message received:', payload);
          const title = payload.notification?.title || payload.data?.title || 'CereBruv Alert';
          const body = payload.notification?.body || payload.data?.body || 'New message from CereBruv';
          this.showNotification(title, body);
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
