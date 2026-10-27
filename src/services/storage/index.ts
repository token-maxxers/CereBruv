/**
 * REPOSITORY EXPORTS & SWAP POINT
 * ------------------------------------------------------------
 * Active engine: Google Firebase Firestore (Scoped under users/{uid}/...)
 * with persistent local caching for full offline capability.
 */

import {
  FirestoreTaskRepository,
  FirestoreNoteRepository,
  FirestoreUserStatsRepository
} from './FirestoreAdapter';

// Singleton active instances connected to Cloud Firestore
export const taskRepository = new FirestoreTaskRepository();
export const noteRepository = new FirestoreNoteRepository();
export const userStatsRepository = new FirestoreUserStatsRepository();

export * from './ITaskRepository';
export * from './INoteRepository';
export * from './IUserStatsRepository';
