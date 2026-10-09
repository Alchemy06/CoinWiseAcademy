import { useState } from 'react';
import type { GFCAttemptState } from '../../../types/covidCrash';
import { formatGBP } from '../lib/format';
import { useI18n } from '../../../i18n/provider';

const ASSET_LABELS: Record<string, string> = {
  FTSE: 'FTSE 100', RBS: 'RBS', BP: 'BP', GOLD: 'Gold', GILT: 'Gilts',
};

const ASSET_COLORS: Record<string, string> = {
  FTSE: '#1E3A8A',
  RBS:  '#DC2626',
  BP:   '#16A34A',
  GOLD: '#F59E0B',
  GILT: '#6B7280',
};

interface MultiAssetOrderPanelProps {
  state: GFCAttemptState;
  assets: string[];
  currentPrices: Record<string, number>;
  isSubmitting: boolean;
  onBuy: (asset: string, amountPence: number) => void;
  onSell: (asset: string, units: number) => void;
  onEndRound: () => void;
}

export function MultiAssetOrderPanel({
  state,
  assets,
  currentPrices,
  isSubmitting,
  onBuy,
  onSell,
  onEndRound,
}: MultiAssetOrderPanelProps) {
  const { tx } = useI18n();
  const [activeAsset, setActiveAsset] = useState(assets[0] ?? 'FTSE');
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [buyInput, setBuyInput] = useState('');
  const [sellInput, setSellInput] = useState('');

  const price = currentPrices[activeAsset] ?? 0;
  const cashPence = state.cash_pence;
  const assetState = state.asset_states?.[activeAsset];
  const unitsHeld = assetState?.units_held ?? 0;

  // Buy panel
  const buyAmountPence = Math.round(parseFloat(buyInput || '0') * 100);
  const buyUnitsPreview = price > 0 ? Math.floor(buyAmountPence / price) : 0;
  const canBuy = !isSubmitting && buyAmountPence > 0 && buyAmountPence <= cashPence && buyUnitsPreview > 0 && price > 0;

  // Sell panel
  const sellUnits = parseInt(sellInput || '0', 10);
  const sellProceedsPreview = sellUnits * price;
  const canSell = !isSubmitting && sellUnits > 0 && sellUnits <= unitsHeld && price > 0;

  function fillBuyQuick(fraction: number) {
    const pence = Math.floor((cashPence * fraction) / 100) * 100;
    setBuyInput((pence / 100).toFixed(2));
  }

  function fillSellQuick(fraction: number) {
    setSellInput(Math.floor(unitsHeld * fraction).toString());
  }

  function handleBuySubmit() {
    if (!canBuy) return;
    onBuy(activeAsset, buyAmountPence);
    setBuyInput('');
  }

  function handleSellSubmit() {
    if (!canSell) return;
    onSell(activeAsset, sellUnits);
    setSellInput('');
  }

  function switchAsset(asset: string) {
    setActiveAsset(asset);
    setBuyInput('');
    setSellInput('');
    setTab('buy');
  }

  const accentColor = ASSET_COLORS[activeAsset] ?? '#3B82F6';

  function formatAssetUnits(asset: string, units: number): string {
    if (asset === "GOLD") {
      return tx("units ({amount} oz)", { amount: (units / 100).toFixed(2) });
    }
    return tx("units");
  }

  return (
    <div className="gfc-order-panel">
      {/* Asset tabs */}
      <div className="gfc-asset-tabs">
        {assets.map(asset => {
          const p = currentPrices[asset] ?? 0;
          return (
            <button
              key={asset}
              className={`gfc-asset-tab ${activeAsset === asset ? 'is-active' : ''}`}
              style={activeAsset === asset ? { borderBottomColor: ASSET_COLORS[asset] } : {}}
              onClick={() => switchAsset(asset)}
              type="button"
            >
              <span className="gfc-asset-tab-ticker">{asset}</span>
              <span className="gfc-asset-tab-price">{formatGBP(p)}</span>
            </button>
          );
        })}
      </div>

      {/* Buy/Sell sub-tabs */}
      <div className="gfc-order-subtabs">
        <button
          className={`gfc-order-subtab ${tab === 'buy' ? 'is-active-buy' : ''}`}
          onClick={() => setTab('buy')}
          type="button"
        >{tx("BUY")}</button>
        <button
          className={`gfc-order-subtab ${tab === 'sell' ? 'is-active-sell' : ''}`}
          onClick={() => setTab('sell')}
          disabled={unitsHeld === 0}
          type="button"
        >{tx("SELL")}</button>
      </div>

      {/* Active panel */}
      <div className="gfc-order-body">
        {tab === 'buy' ? (
          <div className="gfc-order-form">
            <div className="gfc-order-avail">
              <span>{tx("Cash available")}</span>
              <span>{formatGBP(cashPence)}</span>
            </div>
            <div className="gfc-order-input-wrap">
              <span className="gfc-order-currency">£</span>
              <input
                className="gfc-order-input"
                type="number"
                min="0"
                step="1"
                placeholder="0.00"
                value={buyInput}
                onChange={e => setBuyInput(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="gfc-order-pills">
              {[25, 50, 75, 100].map(pct => (
                <button key={pct} className="gfc-order-pill" onClick={() => fillBuyQuick(pct)} disabled={isSubmitting} type="button">
                  {pct}%
                </button>
              ))}
            </div>
            {buyAmountPence > 0 && price > 0 && (
              <p className="gfc-order-preview">
                ≈ <strong>{buyUnitsPreview}</strong> {formatAssetUnits(activeAsset, buyUnitsPreview)} {tx("at")} {formatGBP(price)}
              </p>
            )}
            <button
              className="gfc-order-submit gfc-order-submit--buy"
              onClick={handleBuySubmit}
              disabled={!canBuy}
              type="button"
              style={canBuy ? { background: accentColor } : {}}
            >
              {isSubmitting ? tx("Placing…") : tx("Buy {asset}", { asset: tx(ASSET_LABELS[activeAsset] ?? activeAsset) })}
            </button>
            {buyAmountPence > cashPence && buyAmountPence > 0 && (
              <p className="gfc-order-error">{tx("Insufficient cash")}</p>
            )}
          </div>
        ) : (
          <div className="gfc-order-form">
            <div className="gfc-order-avail">
              <span>{tx("You hold")}</span>
              <span>{unitsHeld} {formatAssetUnits(activeAsset, unitsHeld)}</span>
            </div>
            <div className="gfc-order-input-wrap">
              <input
                className="gfc-order-input"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={sellInput}
                onChange={e => setSellInput(e.target.value)}
                disabled={isSubmitting}
              />
              <span className="gfc-order-unit-label">{tx("units")}</span>
            </div>
            <div className="gfc-order-pills">
              {[0.25, 0.5, 0.75, 1].map((frac, i) => (
                <button key={i} className="gfc-order-pill" onClick={() => fillSellQuick(frac)} disabled={isSubmitting} type="button">
                  {frac === 1 ? tx("All") : `${frac * 100}%`}
                </button>
              ))}
            </div>
            {sellUnits > 0 && price > 0 && (
              <p className="gfc-order-preview">
                → <strong>{formatGBP(sellProceedsPreview)}</strong>
              </p>
            )}
            <button
              className="gfc-order-submit gfc-order-submit--sell"
              onClick={handleSellSubmit}
              disabled={!canSell}
              type="button"
            >
              {isSubmitting ? tx("Placing…") : tx("Sell {asset}", { asset: tx(ASSET_LABELS[activeAsset] ?? activeAsset) })}
            </button>
            {sellUnits > unitsHeld && sellUnits > 0 && (
              <p className="gfc-order-error">{tx("Only hold {count}", { count: unitsHeld })}</p>
            )}
          </div>
        )}
      </div>

      {/* End round button */}
      <div className="gfc-end-round-wrap">
        <button
          className="gfc-end-round-btn"
          onClick={onEndRound}
          disabled={isSubmitting}
          type="button"
        >
          {tx("End round early →")}
        </button>
      </div>
    </div>
  );
}
