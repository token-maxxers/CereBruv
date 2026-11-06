import type { SavedLink, Task } from '../../types/task';

export interface CreateTaskDTO {
  title: string;
  category: Task['category'];
  date?: string; // YYYY-MM-DD or "" when undated
  startTime: string; // HH:mm or "" when untimed
  durationMinutes: number; // 0 when no duration specified
  urgency: Task['urgency'];
  notes?: string;
  photoUrl?: string;
  links?: SavedLink[];
}

export interface ITaskRepository {
  /**
   * Retrieves all user tasks.
   */
  getAllTasks(): Promise<Task[]>;

  /**
   * Retrieves a single task by ID.
   */
  getTaskById(id: string): Promise<Task | null>;

  /**
   * Creates and stores a new task.
   */
  createTask(dto: CreateTaskDTO): Promise<Task>;

  /**
   * Updates an existing task with partial fields.
   */
  updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task>;

  /**
   * Toggles task completed status.
   */
  toggleTaskCompletion(id: string): Promise<Task>;

  /**
   * Deletes a task by ID.
   */
  deleteTask(id: string): Promise<boolean>;

  /**
   * Clears all tasks.
   */
  clearAllTasks(): Promise<void>;
}
