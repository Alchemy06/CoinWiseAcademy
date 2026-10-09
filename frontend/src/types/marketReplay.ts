// ── Market Replay types ────────────────────────────────────────────────────────

export interface ReplayScenario {
  id: number;
  title: string;
  subtitle: string;
  asset_symbol: string;
  asset_name: string;
  historical_start_date: string;
  historical_end_date: string;
  accent_color: string;
  lesson_tag: string;
  difficulty: string;
  real_event_reference: string;
  order: number;
}

/**
 * Hourly OHLC candle — pence values.
 * date is an ISO 8601 UTC datetime string, e.g. "2020-03-12T14:00:00Z".
 * The synthetic fill engine uses these as anchor points to generate
 * 60 minute-level candles between each pair of hourly anchors.
 *
 * om / cm (open_micropence / close_micropence) are only present for assets
 * whose price can fall below £0.01 (e.g. LUNA during its May 2022 collapse).
 * Value represents price × 10,000, giving £0.0001 precision.
 */
export interface ReplayCandle {
  date: string; // ISO 8601 UTC datetime "2020-03-12T14:00:00Z"
  o: number;    // open_pence
  h: number;    // high_pence
  l: number;    // low_pence
  c: number;    // close_pence
  v: number;    // volume (asset satoshis)
  om?: number;  // open_micropence  (price × 10000, only present when sub-penny)
  cm?: number;  // close_micropence (price × 10000, only present when sub-penny)
}

export type NewsImpact = "low" | "medium" | "high" | "critical";

export interface ReplayNewsEvent {
  id: number;
  date: string;
  headline: string;
  body: string;
  impact: NewsImpact;
  btc_context: string;
}

export interface ReplayAttemptState {
  starting_balance_pence: number;
  cash_pence: number;
  btc_held_satoshis: number;
  current_price_pence: number;
  position_value_pence: number;
  total_value_pence: number;
  total_delta_pence: number;
  total_delta_basis_pts: number;
  avg_entry_price_pence: number;
  cost_basis_pence: number;
  unrealised_pnl_pence: number;
  unrealised_pnl_basis_pts: number;
  total_bought_pence: number;
  total_bought_sats: number;
  total_sold_sats: number;
  remaining_sats: number;
}

export interface ReplayActionLogEntry {
  action: "buy" | "sell";
  amount_pence: number;
  btc_quantity_satoshis: number;
  price_pence: number;
  /** ISO 8601 UTC datetime string "2020-03-12T14:05:00Z" */
  simulated_date: string;
}

/** Full attempt payload — returned by start, state, buy, and sell endpoints. */
export interface ReplayAttemptPayload {
  attempt_id: number;
  scenario: ReplayScenario;
  attempt_date: string;
  started_at: string;
  is_complete: boolean;
  action_log: ReplayActionLogEntry[];
  state: ReplayAttemptState;
  /** Hourly candles — all revealed (initial load) or new only (incremental poll). */
  candles: ReplayCandle[];
  news_events: ReplayNewsEvent[];
  current_price_pence: number;
  /** ISO 8601 UTC datetime of the current simulated position, e.g. "2020-03-12T14:00:00Z" */
  simulated_datetime: string;
  progress_fraction: number;
  seconds_remaining: number;
  is_complete_for_today: boolean;
  /** Non-null if a notable news event was revealed in the last ~60 real seconds. */
  latest_news_flash: ReplayNewsEvent | null;
}

export interface ReplayTradeResponse {
  state: ReplayAttemptState;
  current_price_pence: number;
}
