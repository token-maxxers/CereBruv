import type { UserStats } from '../../types/user';

export interface IUserStatsRepository {
  getStats(): Promise<UserStats>;
  addExperience(amount: number): Promise<UserStats>;
  recordDailyActivity(): Promise<UserStats>;
  incrementTaskCount(): Promise<UserStats>;
}
