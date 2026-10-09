// COVID Crash — TypeScript types
// All money values are integer pence / integer satoshis.
// No float arithmetic. Use lib/format.ts for display strings.

export interface CrashScenario {
  id: number;
  title: string;
  subtitle: string;
  historical_period: string;
  lesson_tag: string;
  accent_color: string;
  starting_balance_pence: number;
  order: number;
  asset_symbol: string;
  asset_name: string;
  chart_log_scale: boolean;
  /** True for Scenario 3 (FTX). Drives the custody-split mechanic in the UI. */
  uses_custody_split: boolean;
  /** True for Scenario 4 (GameStop). Drives broker/margin/WSB mechanic. */
  uses_broker_mechanics: boolean;
  /** 'satoshis' for S1–S3; 'shares' for S4 (integer share counts). */
  asset_unit: 'satoshis' | 'shares';
  /** Human-readable label: 'BTC' for S1–S3, 'shares' for S4. */
  asset_unit_label: string;
  recommended_prerequisite_id: number | null;
  /** True for Scenario 5 (GFC). Drives multi-asset trading. */
  is_multi_asset: boolean;
  /** e.g. ['FTSE', 'RBS', 'BP', 'GOLD', 'GILT'] — empty for S1–S4. */
  available_assets: string[];
}

export interface CrashCandle {
  date: string; // "YYYY-MM-DD"
  o: number;    // pence
  h: number;
  l: number;
  c: number;
}

export interface CrashRound {
  round_index: number;
  scenario_date: string; // "YYYY-MM-DD"
  price_pence: number;
  context_paragraph: string;
  structural_signal_text: string; // empty string when no banner
  /** S4 only: r/wallstreetbets sentiment text for this round. Empty for S1–S3. */
  wsb_feed_text: string;
  candles: CrashCandle[];
  /** S5: closing price per asset { FTSE: int, RBS: int, ... } */
  asset_closing_prices: Record<string, number>;
  /** S5: live tick data (45 entries, one per 2s). Empty for S1–S4. */
  intraday_ticks: GFCTick[];
  /** S5: news flash events. Empty for S1–S4. */
  news_flashes: GFCNewsFlash[];
}

/** S5 intraday tick — one entry every 2 seconds for 90 seconds. */
export interface GFCTick {
  offset_seconds: number;
  FTSE?: number;
  RBS?: number;
  BP?: number;
  GOLD?: number;
  GILT?: number;
  [asset: string]: number | undefined;
}

/** S5 news flash that interrupts mid-round. */
export interface GFCNewsFlash {
  trigger_offset_seconds: number;
  headline: string;
  body: string;
}

/** S5 multi-asset candle — one OHLC dict per asset per day. */
export interface GFCMultiCandle {
  date: string;
  FTSE?: { o: number; h: number; l: number; c: number };
  RBS?: { o: number; h: number; l: number; c: number };
  BP?: { o: number; h: number; l: number; c: number };
  GOLD?: { o: number; h: number; l: number; c: number };
  GILT?: { o: number; h: number; l: number; c: number };
  [asset: string]: { o: number; h: number; l: number; c: number } | string | undefined;
}

export interface GFCAssetState {
  units_held: number;
  current_price_pence: number;
  position_value_pence: number;
  avg_entry_price_pence: number;
  cost_basis_pence: number;
  unrealised_pnl_pence: number;
}

export interface GFCAttemptState {
  starting_balance_pence: number;
  cash_pence: number;
  total_position_value_pence: number;
  total_value_pence: number;
  total_delta_pence: number;
  total_delta_basis_pts: number;
  asset_states: Record<string, GFCAssetState>;
  concentration_pct: number;
  risk_category: 'HIGH' | 'MODERATE' | 'LOW';
}

