import { getStoredLocale } from "../i18n/config";
import { API_BASE_URL } from "./api";

export interface LevelBreakdown {
  attempted: number;
  passed: number;
}

export interface RecentAttempt {
  quizTitle: string;
  score: number;
  passMark: number;
  passed: boolean;
  completedAt: string;
  level: string;
}

export interface DashboardData {
  quizzesAttempted: number;
  quizzesPassed: number;
  averageScore: number;
  totalQuestionsAnswered: number;
  correctAnswers: number;
  accuracyPercent: number;
  lessonsCompleted: number;
  levelBreakdown: {
    beginner: LevelBreakdown;
    intermediate: LevelBreakdown;
    advanced: LevelBreakdown;
  };
  recentAttempts: RecentAttempt[];
}

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch(`${API_BASE_URL}/api/me/dashboard/`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Accept-Language": getStoredLocale()
    }
  });

  if (!response.ok) {
    throw new Error("Unable to load dashboard data.");
  }

  return response.json() as Promise<DashboardData>;
}
