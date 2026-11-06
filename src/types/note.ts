import type {
  ReminderBodyFormat,
  ReminderChecklistItem,
  ReminderTimeMode,
  SavedLink,
  TaskCategory,
  UrgencyLevel,
} from './task';

export interface QuickNote {
  id: string;
  content: string;
  tags: string[];
  category?: TaskCategory;
  priority?: UrgencyLevel;
  bodyFormat?: ReminderBodyFormat;
  checklistItems?: ReminderChecklistItem[];
  eventGroupId?: string;
  audioUrl?: string;
  photoUrl?: string;
  links?: SavedLink[];
  createdAt: number;
}

export type GraphNodeType = 'task' | 'note' | 'tag' | 'goal';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  reminderMode?: ReminderTimeMode;
  radius: number;
  color: string;
  photoUrl?: string;
  links?: SavedLink[];
  eventGroupId?: string;
  checklistSummary?: string;
  keywords?: string[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface GraphLink {
  sourceId: string;
  targetId: string;
  weight: number;
  kind?: 'category' | 'event';
}
