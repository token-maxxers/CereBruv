import type { Task } from '../../types/task';
import type { QuickNote } from '../../types/note';
import type { UserStats } from '../../types/user';
import type { ITaskRepository, CreateTaskDTO } from './ITaskRepository';
import type { INoteRepository, CreateNoteDTO } from './INoteRepository';
import type { IUserStatsRepository } from './IUserStatsRepository';

const TASKS_KEY = 'cerebruv_tasks_v1';
const NOTES_KEY = 'cerebruv_notes_v1';
const STATS_KEY = 'cerebruv_stats_v1';

export class LocalTaskRepository implements ITaskRepository {
  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private read(): Task[] {
    try {
      const data = localStorage.getItem(TASKS_KEY);
      if (!data) return [];
      const tasks: Task[] = JSON.parse(data);
      const today = this.getTodayString();
      // Backwards compatibility for existing tasks without date
      return tasks.map(t => ({
        ...t,
        date: t.date || today,
      }));
    } catch {
      return [];
    }
  }

  private write(tasks: Task[]): void {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  }

  async getAllTasks(): Promise<Task[]> {
    return this.read();
  }

  async getTaskById(id: string): Promise<Task | null> {
    const tasks = this.read();
    return tasks.find(t => t.id === id) || null;
  }

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    const tasks = this.read();
    const newTask: Task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: dto.title.trim(),
      category: dto.category,
      date: dto.date || this.getTodayString(),
      startTime: dto.startTime,
      durationMinutes: dto.durationMinutes,
      urgency: dto.urgency,
      completed: false,
      notes: dto.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    tasks.push(newTask);
    this.write(tasks);
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task> {
    const tasks = this.read();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error(`Task with id ${id} not found`);
    }

    const updatedTask: Task = {
      ...tasks[index],
      ...updates,
      updatedAt: Date.now(),
    };

    tasks[index] = updatedTask;
    this.write(tasks);
    return updatedTask;
  }

  async toggleTaskCompletion(id: string): Promise<Task> {
    const tasks = this.read();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error(`Task with id ${id} not found`);
    }

    const task = tasks[index];
    task.completed = !task.completed;
    task.updatedAt = Date.now();
    this.write(tasks);
    return task;
  }

  async deleteTask(id: string): Promise<boolean> {
    const tasks = this.read();
    const filtered = tasks.filter(t => t.id !== id);
    if (filtered.length === tasks.length) return false;
    this.write(filtered);
    return true;
  }

  async clearAllTasks(): Promise<void> {
    localStorage.removeItem(TASKS_KEY);
  }
}

export class LocalNoteRepository implements INoteRepository {
  private read(): QuickNote[] {
    try {
      const data = localStorage.getItem(NOTES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private write(notes: QuickNote[]): void {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }

  async getAllNotes(): Promise<QuickNote[]> {
    return this.read();
  }

  async createNote(dto: CreateNoteDTO): Promise<QuickNote> {
    const notes = this.read();
    const newNote: QuickNote = {
      id: 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      content: dto.content.trim(),
      tags: dto.tags || [],
      audioUrl: dto.audioUrl,
      photoUrl: dto.photoUrl,
      createdAt: Date.now(),
    };

    notes.unshift(newNote);
    this.write(notes);
    return newNote;
  }

  async deleteNote(id: string): Promise<boolean> {
    const notes = this.read();
    const filtered = notes.filter(n => n.id !== id);
    if (filtered.length === notes.length) return false;
    this.write(filtered);
    return true;
  }
}

export class LocalUserStatsRepository implements IUserStatsRepository {
  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private read(): UserStats {
    try {
      const data = localStorage.getItem(STATS_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // Fallback
    }

    return {
      streakDays: 0,
      lastActiveDate: '',
      experiencePoints: 0,
      tasksCompletedTotal: 0,
      level: 1,
    };
  }

  private write(stats: UserStats): void {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  async getStats(): Promise<UserStats> {
    return this.read();
  }

  async addExperience(amount: number): Promise<UserStats> {
    const stats = this.read();
    stats.experiencePoints += amount;
    // Calculate level: 100 XP per level
    stats.level = Math.floor(stats.experiencePoints / 100) + 1;
    this.write(stats);
    return stats;
  }

  async recordDailyActivity(): Promise<UserStats> {
    const stats = this.read();
    const today = this.getTodayString();

    if (stats.lastActiveDate === today) {
      return stats;
    }

    // Check if consecutive day
    if (stats.lastActiveDate) {
      const lastDate = new Date(stats.lastActiveDate);
      const currentDate = new Date(today);
      const diffDays = Math.round((currentDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));

      if (diffDays === 1) {
        stats.streakDays += 1;
      } else if (diffDays > 1) {
        stats.streakDays = 1;
      }
    } else {
      stats.streakDays = 1;
    }

    stats.lastActiveDate = today;
    this.write(stats);
    return stats;
  }

  async incrementTaskCount(): Promise<UserStats> {
    const stats = this.read();
    stats.tasksCompletedTotal += 1;
    stats.experiencePoints += 25; // 25 XP per task completed
    stats.level = Math.floor(stats.experiencePoints / 100) + 1;
    this.write(stats);
    return stats;
  }
}
