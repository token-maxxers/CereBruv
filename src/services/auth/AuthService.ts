import {
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  linkWithPopup,
  linkWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User,
  type Unsubscribe
} from 'firebase/auth';
import { auth } from '../firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
}

export class AuthService {
  /**
   * Translates Firebase error codes to friendly, human-readable messages.
   */
  getFriendlyErrorMessage(err: unknown): string {
    if (!err || typeof err !== 'object') {
      return 'An unexpected error occurred. Please try again.';
    }

    const code = (err as { code?: string }).code || '';

    switch (code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password. Please try again.';
      case 'auth/email-already-in-use':
        return 'This email is already in use by another account.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/popup-closed-by-user':
        return 'Sign in was cancelled.';
      case 'auth/popup-blocked':
        return 'Pop-up was blocked by your browser. Redirecting...';
      case 'auth/network-request-failed':
        return 'Network connection error. Check your connection.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please wait a moment and try again.';
      case 'auth/credential-already-in-use':
        return 'This account is already linked to another user.';
      default:
        return 'Could not complete authentication. Please try again.';
    }
  }

  getCurrentUser(): AuthUser | null {
    const user = auth.currentUser;
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      isAnonymous: user.isAnonymous
    };
  }

  onAuthChange(callback: (user: AuthUser | null) => void): Unsubscribe {
    return onAuthStateChanged(auth, (user: User | null) => {
      if (!user) {
        callback(null);
      } else {
        callback({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          isAnonymous: user.isAnonymous
        });
      }
    });
  }

  async signInWithGoogle(): Promise<AuthUser> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const current = auth.currentUser;

    if (current && current.isAnonymous) {
      // Try linking guest to Google account
      try {
        const result = await linkWithPopup(current, provider);
        return {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
          isAnonymous: result.user.isAnonymous
        };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        // If credential already belongs to an existing user, fall back to direct sign in with credential
        if (code === 'auth/credential-already-in-use' && (err as any).credential) {
          const credResult = await signInWithCredential(auth, (err as any).credential);
          return {
            uid: credResult.user.uid,
            email: credResult.user.email,
            displayName: credResult.user.displayName,
            photoURL: credResult.user.photoURL,
            isAnonymous: credResult.user.isAnonymous
          };
        }
        // If popup blocked in installed PWA/mobile, fall back to redirect
        if (code === 'auth/popup-blocked') {
          await signInWithRedirect(auth, provider);
          throw new Error('Redirecting to Google sign in...');
        }
        throw err;
      }
    }

    // Normal sign-in (non-guest or no user)
    try {
      const result = await signInWithPopup(auth, provider);
      return {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
        isAnonymous: result.user.isAnonymous
      };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, provider);
        throw new Error('Redirecting to Google sign in...');
      }
      throw err;
    }
  }

  async signUpWithEmail(email: string, pass: string): Promise<AuthUser> {
    const current = auth.currentUser;

    if (current && current.isAnonymous) {
      // Link anonymous user to email/password to preserve UID and data
      const credential = EmailAuthProvider.credential(email, pass);
      const result = await linkWithCredential(current, credential);
      return {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
        isAnonymous: result.user.isAnonymous
      };
    }

    const result = await createUserWithEmailAndPassword(auth, email, pass);
    return {
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
      photoURL: result.user.photoURL,
      isAnonymous: result.user.isAnonymous
    };
  }

  async signInWithEmail(email: string, pass: string): Promise<AuthUser> {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return {
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
      photoURL: result.user.photoURL,
      isAnonymous: result.user.isAnonymous
    };
  }

  async continueAsGuest(): Promise<AuthUser> {
    const current = auth.currentUser;
    if (current) {
      return {
        uid: current.uid,
        email: current.email,
        displayName: current.displayName,
        photoURL: current.photoURL,
        isAnonymous: current.isAnonymous
      };
    }

    const result = await signInAnonymously(auth);
    return {
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
      photoURL: result.user.photoURL,
      isAnonymous: result.user.isAnonymous
    };
  }

  async signOut(): Promise<void> {
    await fbSignOut(auth);
  }

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  }
}

export const authService = new AuthService();
