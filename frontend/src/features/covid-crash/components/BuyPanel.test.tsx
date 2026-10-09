import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BuyPanel } from "./BuyPanel";

// ── Shared props ──────────────────────────────────────────────────────────────
const DEFAULT_PROPS = {
  cashPence: 1_000_000,   // £10,000
  pricePence: 792_000,    // £7,920 / BTC
  isSubmitting: false,
  onBuy: vi.fn(),
};

describe("BuyPanel", () => {
  it("renders the BUY heading and available cash", () => {
    render(<BuyPanel {...DEFAULT_PROPS} />);
    expect(screen.getByText("BUY")).toBeInTheDocument();
    expect(screen.getByText(/£10,000\.00/)).toBeInTheDocument();
  });

  it("shows a disabled 'No cash available' state when cashPence is 0", () => {
    render(<BuyPanel {...DEFAULT_PROPS} cashPence={0} />);
    expect(screen.getByText("No cash available.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buy btc/i })).not.toBeInTheDocument();
  });

  it("buy button is disabled when no amount is entered", () => {
    render(<BuyPanel {...DEFAULT_PROPS} />);
    expect(screen.getByRole("button", { name: /buy btc/i })).toBeDisabled();
  });

  it("shows BTC estimate when a valid amount is typed", async () => {
    const user = userEvent.setup();
    render(<BuyPanel {...DEFAULT_PROPS} />);
    await user.type(screen.getByLabelText(/amount/i), "5000");
    // The estimate paragraph shows "≈ 0.xxx BTC"
    expect(screen.getByText(/≈.*BTC/)).toBeInTheDocument();
  });

  it("25% quick-fill button sets ~25% of cash in the input", async () => {
    const user = userEvent.setup();
    render(<BuyPanel {...DEFAULT_PROPS} />);
    await user.click(screen.getByRole("button", { name: "25%" }));
    const input = screen.getByLabelText(/amount/i) as HTMLInputElement;
    expect(parseFloat(input.value)).toBeCloseTo(2500, 0);
  });

  it("Max quick-fill button sets full cash amount in the input", async () => {
    const user = userEvent.setup();
    render(<BuyPanel {...DEFAULT_PROPS} />);
    await user.click(screen.getByRole("button", { name: "Max" }));
    const input = screen.getByLabelText(/amount/i) as HTMLInputElement;
    expect(parseFloat(input.value)).toBeCloseTo(10000, 0);
  });

  it("clicking Buy BTC opens the confirm modal", async () => {
    const user = userEvent.setup();
    render(<BuyPanel {...DEFAULT_PROPS} />);
    await user.type(screen.getByLabelText(/amount/i), "1000");
    await user.click(screen.getByRole("button", { name: /buy btc/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancelling the confirm modal dismisses it without calling onBuy", async () => {
    const onBuy = vi.fn();
    const user = userEvent.setup();
    render(<BuyPanel {...DEFAULT_PROPS} onBuy={onBuy} />);
    await user.type(screen.getByLabelText(/amount/i), "1000");
    await user.click(screen.getByRole("button", { name: /buy btc/i }));
    await user.click(screen.getByRole("button", { name: /reconsider/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onBuy).not.toHaveBeenCalled();
  });

  it("confirming the order calls onBuy with the correct pence amount", async () => {
    const onBuy = vi.fn();
    const user = userEvent.setup();
    render(<BuyPanel {...DEFAULT_PROPS} onBuy={onBuy} />);
    await user.type(screen.getByLabelText(/amount/i), "1000");
    await user.click(screen.getByRole("button", { name: /buy btc/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onBuy).toHaveBeenCalledOnce();
    expect(onBuy).toHaveBeenCalledWith(100_000); // £1,000 = 100,000 pence
  });

  it("clears the input after a confirmed order", async () => {
    const user = userEvent.setup();
    render(<BuyPanel {...DEFAULT_PROPS} />);
    const input = screen.getByLabelText(/amount/i) as HTMLInputElement;
    await user.type(input, "1000");
    await user.click(screen.getByRole("button", { name: /buy btc/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(input.value).toBe("");
  });

  it("all buttons are disabled while isSubmitting", () => {
    render(<BuyPanel {...DEFAULT_PROPS} isSubmitting={true} />);
    screen.getAllByRole("button").forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
