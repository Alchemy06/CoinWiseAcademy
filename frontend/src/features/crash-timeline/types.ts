export interface CrashStage {
  number: number;
  title: string;
  dateRange: string;
  narrative: string;
  timestamp: { date: string; context: string };
  isClimax: boolean;
}

export interface ConsequenceScenario {
  label: string;
  value: string;
  type: "red" | "green" | "neutral";
  caption?: string;
}

export interface RuleEntry {
  number: number;
  bold: string;
  text: string;
}

export interface CrashScenario {
  id: string;
  number: number;
  navLabel: string;
  title: string;
  subtitle: string;
  asset: string;
  dateRangeLabel: string;
  openingQuote: string;
  dropPercent: string;
  priceRange: string;
  timeframe: string;
  recoveryPill: { text: string; type: "green" | "red" } | null;
  stages: CrashStage[];
  whatWentWrong: string;
  whenToSell: string;
  consequences: {
    scenarios: ConsequenceScenario[];
    summary: string;
  };
  whatToDoRight: RuleEntry[];
  tradingFloorScenarioId?: string;
  marketReplayScenarioId?: string;
}
