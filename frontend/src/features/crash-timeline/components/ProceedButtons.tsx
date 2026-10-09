import { useNavigate } from "react-router-dom";
import type { CrashScenario } from "../types";
import { IconPlay } from "../../../components/icons";
import { useI18n } from "../../../i18n/provider";

interface ProceedButtonsProps {
  crash: CrashScenario;
}

export function ProceedButtons({ crash }: ProceedButtonsProps) {
  const { tx } = useI18n();
  const navigate = useNavigate();

  const mrAvailable = !!crash.marketReplayScenarioId;

  const goMarketReplay = () => {
    if (!crash.marketReplayScenarioId) return;
    // Market Replay still boots from session storage, so persist the selected crash before routing into the simulator shell.
    sessionStorage.setItem("mr_scenario", crash.marketReplayScenarioId);
    navigate("/market-replay");
  };

  return (
    <div className="ct-proceed">
      <button
        type="button"
        className={`ct-proceed-btn ct-proceed-btn--primary ${mrAvailable ? "" : "is-disabled"}`}
        onClick={goMarketReplay}
        disabled={!mrAvailable}
      >
        <span className="ct-proceed-icon" aria-hidden="true">
          <IconPlay size={15} stroke={1.7} fill="currentColor" />
        </span>
        <span className="ct-proceed-title">
          {mrAvailable ? tx("Open Market Replay") : tx("Market Replay unavailable")}
        </span>
      </button>
    </div>
  );
}
