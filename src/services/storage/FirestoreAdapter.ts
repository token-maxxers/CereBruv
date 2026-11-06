/**
 * FIRESTORE ADAPTER (FOR FIREBASE BACKEND INTEGRATION)
 * -----------------------------------------------------------
 * Implements repository interfaces using Firebase Firestore Web SDK.
 * All collections are scoped under users/{uid}/...:
 * - Tasks: users/{uid}/tasks
 * - Notes: users/{uid}/notes
 * - Stats: users/{uid}/stats/main
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Task } from '../../types/task';
import type { QuickNote } from '../../types/note';
import type { UserStats } from '../../types/user';
import type { ITaskRepository, CreateTaskDTO } from './ITaskRepository';
import type { INoteRepository, CreateNoteDTO } from './INoteRepository';
import type { IUserStatsRepository } from './IUserStatsRepository';
import {
  LocalTaskRepository,
  LocalNoteRepository,
  LocalUserStatsRepository
} from './LocalStorageAdapter';

const localTaskFallback = new LocalTaskRepository();
const localNoteFallback = new LocalNoteRepository();
const localStatsFallback = new LocalUserStatsRepository();

function getOptionalUid(): string | null {
  return auth.currentUser?.uid || null;
}

/**
 * In Firebase Firestore JS SDK, `setDoc` / `updateDoc` / `deleteDoc` immediately
 * write to the local IndexedDB `persistentLocalCache`, but their returned Promise
 * only resolves after the remote cloud server acknowledges the write.
 * When offline (or on flaky Buildathon Wi-Fi), awaiting the remote ack directly
 * would hang the UI. This helper lets the local cache mutation enqueue immediately
 * and resolves fast when offline or slow.
 */
