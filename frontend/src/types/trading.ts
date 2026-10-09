export type ScenarioDifficulty = "beginner" | "intermediate" | "advanced";
export type NodeType = "start" | "decision" | "consequence" | "terminal";
export type OutcomeTone = "positive" | "negative" | "neutral";

export interface TradingScenario {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  historical_date: string;
  lesson_tag: string;
  lesson_number: number;
  difficulty: ScenarioDifficulty;
  accent_color: string;
  volatility_profile: string;
  order: number;
  currency: string;
  default_initial_balance: string;
}

export interface ScenarioChoice {
  id: number;
  label: string;
  emotional_framing: string;
  next_node_id: string | null;
  tooltip: string;
  sort_order: number;
  is_optimal: boolean;
  action_type: string;
  // Note: balance_effect is NOT sent before the choice is made — the frontend
  // derives the P&L delta from the balance difference returned in the attempt.
}

export interface ScenarioNode {
  id: number;
  node_id: string;
  node_type: NodeType;
  round_number: number;
  narrative_text: string;
  news_ticker_text: string;
  market_sentiment: string;
  sentiment_position: number;
  historical_price_data: number[];
  market_context: Record<string, unknown>;
  balance_effect: string;
  balance_effect_label: string;
  lesson_title: string;
  lesson_text: string;
  takeaway_line: string;
  outcome_tone: OutcomeTone;
  choices: ScenarioChoice[];
}

export interface ChoiceRecord {
  from_node_id: string;
  choice_id: number;
  choice_label: string;
  consequence_headline: string;
  /** Feedback text — pre-interpolated server-side; no {amount}/{remainder} placeholders. */
  feedback_text: string;
  to_node_id: string | null;
  action_type: string;
  // Legacy balance-effect fields (kept for backward compat with _compute_balance)
  /** @deprecated use pence fields below */
  amount_entered: string | null;
  /** @deprecated use pence fields below */
  choice_balance_effect: string;
  choice_balance_effect_label: string;
  // Pence-model snapshot — set by server at time of choice
  /** GBP amount committed to this trade, in pence (null for non-trade choices). */
  amount_committed_pence: number | null;
  /** BTC price at which the trade executed, in pence. */
  price_pence: number | null;
  /** BTC received from a buy (satoshis). */
  btc_received_satoshis: number | null;
  /** BTC sold in a sell (satoshis). */
  btc_sold_satoshis: number | null;
  /** Cash remaining in wallet after this choice, in pence. */
  cash_remaining_pence: number;
  /** BTC held after this choice, in satoshis. */
  btc_held_satoshis_after: number;
  /** BTC position value after this choice, in pence. */
  position_value_pence: number;
  /** Total portfolio value (cash + BTC) after this choice, in pence. */
  total_value_pence: number;
  /** Portfolio delta from starting balance, in pence. */
  total_delta_pence: number;
}

export interface TradingAttempt {
  id: number;
  scenario_slug: string;
  scenario_title: string;
  /** ISO 4217 code, e.g. "GBP" or "USD" */
  scenario_currency: string;
  /** Maximum round_number across all nodes in this scenario. */
  total_rounds: number;
  started_at: string;
  completed_at: string | null;
  initial_balance: string;
  final_balance: string | null;
  choices_made: ChoiceRecord[];
  current_node: ScenarioNode | null;
  /** Current portfolio value in GBP (string decimal). Derived from pence model. */
  current_balance: string;
  // Pence-model truth fields
  /** Starting wallet, in pence (e.g. 1000000 = £10,000). */
  starting_balance_pence: number;
  /** Cash currently held, in pence. */
  cash_pence: number;
  /** BTC held, in satoshis. */
  btc_held_satoshis: number;
}

export interface UserTradingProfile {
  id: number;
  username: string;
  display_name: string;
  total_pnl: string;
  scenarios_completed: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  display_name: string;
  total_pnl: string;
  scenarios_completed: number;
}
