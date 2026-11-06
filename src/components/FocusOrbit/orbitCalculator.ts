import type { Task, OrbitArcSegment, DayWorkloadAnalysis } from '../../types/task';

// Category color mappings matching our design system
export const CATEGORY_COLORS: Record<string, string> = {
  study: '#4F46E5',    // Indigo
  work: '#0D9488',     // Teal
  personal: '#E52E2E', // CereBruv Red
  event: '#D97706',    // Amber
  rest: '#7C3AED',     // Soft Violet (Sleep & Downtime)
};

/**
 * Converts "HH:mm" 24h string into fractional hour (e.g. "09:30" -> 9.5).
 */
export function timeStringToFractionalHour(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) + (minutes || 0) / 60;
}

/**
 * Formats fractional hour to "HH:mm".
 */
export function fractionalHourToString(hour: number): string {
  const normalized = (hour % 24 + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.round((normalized - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Transforms real user tasks into 24-hour circular arc segments.
 * Untimed tasks (startTime === "") do not draw a fake midnight arc on the 24h dial.
 */
export function calculateOrbitSegments(tasks: Task[]): OrbitArcSegment[] {
  const segments: OrbitArcSegment[] = [];

  // Default Sleep block: 23:00 to 07:00 (Sleep / Rest Arc)
  segments.push({
    taskId: 'sleep_block',
    title: 'Rest & Sleep',
    category: 'rest',
    startHour: 23.0,
    endHour: 31.0, // Wraps to 07:00 next day (23.0 to 7.0)
    color: '#D1C4B2', // Soft sand/beige arc
    urgency: 'low',
    completed: false,
  });

  tasks.forEach(task => {
    if (!task.startTime) return;
    const start = timeStringToFractionalHour(task.startTime);
    const effectiveMinutes = task.durationMinutes > 0 ? task.durationMinutes : 20;
    const durationHours = effectiveMinutes / 60;
    const end = start + durationHours;

    segments.push({
      taskId: task.id,
      title: task.title,
      category: task.category,
      startHour: start,
      endHour: end,
      color: CATEGORY_COLORS[task.category] || '#E52E2E',
      urgency: task.urgency,
      completed: task.completed,
    });
  });

  return segments;
}

/**
 * Smart Assistant Task Prioritizer:
 * Ranks uncompleted tasks by:
 * 0. Timed tasks currently in-progress or starting within 45 mins
 * 1. Timed upcoming tasks today ordered by earliest start time & urgency
 * 2. Untimed tasks (flexible / deadline-only) ordered by urgency
 * 3. Timed overdue uncompleted tasks ordered by urgency & start time
 */
export function sortTasksSmartly(tasks: Task[], currentHourFraction: number): Task[] {
  const urgencyWeight = { high: 3, medium: 2, low: 1 };
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    const aHasTime = Boolean(a.startTime);
    const bHasTime = Boolean(b.startTime);

    const aStart = aHasTime ? timeStringToFractionalHour(a.startTime) : 0;
    const aEnd = aStart + Math.max(15, a.durationMinutes || 0) / 60;
    const bStart = bHasTime ? timeStringToFractionalHour(b.startTime) : 0;
    const bEnd = bStart + Math.max(15, b.durationMinutes || 0) / 60;

    const getGroup = (hasTime: boolean, start: number, end: number) => {
      if (!hasTime) return 2;
      if (end >= currentHourFraction && start <= currentHourFraction + 0.75) return 0;
      if (start > currentHourFraction + 0.75) return 1;
      return 3;
    };

    const groupA = getGroup(aHasTime, aStart, aEnd);
    const groupB = getGroup(bHasTime, bStart, bEnd);
    if (groupA !== groupB) return groupA - groupB;

    if (groupA === 0 || groupA === 2 || groupA === 3) {
      const urgDiff = urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
      if (urgDiff !== 0) return urgDiff;
      return aStart - bStart;
    }

    if (Math.abs(aStart - bStart) <= 1.0) {
      const urgDiff = urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
      if (urgDiff !== 0) return urgDiff;
    }
    return aStart - bStart;
  });
}

/**
 * Evaluates day workload and determines the Realistic Next Task based on urgency, effort, and available free time.
 */
export function analyzeDayWorkload(tasks: Task[], currentHourFraction: number): DayWorkloadAnalysis {
  let totalBusyMinutes = 0;
  const uncompleted = tasks.filter(t => !t.completed);

  tasks.forEach(t => {
    if (t.durationMinutes > 0) {
      totalBusyMinutes += t.durationMinutes;
    }
  });

  // 16 waking hours = 960 minutes
  const totalFreeMinutes = Math.max(0, 960 - totalBusyMinutes);
  const isOverloaded = totalBusyMinutes > 600; // Over 10 hours of scheduled work

  const smartSorted = sortTasksSmartly(uncompleted, currentHourFraction);
  const realisticNextTask: Task | null = smartSorted[0] || null;

  let companionMessage = '';
  if (tasks.length === 0) {
    companionMessage = 'Schedule is open. Add tasks to visualize your day on the Orbit.';
  } else if (uncompleted.length === 0) {
    companionMessage = 'All tasks crushed today! Take time to recharge, Bruv.';
  } else if (isOverloaded) {
    companionMessage = `Day is overloaded (${Math.round(totalBusyMinutes / 60)}h scheduled). Focus on your top priority task first.`;
  } else if (realisticNextTask) {
    const durNote = realisticNextTask.durationMinutes > 0 ? ` (${realisticNextTask.durationMinutes}m)` : '';
    companionMessage = `Optimal next task: "${realisticNextTask.title}"${durNote}. Fits your open block.`;
  } else {
    companionMessage = 'Workload balanced. Keep up the steady momentum.';
  }

  return {
    totalBusyMinutes,
    totalFreeMinutes,
    isOverloaded,
    realisticNextTask,
    companionMessage,
  };
}
