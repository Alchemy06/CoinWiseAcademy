import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CRYPTO_REFRESH_INTERVAL_MS } from "../constants/crypto";
import type { CryptoDashboardData } from "../types/crypto";
import { CryptoMarketStructurePage } from "./CryptoMarketStructurePage";

// Keep the page tests at the route/component boundary by mocking only the data client, not the inner module tree.
const fetchCryptoDashboardDataMock = vi.fn<
  (currency: "gbp" | "usd", options?: { forceRefresh?: boolean }) => Promise<CryptoDashboardData>
>();

vi.mock("../utils/cryptoPrices", () => ({
  fetchCryptoDashboardData: (currency: "gbp" | "usd", options?: { forceRefresh?: boolean }) => fetchCryptoDashboardDataMock(currency, options)
}));

const sampleDashboard = (currency: "gbp" | "usd"): CryptoDashboardData => ({
  // Provide one realistic payload builder so rendering, switching, polling, and stale-banner tests share the same shape.
  assets: [
    {
      coinId: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      tone: "bitcoin",
      officialWebsite: "https://bitcoin.org",
      currentPrice: currency === "gbp" ? 70234.22 : 89644.78,
      change24h: 2.13,
      change7d: 5.82,
      marketCap: currency === "gbp" ? 1_390_000_000_000 : 1_770_000_000_000,
      totalVolume: currency === "gbp" ? 44_000_000_000 : 56_000_000_000,
      high24h: currency === "gbp" ? 70800 : 90200,
      low24h: currency === "gbp" ? 69000 : 88200,
      lastUpdatedAt: "2026-04-02T08:00:00.000Z"
    },
    {
      coinId: "ethereum",
      symbol: "ETH",
      name: "Ethereum",
      tone: "ethereum",
      officialWebsite: "https://ethereum.org",
      currentPrice: currency === "gbp" ? 2811.35 : 3584.44,
      change24h: -0.84,
      change7d: 1.19,
      marketCap: currency === "gbp" ? 338_000_000_000 : 430_000_000_000,
      totalVolume: currency === "gbp" ? 18_000_000_000 : 23_000_000_000,
      high24h: currency === "gbp" ? 2860 : 3640,
      low24h: currency === "gbp" ? 2750 : 3500,
      lastUpdatedAt: "2026-04-02T08:00:00.000Z"
    },
    {
      coinId: "solana",
      symbol: "SOL",
      name: "Solana",
      tone: "solana",
      officialWebsite: "https://solana.com",
      currentPrice: currency === "gbp" ? 131.12 : 167.25,
      change24h: 7.61,
      change7d: 14.2,
      marketCap: currency === "gbp" ? 64_000_000_000 : 81_000_000_000,
      totalVolume: currency === "gbp" ? 4_900_000_000 : 6_300_000_000,
      high24h: currency === "gbp" ? 133 : 170,
      low24h: currency === "gbp" ? 121 : 154,
      lastUpdatedAt: "2026-04-02T08:00:00.000Z"
    },
    {
      coinId: "ripple",
      symbol: "XRP",
      name: "XRP",
      tone: "ripple",
      officialWebsite: "https://xrpl.org",
      currentPrice: currency === "gbp" ? 0.52 : 0.67,
      change24h: 1.09,
      change7d: -2.1,
      marketCap: currency === "gbp" ? 31_000_000_000 : 39_000_000_000,
      totalVolume: currency === "gbp" ? 2_100_000_000 : 2_700_000_000,
      high24h: currency === "gbp" ? 0.54 : 0.69,
      low24h: currency === "gbp" ? 0.49 : 0.64,
      lastUpdatedAt: "2026-04-02T08:00:00.000Z"
    }
  ],
  chartSeries: [
    {
      coinId: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      tone: "bitcoin",
      points: [
        { timestamp: "2026-04-02T00:00:00.000Z", price: 100, relativeChange: 0 },
        { timestamp: "2026-04-02T06:00:00.000Z", price: 101.2, relativeChange: 1.2 },
        { timestamp: "2026-04-02T12:00:00.000Z", price: 102.8, relativeChange: 2.8 }
      ]
    },
    {
      coinId: "ethereum",
      symbol: "ETH",
      name: "Ethereum",
      tone: "ethereum",
      points: [
        { timestamp: "2026-04-02T00:00:00.000Z", price: 100, relativeChange: 0 },
        { timestamp: "2026-04-02T06:00:00.000Z", price: 99.7, relativeChange: -0.3 },
        { timestamp: "2026-04-02T12:00:00.000Z", price: 99.1, relativeChange: -0.9 }
      ]
    },
    {
      coinId: "solana",
      symbol: "SOL",
      name: "Solana",
      tone: "solana",
      points: [
        { timestamp: "2026-04-02T00:00:00.000Z", price: 100, relativeChange: 0 },
        { timestamp: "2026-04-02T06:00:00.000Z", price: 103.6, relativeChange: 3.6 },
        { timestamp: "2026-04-02T12:00:00.000Z", price: 107.8, relativeChange: 7.8 }
      ]
    },
    {
      coinId: "ripple",
      symbol: "XRP",
      name: "XRP",
      tone: "ripple",
      points: [
        { timestamp: "2026-04-02T00:00:00.000Z", price: 100, relativeChange: 0 },
        { timestamp: "2026-04-02T06:00:00.000Z", price: 100.4, relativeChange: 0.4 },
        { timestamp: "2026-04-02T12:00:00.000Z", price: 101.1, relativeChange: 1.1 }
      ]
    }
  ],
  lastSuccessfulSyncAt: "2026-04-02T08:00:00.000Z",
  isStale: false,
  staleReason: null
});

