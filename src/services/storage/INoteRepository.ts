import type { QuickNote } from '../../types/note';

export interface CreateNoteDTO {
  content: string;
  tags?: string[];
  audioUrl?: string;
  photoUrl?: string;
}

export interface INoteRepository {
  getAllNotes(): Promise<QuickNote[]>;
  createNote(dto: CreateNoteDTO): Promise<QuickNote>;
  updateNote(id: string, updates: Partial<Omit<QuickNote, 'id' | 'createdAt'>>): Promise<QuickNote>;
  deleteNote(id: string): Promise<boolean>;
}
