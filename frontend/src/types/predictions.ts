export type PredictionAsset = "BTC" | "ETH";
export type PredictionDirection = "up" | "down";
export type PredictionStatus = "pending" | "resolved";
export type PredictionResult = "correct" | "incorrect";
export type ActualDirection = "up" | "down" | "flat";
export type CalibrationLabel =
  | "cautious"
  | "developing"
  | "well_calibrated"
  | "overconfident"
  | "insufficient_data";

export interface Prediction {
  id: number;
  asset: PredictionAsset;
  direction: PredictionDirection;
  timeframe_minutes: number;
  timeframe_label: string;
  confidence: number | null;
  entry_price: string;
  exit_price: string | null;
  source_currency: string;
  entry_timestamp: string;
  resolve_at: string;
  resolved_at: string | null;
  actual_direction: ActualDirection | null;
  price_change_percent: string | null;
  result: PredictionResult | null;
  status: PredictionStatus;
  reflection_text: string;
  calibration_label: CalibrationLabel | null;
  created_at: string;
}

export type CalibrationScoreLabel =
  | "Overconfident"
  | "Learning"
  | "Calibrating"
  | "Well Calibrated"
  | "Highly Calibrated";

export interface PredictionStats {
  total: number;
  resolved: number;
  correct: number;
  accuracy: number;
  average_confidence: number | null;
  calibration_label: CalibrationLabel;
  calibration_score: number;
  calibration_score_label: CalibrationScoreLabel;
}

export interface PredictionsResponse {
  pending: Prediction[];
  resolved: Prediction[];
  stats: PredictionStats;
}

export interface CreatePredictionPayload {
  asset: PredictionAsset;
  direction: PredictionDirection;
  timeframe_minutes: number;
  confidence: number;
}

export const TIMEFRAME_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 5, label: "5 min" },
  { minutes: 10, label: "10 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 1440, label: "1 day" },
  { minutes: 10080, label: "1 week" },
];

export const CALIBRATION_LABELS: Record<CalibrationLabel, string> = {
  cautious: "Cautious",
  developing: "Developing",
  well_calibrated: "Well Calibrated",
  overconfident: "Overconfident",
  insufficient_data: "Not enough data yet",
};
