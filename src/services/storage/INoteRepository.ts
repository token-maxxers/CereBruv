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
  deleteNote(id: string): Promise<boolean>;
}