async function commitFirestoreWrite(writePromise: Promise<unknown>): Promise<void> {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const timeoutMs = isOffline ? 120 : 1200;
  await Promise.race([
    writePromise.catch((err) => {
      console.warn('Firestore background sync warning (cached locally):', err);
    }),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

/**
 * Removes any keys whose value is `undefined` so Firestore `setDoc` / `updateDoc`
 * never throws `Unsupported field value: undefined`.
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  });
  return cleaned as T;
}

export class FirestoreTaskRepository implements ITaskRepository {
  private getTodayString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private tasksCol(uid: string) {
    return collection(db, 'users', uid, 'tasks');
  }

  async getAllTasks(): Promise<Task[]> {
    const uid = getOptionalUid();
    if (!uid) return localTaskFallback.getAllTasks();
    try {
      const snapshot = await getDocs(this.tasksCol(uid));
      const today = this.getTodayString();
      return snapshot.docs.map(d => {
        const data = d.data() as Task;
        return {
          ...data,
          id: d.id,
          date: data.date || today
        };
      });
    } catch {
      return localTaskFallback.getAllTasks();
    }
  }

  async getTaskById(id: string): Promise<Task | null> {
    const uid = getOptionalUid();
    if (!uid) return localTaskFallback.getTaskById(id);
    try {
      const taskRef = doc(db, 'users', uid, 'tasks', id);
      const snap = await getDoc(taskRef);
      if (!snap.exists()) return null;
      const data = snap.data() as Task;
      return {
        ...data,
        id: snap.id,
        date: data.date || this.getTodayString()
      };
    } catch {
      return localTaskFallback.getTaskById(id);
    }
  }

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    const uid = getOptionalUid();
    if (!uid) return localTaskFallback.createTask(dto);

    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const taskRef = doc(db, 'users', uid, 'tasks', taskId);
    const now = Date.now();

    const newTask: Task = {
      id: taskId,
      title: dto.title.trim(),
      category: dto.category,
      date: dto.date || this.getTodayString(),
      startTime: dto.startTime,
      durationMinutes: dto.durationMinutes,
      urgency: dto.urgency,
      completed: false,
      ...(dto.notes && dto.notes.trim() ? { notes: dto.notes.trim() } : {}),
      ...(dto.photoUrl ? { photoUrl: dto.photoUrl } : {}),
      createdAt: now,
      updatedAt: now
    };

    await commitFirestoreWrite(setDoc(taskRef, stripUndefined(newTask)));
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task> {
    const uid = getOptionalUid();
    if (!uid) return localTaskFallback.updateTask(id, updates);

    const taskRef = doc(db, 'users', uid, 'tasks', id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) {
      throw new Error(`Task with id ${id} not found`);
    }

    const current = snap.data() as Task;
    const now = Date.now();
    const cleanedUpdates = stripUndefined({
      ...updates,
      updatedAt: now
    });
    const updated: Task = {
      ...current,
      ...cleanedUpdates,
      id,
      updatedAt: now
    };

    await commitFirestoreWrite(updateDoc(taskRef, cleanedUpdates));
    return updated;
  }

  async toggleTaskCompletion(id: string): Promise<Task> {
    const uid = getOptionalUid();
    if (!uid) return localTaskFallback.toggleTaskCompletion(id);

    const taskRef = doc(db, 'users', uid, 'tasks', id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) {
      throw new Error(`Task with id ${id} not found`);
    }

    const current = snap.data() as Task;
    const completed = !current.completed;
    const now = Date.now();

    await commitFirestoreWrite(
      updateDoc(taskRef, {
        completed,
        updatedAt: now
      })
    );

    return {
      ...current,
      id,
      completed,
      updatedAt: now
    };
  }

  async deleteTask(id: string): Promise<boolean> {
    const uid = getOptionalUid();
    if (!uid) return localTaskFallback.deleteTask(id);

    const taskRef = doc(db, 'users', uid, 'tasks', id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) return false;
    await commitFirestoreWrite(deleteDoc(taskRef));
    return true;
  }

  async clearAllTasks(): Promise<void> {
    const uid = getOptionalUid();
    if (!uid) return localTaskFallback.clearAllTasks();

    const snapshot = await getDocs(this.tasksCol(uid));
    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await commitFirestoreWrite(batch.commit());
  }
}

export class FirestoreNoteRepository implements INoteRepository {
  private notesCol(uid: string) {
    return collection(db, 'users', uid, 'notes');
  }

  async getAllNotes(): Promise<QuickNote[]> {
    const uid = getOptionalUid();
    if (!uid) return localNoteFallback.getAllNotes();
    try {
      const snap = await getDocs(this.notesCol(uid));
      return snap.docs
        .map(d => ({
          ...(d.data() as QuickNote),
          id: d.id
        }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
      return localNoteFallback.getAllNotes();
    }
  }

  async createNote(dto: CreateNoteDTO): Promise<QuickNote> {
    const uid = getOptionalUid();
    if (!uid) return localNoteFallback.createNote(dto);

    const noteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const noteRef = doc(db, 'users', uid, 'notes', noteId);
    const category = dto.category || ((dto.tags && dto.tags[0]) as any) || 'personal';
    const priority = dto.priority || 'medium';

    const newNote: QuickNote = {
      id: noteId,
      content: dto.content.trim(),
      tags: dto.tags && dto.tags.length > 0 ? dto.tags : [category],
      category,
      priority,
      ...(dto.audioUrl ? { audioUrl: dto.audioUrl } : {}),
      ...(dto.photoUrl ? { photoUrl: dto.photoUrl } : {}),
      createdAt: Date.now()
    };

    await commitFirestoreWrite(setDoc(noteRef, stripUndefined(newNote)));
    return newNote;
  }

  async updateNote(id: string, updates: Partial<Omit<QuickNote, 'id' | 'createdAt'>>): Promise<QuickNote> {
    const uid = getOptionalUid();
    if (!uid) return localNoteFallback.updateNote(id, updates);

    const noteRef = doc(db, 'users', uid, 'notes', id);
    const snap = await getDoc(noteRef);
    if (!snap.exists()) {
      throw new Error(`Note with id ${id} not found`);
    }
    const current = snap.data() as QuickNote;
    const cleanedUpdates = stripUndefined({ ...updates });
    await commitFirestoreWrite(updateDoc(noteRef, cleanedUpdates));
    return {
      ...current,
      ...cleanedUpdates,
      id,
    };
  }

  async deleteNote(id: string): Promise<boolean> {
    const uid = getOptionalUid();
    if (!uid) return localNoteFallback.deleteNote(id);

    const noteRef = doc(db, 'users', uid, 'notes', id);
    const snap = await getDoc(noteRef);
    if (!snap.exists()) return false;
    await commitFirestoreWrite(deleteDoc(noteRef));
    return true;
  }
}

export class FirestoreUserStatsRepository implements IUserStatsRepository {
  private getTodayString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private statsDoc(uid: string) {
    return doc(db, 'users', uid, 'stats', 'main');
  }

  private defaultStats(): UserStats {
    return {
      streakDays: 0,
      lastActiveDate: '',
      experiencePoints: 0,
      tasksCompletedTotal: 0,
      level: 1
    };
  }

  async getStats(): Promise<UserStats> {
    const uid = getOptionalUid();
    if (!uid) return localStatsFallback.getStats();
    try {
      const ref = this.statsDoc(uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const initial = this.defaultStats();
        await commitFirestoreWrite(setDoc(ref, initial));
        return initial;
      }
      return snap.data() as UserStats;
    } catch {
      return localStatsFallback.getStats();
    }
  }

  async addExperience(amount: number): Promise<UserStats> {
    const uid = getOptionalUid();
    if (!uid) return localStatsFallback.addExperience(amount);

    const ref = this.statsDoc(uid);
    const snap = await getDoc(ref).catch(() => null);
    const current = snap && snap.exists() ? (snap.data() as UserStats) : this.defaultStats();
    const newXP = Math.max(0, current.experiencePoints + amount);
    const newLevel = Math.floor(newXP / 100) + 1;

    const updated: UserStats = {
      ...current,
      experiencePoints: newXP,
      level: newLevel
    };

    await commitFirestoreWrite(setDoc(ref, updated, { merge: true }));
    return updated;
  }

  async recordDailyActivity(): Promise<UserStats> {
    const uid = getOptionalUid();
    if (!uid) return localStatsFallback.recordDailyActivity();

    const ref = this.statsDoc(uid);
    const today = this.getTodayString();
    const snap = await getDoc(ref).catch(() => null);
    const current = snap && snap.exists() ? (snap.data() as UserStats) : this.defaultStats();

    if (current.lastActiveDate === today) {
      return current;
    }

    let newStreak = current.streakDays;
    if (current.lastActiveDate) {
      const lastDate = new Date(current.lastActiveDate + 'T00:00:00');
      const currentDate = new Date(today + 'T00:00:00');
      const diffDays = Math.round((currentDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));

      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays > 1) {
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    const updated: UserStats = {
      ...current,
      streakDays: newStreak,
      lastActiveDate: today
    };

    await commitFirestoreWrite(setDoc(ref, updated, { merge: true }));
    return updated;
  }

  async incrementTaskCount(): Promise<UserStats> {
    const uid = getOptionalUid();
    if (!uid) return localStatsFallback.incrementTaskCount();

    const ref = this.statsDoc(uid);
    const snap = await getDoc(ref).catch(() => null);
    const current = snap && snap.exists() ? (snap.data() as UserStats) : this.defaultStats();

    const newXP = current.experiencePoints + 25;
    const newTasks = current.tasksCompletedTotal + 1;
    const newLevel = Math.floor(newXP / 100) + 1;

    const updated: UserStats = {
      ...current,
      tasksCompletedTotal: newTasks,
      experiencePoints: newXP,
      level: newLevel
    };

    await commitFirestoreWrite(setDoc(ref, updated, { merge: true }));
    return updated;
  }
}
