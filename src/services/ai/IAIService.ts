import type { Task } from '../../types/task';

export interface IAIService {
  analyzeWorkload(tasks: Task[]): Promise<string>;
  extractTasksFromImage(imageBlob: Blob): Promise<Partial<Task>[]>;
}
