export interface UserStats {
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  experiencePoints: number;
  tasksCompletedTotal: number;
  level: number;
  activityHistory?: Record<string, number>; // YYYY-MM-DD -> completed count
}
