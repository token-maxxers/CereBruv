import type { Task } from '../../types/task';

export interface IAIService {
  analyzeWorkload(tasks: Task[]): Promise<string>;
}
