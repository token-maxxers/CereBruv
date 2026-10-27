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
  writeBatch,
  increment,
  runTransaction
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Task } from '../../types/task';
import type { QuickNote } from '../../types/note';
import type { UserStats } from '../../types/user';
import type { ITaskRepository, CreateTaskDTO } from './ITaskRepository';
import type { INoteRepository, CreateNoteDTO } from './INoteRepository';
import type { IUserStatsRepository } from './IUserStatsRepository';

function getRequiredUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('User is not authenticated with Firebase Auth.');
  }
  return uid;
}


/**
 * Removes keys with undefined values recursively.
 * Preserves null, 0, false, empty strings, and Firestore sentinel values.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      result[key] = stripUndefined(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        Object.getPrototypeOf(item) === Object.prototype
          ? stripUndefined(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
export class FirestoreTaskRepository implements ITaskRepository {
  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private tasksCol(uid: string) {
    return collection(db, 'users', uid, 'tasks');
  }

  async getAllTasks(): Promise<Task[]> {
    const uid = getRequiredUid();
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
  }

  async getTaskById(id: string): Promise<Task | null> {
    const uid = getRequiredUid();
    const taskRef = doc(db, 'users', uid, 'tasks', id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Task;
    return {
      ...data,
      id: snap.id,
      date: data.date || this.getTodayString()
    };
  }

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    const uid = getRequiredUid();
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
      notes: dto.notes ? dto.notes.trim() : undefined,
      createdAt: now,
      updatedAt: now
    };

    await setDoc(taskRef, stripUndefined(newTask as unknown as Record<string, unknown>) as unknown as Task);
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task> {
    const uid = getRequiredUid();
    const taskRef = doc(db, 'users', uid, 'tasks', id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) {
      throw new Error(`Task with id ${id} not found`);
    }

    const current = snap.data() as Task;
    const now = Date.now();
    const updated: Task = {
      ...current,
      ...updates,
      id,
      updatedAt: now
    };

    await updateDoc(taskRef, stripUndefined({
      ...updates,
      updatedAt: now
    } as Record<string, unknown>));

    return updated;
  }

  async toggleTaskCompletion(id: string): Promise<Task> {
    const uid = getRequiredUid();
    const taskRef = doc(db, 'users', uid, 'tasks', id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) {
      throw new Error(`Task with id ${id} not found`);
    }

    const current = snap.data() as Task;
    const completed = !current.completed;
    const now = Date.now();

    await updateDoc(taskRef, {
      completed,
      updatedAt: now
    });

    return {
      ...current,
      id,
      completed,
      updatedAt: now
    };
  }

  async deleteTask(id: string): Promise<boolean> {
    const uid = getRequiredUid();
    const taskRef = doc(db, 'users', uid, 'tasks', id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) return false;
    await deleteDoc(taskRef);
    return true;
  }

  async clearAllTasks(): Promise<void> {
    const uid = getRequiredUid();
    const snapshot = await getDocs(this.tasksCol(uid));
    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  }
}

export class FirestoreNoteRepository implements INoteRepository {
  private notesCol(uid: string) {
    return collection(db, 'users', uid, 'notes');
  }

  async getAllNotes(): Promise<QuickNote[]> {
    const uid = getRequiredUid();
    const snap = await getDocs(this.notesCol(uid));
    return snap.docs.map(d => ({
      ...(d.data() as QuickNote),
      id: d.id
    }));
  }

  async createNote(dto: CreateNoteDTO): Promise<QuickNote> {
    const uid = getRequiredUid();
    const noteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const noteRef = doc(db, 'users', uid, 'notes', noteId);

    const newNote: QuickNote = {
      id: noteId,
      content: dto.content.trim(),
      tags: dto.tags || [],
      audioUrl: dto.audioUrl,
      photoUrl: dto.photoUrl,
      createdAt: Date.now()
    };

    await setDoc(noteRef, stripUndefined(newNote as unknown as Record<string, unknown>) as unknown as QuickNote);
    return newNote;
  }

  async deleteNote(id: string): Promise<boolean> {
    const uid = getRequiredUid();
    const noteRef = doc(db, 'users', uid, 'notes', id);
    const snap = await getDoc(noteRef);
    if (!snap.exists()) return false;
    await deleteDoc(noteRef);
    return true;
  }
}

export class FirestoreUserStatsRepository implements IUserStatsRepository {
  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
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
    const uid = getRequiredUid();
    const ref = this.statsDoc(uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const initial = this.defaultStats();
      await setDoc(ref, stripUndefined(initial as unknown as Record<string, unknown>) as unknown as UserStats);
      return initial;
    }
    return snap.data() as UserStats;
  }

  async addExperience(amount: number): Promise<UserStats> {
    const uid = getRequiredUid();
    const ref = this.statsDoc(uid);

    return await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      const current = snap.exists() ? (snap.data() as UserStats) : this.defaultStats();
      const newXP = current.experiencePoints + amount;
      const newLevel = Math.floor(newXP / 100) + 1;

      txn.set(
        ref,
        stripUndefined({
          experiencePoints: increment(amount),
          level: newLevel
        } as Record<string, unknown>),
        { merge: true }
      );

      return {
        ...current,
        experiencePoints: newXP,
        level: newLevel
      };
    });
  }

  async recordDailyActivity(): Promise<UserStats> {
    const uid = getRequiredUid();
    const ref = this.statsDoc(uid);
    const today = this.getTodayString();

    return await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      const current = snap.exists() ? (snap.data() as UserStats) : this.defaultStats();

      if (current.lastActiveDate === today) {
        return current;
      }

      let newStreak = current.streakDays;
      if (current.lastActiveDate) {
        const lastDate = new Date(current.lastActiveDate);
        const currentDate = new Date(today);
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

      txn.set(ref, stripUndefined(updated as unknown as Record<string, unknown>) as unknown as UserStats, { merge: true });
      return updated;
    });
  }

  async incrementTaskCount(): Promise<UserStats> {
    const uid = getRequiredUid();
    const ref = this.statsDoc(uid);

    return await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      const current = snap.exists() ? (snap.data() as UserStats) : this.defaultStats();

      const newXP = current.experiencePoints + 25;
      const newTasks = current.tasksCompletedTotal + 1;
      const newLevel = Math.floor(newXP / 100) + 1;

      txn.set(
        ref,
        stripUndefined({
          tasksCompletedTotal: increment(1),
          experiencePoints: increment(25),
          level: newLevel
        } as Record<string, unknown>),
        { merge: true }
      );

      return {
        ...current,
        tasksCompletedTotal: newTasks,
        experiencePoints: newXP,
        level: newLevel
      };
    });
  }
}
