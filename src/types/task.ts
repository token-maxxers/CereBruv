export type UrgencyLevel = 'low' | 'medium' | 'high';

export type TaskCategory = 'study' | 'work' | 'personal' | 'event' | 'rest';

export type ReminderTimeMode = 'none' | 'one-time' | 'duration';

export type ReminderBodyFormat = 'paragraph' | 'bullets' | 'checkboxes';

export interface ReminderChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface SavedLink {
  url: string;
  label: string;
  kind: 'qr' | 'url' | 'email';
}

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  date: string; // YYYY-MM-DD, or "" when no date was specified
  startTime: string; // HH:mm (24-hour format e.g. "09:30"), or "" when no time was specified
  durationMinutes: number; // e.g. 45, or 0 when no duration was specified
  urgency: UrgencyLevel;
  completed: boolean;
  timeMode?: ReminderTimeMode;
  bodyFormat?: ReminderBodyFormat;
  checklistItems?: ReminderChecklistItem[];
  eventGroupId?: string;
  notes?: string;
  photoUrl?: string;
  links?: SavedLink[];
  createdAt: number; // Unix timestamp
  updatedAt: number;
}

/**
 * Resolves the effective ReminderTimeMode cleanly for both new and legacy Firestore/LocalStorage tasks.
 */
export function resolveReminderTimeMode(
  task: Pick<Task, 'timeMode' | 'startTime' | 'durationMinutes' | 'date'>
): ReminderTimeMode {
  if (task.timeMode === 'none' || task.timeMode === 'one-time' || task.timeMode === 'duration') {
    return task.timeMode;
  }
  if (task.startTime && task.durationMinutes > 0) {
    return 'duration';
  }
  if (task.startTime || task.date) {
    return 'one-time';
  }
  return 'none';
}

export interface OrbitArcSegment {
  taskId: string;
  title: string;
  category: TaskCategory;
  startHour: number; // Fractional hour (e.g. 9.5 for 09:30)
  endHour: number;   // Fractional hour (e.g. 10.25 for 10:15)
  color: string;     // Color code for Canvas rendering
  urgency: UrgencyLevel;
  completed: boolean;
}

export interface DayWorkloadAnalysis {
  totalBusyMinutes: number;
  totalFreeMinutes: number;
  isOverloaded: boolean; // true if busy time > 720 mins (12 hours)
  realisticNextTask: Task | null;
  companionMessage: string;
}
