export interface QuickNote {
  id: string;
  content: string;
  tags: string[];
  audioUrl?: string;
  photoUrl?: string;
  createdAt: number;
}

export type GraphNodeType = 'task' | 'note' | 'tag' | 'goal';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  radius: number;
  color: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface GraphLink {
  sourceId: string;
  targetId: string;
  weight: number;
}