function with24hLeaders(
  dashboard: CryptoDashboardData,
  changes: Partial<Record<"bitcoin" | "ethereum" | "solana" | "ripple", number>>
): CryptoDashboardData {
  // Override only the intraday move field so tests can simulate leadership changes without rebuilding the whole fixture.
  return {
    ...dashboard,
    assets: dashboard.assets.map((asset) => ({
      ...asset,
      change24h: changes[asset.coinId] ?? asset.change24h
    }))
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  // Fake-timer tests still need one promise turn so pending async state updates can commit before assertions.
  await act(async () => {
    await Promise.resolve();
  });
}

describe("CryptoMarketStructurePage", () => {
  beforeEach(() => {
    fetchCryptoDashboardDataMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the loading state and then renders chart, trend note and comparison table", async () => {
    fetchCryptoDashboardDataMock.mockResolvedValue(sampleDashboard("gbp"));

    render(<CryptoMarketStructurePage />);

    expect(screen.getByText("Loading market...")).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 1, name: /A live read on crypto market structure/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Market chart legend")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Bitcoin" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Spot price")).toBeInTheDocument();
    expect(screen.getByText("00:00 to 24:00")).toBeInTheDocument();
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("24:00")).toBeInTheDocument();
    expect(screen.getByText("15:00")).toBeInTheDocument();
    expect(screen.getByText("06:00")).toBeInTheDocument();
  });

  it("reloads data when the user switches from GBP to USD", async () => {
    fetchCryptoDashboardDataMock.mockResolvedValueOnce(sampleDashboard("gbp")).mockResolvedValueOnce(sampleDashboard("usd"));
    const user = userEvent.setup();

    render(<CryptoMarketStructurePage />);

    expect((await screen.findAllByText("£70,234.22")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "USD" }));

    await waitFor(() => {
      expect(fetchCryptoDashboardDataMock).toHaveBeenNthCalledWith(2, "usd", { forceRefresh: false });
    });
    expect((await screen.findAllByText("$89,644.78")).length).toBeGreaterThan(0);
  });

  it("lets the user manually refresh the market snapshot from the comparison section", async () => {
    // Keep the second response deferred so the test can assert the button's disabled/loading state mid-refresh.
    const refreshedDashboard = {
      ...sampleDashboard("gbp"),
      assets: sampleDashboard("gbp").assets.map((asset) => (asset.coinId === "bitcoin" ? { ...asset, currentPrice: 70999.45 } : asset))
    };
    const deferredRefresh = createDeferred<CryptoDashboardData>();
    fetchCryptoDashboardDataMock.mockResolvedValueOnce(sampleDashboard("gbp")).mockReturnValueOnce(deferredRefresh.promise);
    const user = userEvent.setup();

    render(<CryptoMarketStructurePage />);

    expect((await screen.findAllByText("£70,234.22")).length).toBeGreaterThan(0);

    const refreshButton = screen.getByRole("button", { name: "Refresh market snapshot" });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(fetchCryptoDashboardDataMock).toHaveBeenNthCalledWith(2, "gbp", { forceRefresh: true });
    });
    expect(refreshButton).toBeDisabled();

    deferredRefresh.resolve(refreshedDashboard);

    await waitFor(() => {
      expect(screen.getAllByText("£70,999.45").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("button", { name: "Refresh market snapshot" })).toBeEnabled();
  });

  it("updates the trend note when another asset tab is selected", async () => {
    fetchCryptoDashboardDataMock.mockResolvedValue(sampleDashboard("gbp"));
    const user = userEvent.setup();

    render(<CryptoMarketStructurePage />);

    // Initial tab stays on Bitcoin, so the first note should describe Bitcoin's relative slot rather than the global leader.
    expect(await screen.findByText(/Bitcoin ranks 2 of 4 on 24h performance today\./i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Ethereum" }));

    // Switching tabs should recompute the selected asset's own context instead of repeating the same leader sentence.
    expect(screen.getByText(/Ethereum is currently the weakest 24h mover in this set\./i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Official" })).toHaveAttribute("href", "https://ethereum.org");
  });

  it("refreshes the trend leader when live 24h rankings change", async () => {
    fetchCryptoDashboardDataMock
      .mockResolvedValueOnce(sampleDashboard("gbp"))
      .mockResolvedValueOnce(
        with24hLeaders(sampleDashboard("gbp"), {
          ethereum: 9.42,
          solana: 4.25
        })
      );
    const user = userEvent.setup();

    render(<CryptoMarketStructurePage />);

    // Start from the baseline fixture where Bitcoin sits behind Solana on the 24h board.
    expect(await screen.findByText(/Bitcoin ranks 2 of 4 on 24h performance today\./i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Ethereum" }));
    // Ethereum begins as the laggard, then the refresh swaps it into the lead.
    expect(screen.getByText(/Ethereum is currently the weakest 24h mover in this set\./i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh market snapshot" }));

    await waitFor(() => {
      expect(fetchCryptoDashboardDataMock).toHaveBeenNthCalledWith(2, "gbp", { forceRefresh: true });
    });
    await waitFor(() => {
      // The refreshed payload should immediately promote Ethereum's narrative to the new strongest-mover wording.
      expect(screen.getByText(/Ethereum is currently the strongest 24h mover in this set\./i)).toBeInTheDocument();
    });
  });

  it("keeps stale data visible when an interval refresh fails", async () => {
    fetchCryptoDashboardDataMock.mockResolvedValueOnce(sampleDashboard("gbp")).mockRejectedValueOnce(new Error("network"));
    vi.useFakeTimers();

    render(<CryptoMarketStructurePage />);
    await flushMicrotasks();

    expect(screen.getAllByText("£70,234.22").length).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(CRYPTO_REFRESH_INTERVAL_MS);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(screen.getByText("Live data is temporarily stale. Showing the last successful refresh.")).toBeInTheDocument();
    expect(screen.getAllByText("£70,234.22").length).toBeGreaterThan(0);
  });

  it("shows the stale banner when the backend returns a cached snapshot", async () => {
    fetchCryptoDashboardDataMock.mockResolvedValue({
      ...sampleDashboard("gbp"),
      isStale: true,
      staleReason: "Live data is temporarily stale. Showing the last successful refresh."
    });

    render(<CryptoMarketStructurePage />);

    expect(await screen.findByText("Live data is temporarily stale. Showing the last successful refresh.")).toBeInTheDocument();
  });

  it("shows an empty fallback state when the first load fails", async () => {
    fetchCryptoDashboardDataMock.mockRejectedValue(new Error("network"));

    render(<CryptoMarketStructurePage />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load live crypto market data right now.")).toBeInTheDocument();
    });

    expect(screen.getByText("Chart data will appear here after the first successful refresh.")).toBeInTheDocument();
    expect(screen.getByText("Trend commentary will appear after the first successful refresh.")).toBeInTheDocument();
    expect(screen.getByText("Comparison rows will appear after the first successful refresh.")).toBeInTheDocument();
  });

  it("polls again after sixty seconds and clears the interval on unmount", async () => {
    fetchCryptoDashboardDataMock.mockResolvedValue(sampleDashboard("gbp"));
    vi.useFakeTimers();

    // Spy on clearInterval so the effect cleanup proves it tears down background polling when the page unmounts.
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = render(<CryptoMarketStructurePage />);

    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(CRYPTO_REFRESH_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(fetchCryptoDashboardDataMock).toHaveBeenCalledTimes(2);

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("refreshes when the window regains focus", async () => {
    fetchCryptoDashboardDataMock.mockResolvedValue(sampleDashboard("gbp"));

    render(<CryptoMarketStructurePage />);
    await flushMicrotasks();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(fetchCryptoDashboardDataMock).toHaveBeenCalledTimes(2);
  });
});
