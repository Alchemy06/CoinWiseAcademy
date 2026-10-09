import type { GFCNewsFlash } from '../../../types/covidCrash';
import { useI18n } from '../../../i18n/provider';

interface GFCNewsFlashModalProps {
  flash: GFCNewsFlash;
  onDismiss: () => void;
}

export function GFCNewsFlashModal({ flash, onDismiss }: GFCNewsFlashModalProps) {
  const { tx } = useI18n();
  return (
    <div className="gfc-news-backdrop" role="dialog" aria-modal="true">
      <div className="gfc-news-modal">
        <div className="gfc-news-header">
          <span className="gfc-news-alert-icon" aria-hidden="true">⚠</span>
          <span className="gfc-news-alert-label">{tx("BREAKING NEWS")}</span>
        </div>
        <h2 className="gfc-news-headline">{tx(flash.headline)}</h2>
        <p className="gfc-news-body">{tx(flash.body)}</p>
        <p className="gfc-news-paused">⏸ {tx("TIMER PAUSED")}</p>
        <button className="gfc-news-continue-btn" onClick={onDismiss} type="button" autoFocus>
          {tx("Continue trading")}
        </button>
      </div>
    </div>
  );
}
