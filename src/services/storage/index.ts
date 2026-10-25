/**
 * REPOSITORY EXPORTS & SWAP POINT
 * ------------------------------------------------------------
 * Active default: LocalStorageAdapter (zero-config, persists in browser).
 * To switch to Google Firestore:
 * Simply switch the active instances below to FirestoreTaskRepository.
 */

import {
  LocalTaskRepository,
  LocalNoteRepository,
  LocalUserStatsRepository,
} from './LocalStorageAdapter';

// Singleton active instances (Swap to Firestore when ready)
export const taskRepository = new LocalTaskRepository();
export const noteRepository = new LocalNoteRepository();
export const userStatsRepository = new LocalUserStatsRepository();

export * from './ITaskRepository';
export * from './INoteRepository';
export * from './IUserStatsRepository';
