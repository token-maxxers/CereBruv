/**
 * FIRESTORE ADAPTER (FOR TEAMMATE B)
 * -----------------------------------------------------------
 * This class implements the exact same repository interfaces as LocalStorageAdapter.
 * When you are ready to connect Google Firebase Firestore:
 * 1. Install Firebase: `npm install firebase`
 * 2. Initialize Firebase App and Firestore instance.
 * 3. Replace the placeholder methods below with your Firestore queries.
 * 4. In `src/services/storage/index.ts`, change the exported instance.
 */

import type { Task } from '../../types/task';
import type { QuickNote } from '../../types/note';
import type { UserStats } from '../../types/user';
import type { ITaskRepository, CreateTaskDTO } from './ITaskRepository';
import type { INoteRepository, CreateNoteDTO } from './INoteRepository';
import type { IUserStatsRepository } from './IUserStatsRepository';

export class FirestoreTaskRepository implements ITaskRepository {
  async getAllTasks(): Promise<Task[]> {
    // TODO (Teammate B): Replace with:
    // const snapshot = await getDocs(collection(db, 'tasks'));
    // return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    throw new Error('FirestoreTaskRepository not connected yet. Use LocalTaskRepository.');
  }

  async getTaskById(id: string): Promise<Task | null> {
    // TODO (Teammate B): Replace with getDoc(doc(db, 'tasks', id))
    throw new Error(`FirestoreTaskRepository not connected yet (${id}).`);
  }

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    // TODO (Teammate B): Replace with addDoc(collection(db, 'tasks'), { ...dto, completed: false, ... })
    throw new Error(`FirestoreTaskRepository not connected yet (${dto.title}).`);
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task> {
    // TODO (Teammate B): Replace with updateDoc(doc(db, 'tasks', id), updates)
    throw new Error(`FirestoreTaskRepository not connected yet (${id}, ${JSON.stringify(updates)}).`);
  }

  async toggleTaskCompletion(id: string): Promise<Task> {
    // TODO (Teammate B): Fetch current status, flip, and updateDoc
    throw new Error(`FirestoreTaskRepository not connected yet (${id}).`);
  }

  async deleteTask(id: string): Promise<boolean> {
    // TODO (Teammate B): Replace with deleteDoc(doc(db, 'tasks', id))
    throw new Error(`FirestoreTaskRepository not connected yet (${id}).`);
  }

  async clearAllTasks(): Promise<void> {
    throw new Error('FirestoreTaskRepository clear not implemented.');
  }
}

export class FirestoreNoteRepository implements INoteRepository {
  async getAllNotes(): Promise<QuickNote[]> {
    throw new Error('FirestoreNoteRepository not connected yet.');
  }
  async createNote(dto: CreateNoteDTO): Promise<QuickNote> {
    throw new Error(`FirestoreNoteRepository not connected yet (${dto.content}).`);
  }
  async deleteNote(id: string): Promise<boolean> {
    throw new Error(`FirestoreNoteRepository not connected yet (${id}).`);
  }
}

export class FirestoreUserStatsRepository implements IUserStatsRepository {
  async getStats(): Promise<UserStats> {
    throw new Error('FirestoreUserStatsRepository not connected yet.');
  }
  async addExperience(amount: number): Promise<UserStats> {
    throw new Error(`FirestoreUserStatsRepository not connected yet (+${amount} XP).`);
  }
  async recordDailyActivity(): Promise<UserStats> {
    throw new Error('FirestoreUserStatsRepository not connected yet.');
  }
  async incrementTaskCount(): Promise<UserStats> {
    throw new Error('FirestoreUserStatsRepository not connected yet.');
  }
}
