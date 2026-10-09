import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SellPanel } from "./SellPanel";

// ── Shared props ──────────────────────────────────────────────────────────────
// User holds ≈0.631313 BTC (bought with £5,000 at £7,920 / BTC)
const BTC_HELD = (500_000 * 100_000_000) / 792_000 | 0; // ~63_131_313 sats

const DEFAULT_PROPS = {
  btcHeldSatoshis: BTC_HELD,
  pricePence: 435_500,  // crash price, ~£4,355 / BTC
  isSubmitting: false,
  onSell: vi.fn(),
};

describe("SellPanel", () => {
  it("renders the SELL heading and position value", () => {
    render(<SellPanel {...DEFAULT_PROPS} />);
    expect(screen.getByText("SELL")).toBeInTheDocument();
    // Position at crash price is less than the original £5,000
    expect(screen.getByText(/Position:/)).toBeInTheDocument();
  });

  it("shows 'Buy first to enable selling' when btcHeldSatoshis is 0", () => {
    render(<SellPanel {...DEFAULT_PROPS} btcHeldSatoshis={0} />);
    expect(screen.getByText("Buy first to enable selling.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sell btc/i })).not.toBeInTheDocument();
  });

  it("sell button is disabled when no amount is entered", () => {
    render(<SellPanel {...DEFAULT_PROPS} />);
    expect(screen.getByRole("button", { name: /sell btc/i })).toBeDisabled();
  });

  it("shows BTC estimate when a valid amount is typed", async () => {
    const user = userEvent.setup();
    render(<SellPanel {...DEFAULT_PROPS} />);
    await user.type(screen.getByLabelText(/amount/i), "1000");
    // The estimate paragraph shows "≈ 0.xxx BTC"
    expect(screen.getByText(/≈.*BTC/)).toBeInTheDocument();
  });

  it("50% quick-fill sets ~50% of position value in the input", async () => {
    const user = userEvent.setup();
    render(<SellPanel {...DEFAULT_PROPS} />);
    await user.click(screen.getByRole("button", { name: "50%" }));
    const input = screen.getByLabelText(/amount/i) as HTMLInputElement;
    const positionGbp = (BTC_HELD * 435_500) / 100_000_000 / 100;
    expect(parseFloat(input.value)).toBeCloseTo(positionGbp * 0.5, 0);
  });

  it("All quick-fill button sets 100% of position value", async () => {
    const user = userEvent.setup();
    render(<SellPanel {...DEFAULT_PROPS} />);
    await user.click(screen.getByRole("button", { name: "All" }));
    const input = screen.getByLabelText(/amount/i) as HTMLInputElement;
    const positionGbp = (BTC_HELD * 435_500) / 100_000_000 / 100;
    expect(parseFloat(input.value)).toBeCloseTo(positionGbp, 0);
  });

  it("clicking Sell BTC opens the confirm modal", async () => {
    const user = userEvent.setup();
    render(<SellPanel {...DEFAULT_PROPS} />);
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /sell btc/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancelling the confirm modal dismisses it without calling onSell", async () => {
    const onSell = vi.fn();
    const user = userEvent.setup();
    render(<SellPanel {...DEFAULT_PROPS} onSell={onSell} />);
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /sell btc/i }));
    await user.click(screen.getByRole("button", { name: /reconsider/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSell).not.toHaveBeenCalled();
  });

  it("confirming the order calls onSell with a positive satoshi amount", async () => {
    const onSell = vi.fn();
    const user = userEvent.setup();
    render(<SellPanel {...DEFAULT_PROPS} onSell={onSell} />);
    await user.type(screen.getByLabelText(/amount/i), "500");
    await user.click(screen.getByRole("button", { name: /sell btc/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onSell).toHaveBeenCalledOnce();
    const [satoshisArg] = onSell.mock.calls[0];
    expect(satoshisArg).toBeGreaterThan(0);
    expect(satoshisArg).toBeLessThanOrEqual(BTC_HELD);
  });

  it("clears the input after a confirmed order", async () => {
    const user = userEvent.setup();
    render(<SellPanel {...DEFAULT_PROPS} />);
    const input = screen.getByLabelText(/amount/i) as HTMLInputElement;
    await user.type(input, "500");
    await user.click(screen.getByRole("button", { name: /sell btc/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(input.value).toBe("");
  });

  it("all interactive elements are disabled while isSubmitting", () => {
    render(<SellPanel {...DEFAULT_PROPS} isSubmitting={true} />);
    screen.getAllByRole("button").forEach((btn) => {
      expect(btn).toBeDisabled();
    });
    expect(screen.getByLabelText(/amount/i)).toBeDisabled();
  });
});
