// Learn stages mirror the quiz path levels so the UI can share ordering and labeling rules across both surfaces.
export type LearnLevel = "beginner" | "intermediate" | "advanced";

export interface LearnUnit {
  // One published catalog unit contains both the reading content and the optional linked quiz identifier.
  externalId: string;
  title: string;
  level: LearnLevel;
  orderIndex: number;
  excerpt: string;
  estimatedMinutes: number | null;
  bodyMarkdown: string;
  sourcePath?: string;
  sourceRepo?: string;
  quizExternalId?: string;
}

export interface LearnTrack {
  // Tracks keep lessons grouped for the hub while still preserving a stable global stage/order sequence.
  externalId: string;
  title: string;
  level: LearnLevel;
  orderIndex: number;
  units: LearnUnit[];
}

export interface LearnCatalogResponse {
  // The public catalog endpoint exposes only track/unit data needed to render the learn experience.
  tracks: LearnTrack[];
}

export interface LearnProgressResponse {
  // Progress is tracked only as completed unit ids so the client can stay stateless about completion timestamps.
  completedUnitExternalIds: string[];
}

export interface LearnCompletionResponse {
  // Completion responses echo the stored unit id and timestamp so optimistic UI can reconcile against the server record.
  unitExternalId: string;
  completedAt: string;
}
