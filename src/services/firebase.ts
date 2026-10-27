import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyBQ_YTHADnFFxRe3D1_zNuFLczHExW4zB4",
  authDomain: "cere-bruv.firebaseapp.com",
  projectId: "cere-bruv",
  storageBucket: "cere-bruv.firebasestorage.app",
  messagingSenderId: "106248948674",
  appId: "1:106248948674:web:84468c63706ca95a68e45b",
  measurementId: "G-SP57TL1VLC"
};

// Initialize Firebase (guard against multiple initializations)
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore
export const db = getFirestore(app);

// Analytics (conditionally initialized in browser environments supporting it)
export const initAnalytics = async () => {
  if (typeof window !== 'undefined' && await isSupported()) {
    return getAnalytics(app);
  }
  return null;
};
