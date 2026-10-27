import { doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Task } from '../../types/task';
import type { QuickNote } from '../../types/note';
import type { UserStats } from '../../types/user';

const TASKS_KEY = 'cerebruv_tasks_v1';
const NOTES_KEY = 'cerebruv_notes_v1';
const STATS_KEY = 'cerebruv_stats_v1';
const MIGRATED_FLAG_PREFIX = 'cerebruv_migrated_to_firestore_';

/**
 * Performs a one-time migration of existing localStorage tasks, notes, and stats
 * to Firestore under users/{uid}/... on the user's first signed-in launch.
 *
 * Preserves all local data in localStorage without deleting it.
 */
export async function migrateLocalStorageToFirestore(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }

  const uid = user.uid;
  const migrationFlagKey = `${MIGRATED_FLAG_PREFIX}${uid}`;

  // Check if already migrated for this user
  if (localStorage.getItem(migrationFlagKey) === 'true') {
    return false;
  }

  let localTasks: Task[] = [];
  let localNotes: QuickNote[] = [];
  let localStats: UserStats | null = null;

  try {
    const rawTasks = localStorage.getItem(TASKS_KEY);
    if (rawTasks) {
      localTasks = JSON.parse(rawTasks);
    }
  } catch (e) {
    console.warn('Could not parse local tasks for migration:', e);
  }

  try {
    const rawNotes = localStorage.getItem(NOTES_KEY);
    if (rawNotes) {
      localNotes = JSON.parse(rawNotes);
    }
  } catch (e) {
    console.warn('Could not parse local notes for migration:', e);
  }

  try {
    const rawStats = localStorage.getItem(STATS_KEY);
    if (rawStats) {
      localStats = JSON.parse(rawStats);
    }
  } catch (e) {
    console.warn('Could not parse local stats for migration:', e);
  }

  const hasData = localTasks.length > 0 || localNotes.length > 0 || !!localStats;
  if (!hasData) {
    localStorage.setItem(migrationFlagKey, 'true');
    return false;
  }

  try {
    const batch = writeBatch(db);

    // Copy Tasks to Firestore under users/{uid}/tasks/{taskId}
    for (const task of localTasks) {
      if (!task.id) continue;
      const taskRef = doc(db, 'users', uid, 'tasks', task.id);
      batch.set(taskRef, task, { merge: true });
    }

    // Copy Notes to Firestore under users/{uid}/notes/{noteId}
    for (const note of localNotes) {
      if (!note.id) continue;
      const noteRef = doc(db, 'users', uid, 'notes', note.id);
      batch.set(noteRef, note, { merge: true });
    }

    // Copy Stats to Firestore under users/{uid}/stats/main
    if (localStats) {
      const statsRef = doc(db, 'users', uid, 'stats', 'main');
      batch.set(statsRef, localStats, { merge: true });
    }

    await batch.commit();

    // Mark migration completed; local data is intentionally preserved
    localStorage.setItem(migrationFlagKey, 'true');
    return true;
  } catch (err) {
    console.warn('Migration to Firestore failed (offline or network error):', err);
    return false;
  }
}
