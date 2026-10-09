import { LearnModule } from "../components/learn/LearnModule";

export function LearnPage() {
  // Keep the route wrapper thin so learn page tests can focus on the module behavior directly.
  return <LearnModule />;
}
