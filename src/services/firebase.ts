import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  type Auth
} from 'firebase/auth';
import { getMessaging, isSupported as isMessagingSupported, type Messaging } from 'firebase/messaging';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase (guard against multiple initializations)
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with persistent offline caching
export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  }),
  ignoreUndefinedProperties: true
});

// Initialize Auth
export const auth: Auth = getAuth(app);

// Ensure local persistence for session retention
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Could not set browserLocalPersistence:', err);
  });
}

// Lazy Messaging reference
let messagingInstance: Messaging | null = null;

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  const supported = await isMessagingSupported().catch(() => false);
  if (!supported) return null;

  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

/**
 * Ensures a user is signed in to Firebase Auth.
 * If no user exists, signs in anonymously and resolves with the user's UID.
 */
export async function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) {
    return auth.currentUser.uid;
  }

  return new Promise<string>((resolve, reject) => {
    let resolved = false;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (user) {
          if (!resolved) {
            resolved = true;
            unsubscribe();
            resolve(user.uid);
          }
        } else {
          try {
            const userCredential = await signInAnonymously(auth);
            if (!resolved) {
              resolved = true;
              unsubscribe();
              resolve(userCredential.user.uid);
            }
          } catch (error) {
            if (!resolved) {
              resolved = true;
              unsubscribe();
              reject(error);
            }
          }
        }
      },
      (error) => {
        if (!resolved) {
          resolved = true;
          unsubscribe();
          reject(error);
        }
      }
    );
  });
}

// Analytics (conditionally initialized in browser environments supporting it)
export const initAnalytics = async () => {
  if (typeof window !== 'undefined' && await isSupported()) {
    return getAnalytics(app);
  }
  return null;
};
