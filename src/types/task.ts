export type UrgencyLevel = 'low' | 'medium' | 'high';

export type TaskCategory = 'study' | 'work' | 'personal' | 'event' | 'rest';

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
  notes?: string;
  photoUrl?: string;
  links?: SavedLink[];
  createdAt: number; // Unix timestamp
  updatedAt: number;
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
