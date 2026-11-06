import type { QuickNote } from '../../types/note';
import type { SavedLink, TaskCategory, UrgencyLevel } from '../../types/task';

export interface CreateNoteDTO {
  content: string;
  tags?: string[];
  category?: TaskCategory;
  priority?: UrgencyLevel;
  audioUrl?: string;
  photoUrl?: string;
  links?: SavedLink[];
}

export interface INoteRepository {
  getAllNotes(): Promise<QuickNote[]>;
  createNote(dto: CreateNoteDTO): Promise<QuickNote>;
  updateNote(id: string, updates: Partial<Omit<QuickNote, 'id' | 'createdAt'>>): Promise<QuickNote>;
  deleteNote(id: string): Promise<boolean>;
}
