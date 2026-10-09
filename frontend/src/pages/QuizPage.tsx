import { QuizModule } from "../components/quiz/QuizModule";

export function QuizPage() {
  // Keep the route wrapper thin so page tests can target the module behavior directly.
  return <QuizModule />;
}
