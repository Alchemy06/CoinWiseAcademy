import type { GFCAttemptState } from '../../../types/covidCrash';
import { formatGBP } from '../lib/format';
import { useI18n } from '../../../i18n/provider';

const ASSET_LABELS: Record<string, string> = {
  FTSE: 'FTSE 100',
  RBS:  'RBS',
  BP:   'BP plc',
  GOLD: 'Gold',
  GILT: 'UK Gilts',
};

// ASSET_LABELS is used for future extensibility
void ASSET_LABELS;

interface MultiAssetPortfolioPanelProps {
  state: GFCAttemptState;
  assets: string[];
}

export function MultiAssetPortfolioPanel({ state, assets }: MultiAssetPortfolioPanelProps) {
  const { tx } = useI18n();
  const { cash_pence, total_value_pence, total_delta_pence, concentration_pct, risk_category } = state;
  const isUp = total_delta_pence >= 0;

  function formatUnits(asset: string, units: number): string {
    if (units === 0) return '—';
    if (asset === 'GOLD') return tx("{amount} oz", { amount: (units / 100).toFixed(2) });
    if (asset === 'GILT') return tx("{units} × £100", { units });
    if (asset === 'FTSE') return tx("{units} units", { units });
    return tx("{units} shares", { units });
  }

  return (
    <div className="gfc-portfolio-panel">
      <p className="gfc-portfolio-title">{tx("PORTFOLIO")}</p>

      {/* Cash */}
      <div className="gfc-portfolio-row gfc-portfolio-row--cash">
        <span className="gfc-portfolio-label">{tx("Cash")}</span>
        <span className="gfc-portfolio-value">{formatGBP(cash_pence)}</span>
      </div>

      <div className="gfc-portfolio-divider" />

      {/* Asset rows */}
      {assets.map(asset => {
        const assetState = state.asset_states?.[asset];
        const units = assetState?.units_held ?? 0;
        const value = assetState?.position_value_pence ?? 0;
        const pnl = assetState?.unrealised_pnl_pence ?? 0;
        return (
          <div key={asset} className={`gfc-portfolio-row ${units > 0 ? 'is-held' : 'is-empty'}`}>
            <div className="gfc-portfolio-asset-meta">
              <span className="gfc-portfolio-asset-ticker">{asset}</span>
              <span className="gfc-portfolio-asset-units">{formatUnits(asset, units)}</span>
            </div>
            <div className="gfc-portfolio-asset-values">
              <span className="gfc-portfolio-value">{value > 0 ? formatGBP(value) : '—'}</span>
              {value > 0 && pnl !== 0 && (
                <span className={`gfc-portfolio-pnl ${pnl >= 0 ? 'is-up' : 'is-down'}`}>
                  {pnl >= 0 ? '+' : ''}{formatGBP(pnl)}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div className="gfc-portfolio-divider" />

      {/* Total */}
      <div className="gfc-portfolio-row gfc-portfolio-row--total">
        <span className="gfc-portfolio-label">{tx("Total value")}</span>
        <span className="gfc-portfolio-value gfc-portfolio-value--total">{formatGBP(total_value_pence)}</span>
      </div>
      <div className="gfc-portfolio-row">
        <span className="gfc-portfolio-label">{tx("Δ from start")}</span>
        <span className={`gfc-portfolio-delta ${isUp ? 'is-up' : 'is-down'}`}>
          {isUp ? '+' : ''}{formatGBP(total_delta_pence)}
        </span>
      </div>

      <div className="gfc-portfolio-divider" />

      {/* Concentration */}
      <div className="gfc-concentration">
        <div className="gfc-concentration-header">
          <span className="gfc-concentration-label">{tx("Concentration")}</span>
          <span className={`gfc-concentration-risk gfc-concentration-risk--${risk_category.toLowerCase()}`}>
            {tx("{risk} RISK", { risk: tx(risk_category) })}
          </span>
        </div>
        <div className="gfc-concentration-bar-track">
          <div
            className={`gfc-concentration-bar gfc-concentration-bar--${risk_category.toLowerCase()}`}
            style={{ width: `${concentration_pct}%` }}
          />
        </div>
        <span className="gfc-concentration-pct">{tx("{pct}% in largest position", { pct: concentration_pct })}</span>
      </div>
    </div>
  );
}
