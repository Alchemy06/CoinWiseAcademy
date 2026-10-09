/**
 * COVID Crash — Format helpers
 *
 * These are the ONLY functions that convert between pence/pounds in the frontend.
 * Every other component treats pence and satoshis as opaque integers passed straight
 * through from the API. No money arithmetic is permitted anywhere else.
 */

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format an integer pence value as a GBP currency string. e.g. 123456 → "£1,234.56" */
export const formatGBP = (pence: number): string => gbpFormatter.format(pence / 100);

/** Format satoshis as a BTC string. e.g. 100000000 → "1.000000 BTC" */
export const formatBTC = (satoshis: number): string =>
  `${(satoshis / 100_000_000).toFixed(6)} BTC`;

/**
 * Format a "satoshi-equivalent" quantity for any asset.
 * For BTC: formatAsset(100_000_000, 'BTC') → "1.000000 BTC"
 * For LUNA: formatAsset(9_122_000_000, 'LUNA') → "91.220000 LUNA"
 */
export const formatAsset = (satoshis: number, symbol: string): string =>
  `${(satoshis / 100_000_000).toFixed(6)} ${symbol}`;

/** Format basis points as a percentage. e.g. 1234 → "12.34%" */
export const formatPercent = (basisPts: number): string =>
  `${(basisPts / 100).toFixed(2)}%`;

/**
 * Parse a user's text input (e.g. "2,500.00" or "2500") into integer pence.
 * Strips non-numeric chars except the decimal point.
 */
export const parseInputToPence = (input: string): number => {
  const cleaned = input.replace(/[^\d.]/g, '');
  if (!cleaned) return 0;
  const parts = cleaned.split('.');
  const whole = parseInt(parts[0] || '0', 10);
  const decimal = parts[1] ? parts[1].slice(0, 2).padEnd(2, '0') : '00';
  return whole * 100 + parseInt(decimal, 10);
};

/**
 * Parse a BTC amount string (e.g. "0.157739") into integer satoshis.
 */
export const parseBTCInputToSatoshis = (input: string): number => {
  const value = parseFloat(input);
  if (isNaN(value) || value < 0) return 0;
  return Math.round(value * 100_000_000);
};

/** Sign-prefixed GBP string for deltas. e.g. 5000 → "+£50.00", -5000 → "-£50.00" */
export const formatGBPDelta = (pence: number): string => {
  const sign = pence >= 0 ? '+' : '-';
  return sign + gbpFormatter.format(Math.abs(pence) / 100);
};

/** Sign-prefixed percentage from basis points. e.g. 168_00 → "+168.00%" */
export const formatPercentDelta = (basisPts: number): string => {
  const sign = basisPts >= 0 ? '+' : '';
  return `${sign}${(basisPts / 100).toFixed(2)}%`;
};