/** Output of derive_attempt_state on the backend — all integers, all pence / satoshis. */
export interface CrashAttemptState {
  starting_balance_pence: number;
  cash_pence: number;
  /** S4: clean name for shares (equals btc_in_self_custody_satoshis for S4). */
  asset_units_held: number;
  /** Backwards-compat: total BTC across both custody locations (0 for S4). */
  btc_held_satoshis: number;
  /** S3 only: BTC held on FTX (0 for S1/S2/S4). */
  btc_on_ftx_satoshis: number;
  /** S3: BTC in self-custody. S4: integer share count (repurposed). */
  btc_in_self_custody_satoshis: number;
  /** S3 only: value of FTX-held BTC; 0 once bankruptcy triggered. */
  ftx_position_value_pence: number;
  /** S3 only: value of self-custody BTC. */
  self_custody_position_value_pence: number;
  /** True from Round 3 onward in S3: FTX withdrawals locked. */
  ftx_withdrawals_halted: boolean;
  /** True from Round 4 onward in S3: FTX is bankrupt, FTX BTC value is 0. */
  ftx_bankruptcy_triggered: boolean;
  current_price_pence: number;
  position_value_pence: number;
  /** True when the user holds tokens but the position rounds to 0 pence at current price. */
  position_value_is_dust: boolean;
  total_value_pence: number;
  /** S4: net equity = cash + position - margin_borrowed. Equals total_value for S1–S3. */
  net_equity_pence: number;
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
  // S4 broker/margin fields (undefined for S1–S3)
  broker_choice?: 'trading_forge' | 'highford_latham' | '';
  broker_pco_active?: boolean;
  margin_borrowed_pence?: number;
  margin_call_imminent?: boolean;
  margin_called_at_round?: number | null;
  total_commissions_paid_pence?: number;
}

export type CrashActionType =
  | 'buy'
  | 'buy_margin'        // S4: margin-funded buy
  | 'sell'              // FTX sell (S3), standard sell (S1/S2), stock sell (S4)
  | 'sell_self'         // self-custody sell (S3 only)
  | 'move_to_cold'      // FTX → self-custody (S3 only)
  | 'move_to_ftx'       // self-custody → FTX (S3 only)
  | 'ftx_yield'         // synthetic: yield credited to FTX balance
  | 'ftx_loss'          // synthetic: BTC wiped at bankruptcy (negative satoshis)
  | 'broker_select'     // synthetic: broker choice recorded (S4)
  | 'commission_paid'   // synthetic: Highford & Latham commission (S4)
  | 'margin_interest'   // synthetic: interest charged on borrowed amount (S4)
  | 'margin_call_liquidation' // synthetic: forced sell to cover margin (S4)
  | 'pco_imposed';      // synthetic: Trading Forge PCO restriction applied (S4)

export interface CrashActionLogEntry {
  round_index: number;
  scenario_date: string;
  action: CrashActionType;
  amount_pence: number;
  /** For S4: integer share count (repurposed field). */
  btc_quantity_satoshis: number;
  price_pence: number;
  submitted_at: string;
  /** 'ftx' | 'self_custody' — present on buy entries in S3. */
  location?: string;
  /** 'ftx' | 'self_custody' — present on sell entries in S3. */
  source?: string;
  /** True for synthetic entries (yield, loss, margin). */
  is_synthetic?: boolean;
  /** Narrative note for ftx_loss entries. */
  note?: string;
  /** S4 broker select: broker name. */
  broker?: string;
  /** S4 margin buy: how much cash was used. */
  cash_used_pence?: number;
  /** S4 margin buy: how much was borrowed. */
  margin_used_pence?: number;
  /** S4 sell: commission charged. */
  commission_pence?: number;
  /** S4 margin call liquidation details. */
  shares_liquidated?: number;
  margin_repaid_pence?: number;
  leftover_pence?: number;
}

export interface CrashNarrative {
  pattern_key: string;
  headline: string;
  body: string;
  takeaway: string;
}

/** Reference outcomes — keys differ between scenarios. */
export interface CrashReferenceOutcomes {
  all_cash_pence: number;
  // COVID Crash (Scenario 1)
  bought_round_1_pence?: number;
  bought_round_2_pence?: number;
  // Luna Collapse (Scenario 2)
  held_to_end_pence?: number;
  sold_at_signal_pence?: number;
  // FTX Collapse (Scenario 3)
  self_custody_held_pence?: number;
  ftx_never_moved_pence?: number;
  moved_at_signal_pence?: number;
  // GameStop Short Squeeze (Scenario 4)
  bought_r0_held_pence?: number;
  bought_r0_sold_peak_pence?: number;
  bought_peak_held_pence?: number;
  margin_call_pence?: number;
  // GFC (Scenario 5)
  all_ftse_pence?: number;
  all_gold_pence?: number;
  all_rbs_pence?: number;
  optimal_pence?: number;
}

export interface CrashFinalSnapshot {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  final_state: CrashAttemptState | GFCAttemptState | any;
  pattern_key: string;
  narrative: CrashNarrative | null;
  reference_outcomes: CrashReferenceOutcomes;
  end_price_pence: number;
}

export interface GFCBuyResult {
  asset: string;
  units_acquired: number;
  amount_pence: number;
  price_pence: number;
  cash_remaining_pence: number;
}

export interface GFCSellResult {
  asset: string;
  units_sold: number;
  proceeds_pence: number;
  price_pence: number;
  cash_remaining_pence: number;
}

export interface CrashAttempt {
  id: number;
  scenario: CrashScenario;
  started_at: string;
  completed_at: string | null;
  is_complete: boolean;
  current_round_index: number;
  action_log: CrashActionLogEntry[];
  state: CrashAttemptState;
  current_round: CrashRound | null;
  all_candles: CrashCandle[];
  final_state_snapshot: CrashFinalSnapshot | null;
}

export interface CrashTradeResult {
  amount_pence: number;
  /** S4: integer shares. S1–S3: satoshis. */
  btc_quantity_satoshis: number;
  price_pence: number;
  action: CrashActionType;
  location?: string;
  source?: string;
  // S4 additional fields
  shares_bought?: number;
  shares_sold?: number;
  cash_used_pence?: number;
  margin_used_pence?: number;
  commission_pence?: number;
  proceeds_pence?: number;
}

export interface CrashTradeResponse {
  trade: CrashTradeResult;
  attempt: CrashAttempt;
}

export interface CrashMoveResult {
  action: 'move_to_cold' | 'move_to_ftx';
  btc_moved_satoshis: number;
  fee_pence: number;
  direction: 'to_self_custody' | 'to_ftx';
}

export interface CrashMoveResponse {
  move: CrashMoveResult;
  attempt: CrashAttempt;
}

/** Response from POST /select-broker/ (Scenario 4 only). */
export interface CrashBrokerSelectResponse {
  broker_choice: 'trading_forge' | 'highford_latham';
  attempt: CrashAttempt;
}

/** Details of a margin call liquidation event. */
export interface MarginCallDetails {
  shares_liquidated: number;
  liquidation_price_pence: number;
  proceeds_pence: number;
  margin_repaid_pence: number;
  leftover_pence: number;
}

/**
 * Response from POST /advance/ — wraps the updated attempt plus lifecycle
 * event flags that the frontend uses to show modals / notifications.
 * S3 FTX fields are null/false/0 for S1/S2/S4.
 * S4 broker fields are false/0/null for S1/S2/S3.
 */
export interface CrashAdvanceResponse {
  attempt: CrashAttempt;
  // S3 FTX event flags
  /** Satoshis of yield credited just before this advance. Null if none. */
  ftx_yield_earned_satoshis: number | null;
  /** True if FTX withdrawals were just halted (entering round 3). */
  ftx_withdrawals_just_halted: boolean;
  /** True if FTX just filed for bankruptcy (entering round 4). */
  ftx_just_went_bankrupt: boolean;
  /** How many satoshis were wiped in the bankruptcy (0 if moved to cold). */
  btc_lost_in_bankruptcy_satoshis: number;
  // S4 broker/margin event flags
  /** True if Trading Forge just imposed PCO entering Round 3. */
  pco_just_imposed: boolean;
  /** Pence of margin interest charged at this advance (0 if none). */
  margin_interest_charged_pence: number;
  /** True if a margin call was triggered at the new round's price. */
  margin_call_triggered: boolean;
  /** Details of the margin call liquidation; null if no margin call. */
  margin_call_details: MarginCallDetails | null;
}
