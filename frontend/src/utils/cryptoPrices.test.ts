import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCryptoDashboardData } from "./cryptoPrices";

describe("fetchCryptoDashboardData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps market overview and chart data into the dashboard shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        assets: [
          {
            coinId: "bitcoin",
            symbol: "BTC",
            name: "Bitcoin",
            tone: "bitcoin",
            officialWebsite: "https://bitcoin.org",
            currentPrice: 70000,
            change24h: 2.3,
            change7d: 5.6,
            marketCap: 1_300_000_000_000,
            totalVolume: 38_000_000_000,
            high24h: 71000,
            low24h: 68000,
            lastUpdatedAt: "2026-04-02T08:00:00.000Z"
          },
          {
            coinId: "ethereum",
            symbol: "ETH",
            name: "Ethereum",
            tone: "ethereum",
            officialWebsite: "https://ethereum.org",
            currentPrice: 2800,
            change24h: -1.2,
            change7d: 1.5,
            marketCap: 340_000_000_000,
            totalVolume: 18_000_000_000,
            high24h: 2890,
            low24h: 2720,
            lastUpdatedAt: "2026-04-02T08:00:00.000Z"
          },
          {
            coinId: "solana",
            symbol: "SOL",
            name: "Solana",
            tone: "solana",
            officialWebsite: "https://solana.com",
            currentPrice: 120,
            change24h: 6.4,
            change7d: 12.2,
            marketCap: 60_000_000_000,
            totalVolume: 4_000_000_000,
            high24h: 124,
            low24h: 110,
            lastUpdatedAt: "2026-04-02T08:00:00.000Z"
          },
          {
            coinId: "ripple",
            symbol: "XRP",
            name: "XRP",
            tone: "ripple",
            officialWebsite: "https://xrpl.org",
            currentPrice: 0.48,
            change24h: 0.2,
            change7d: -2.1,
            marketCap: 28_000_000_000,
            totalVolume: 2_000_000_000,
            high24h: 0.5,
            low24h: 0.46,
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
              {
                timestamp: "2026-04-02T00:00:00.000Z",
                price: 100,
                relativeChange: 0
              },
              {
                timestamp: "2026-04-02T06:00:00.000Z",
                price: 104,
                relativeChange: 4
              },
              {
                timestamp: "2026-04-02T12:00:00.000Z",
                price: 108,
                relativeChange: 8
              }
            ]
          }
        ],
        lastSuccessfulSyncAt: "2026-04-02T08:00:00.000Z",
        isStale: false,
        staleReason: null
      })
    } as Response);

    const data = await fetchCryptoDashboardData("gbp");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(data.assets).toHaveLength(4);
    expect(data.assets[0]).toMatchObject({
      coinId: "bitcoin",
      symbol: "BTC",
      currentPrice: 70000,
      change24h: 2.3,
      change7d: 5.6
    });
    expect(data.chartSeries[0]).toMatchObject({
      coinId: "bitcoin",
      symbol: "BTC"
    });
    expect(data.chartSeries[0].points.at(-1)?.relativeChange).toBeCloseTo(8);
    expect(data.lastSuccessfulSyncAt).toBe("2026-04-02T08:00:00.000Z");
    expect(data.isStale).toBe(false);
  });

  it("safely falls back to nulls and empty points when fields are missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        assets: [
          {
            coinId: "bitcoin",
            currentPrice: 70000
          }
        ],
        chartSeries: [
          {
            coinId: "bitcoin",
            points: []
          }
        ],
        isStale: false
      })
    } as Response);

    const data = await fetchCryptoDashboardData("usd");

    expect(data.assets.find((item) => item.coinId === "bitcoin")).toMatchObject({
      currentPrice: 70000,
      change24h: null,
      change7d: null,
      marketCap: null
    });
    expect(data.assets.find((item) => item.coinId === "ethereum")).toMatchObject({
      currentPrice: null
    });
    expect(data.chartSeries.find((item) => item.coinId === "bitcoin")?.points).toEqual([]);
  });

  it("preserves stale snapshot metadata from the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        assets: [],
        chartSeries: [],
        lastSuccessfulSyncAt: "2026-04-02T08:00:00.000Z",
        isStale: true,
        staleReason: "Live data is temporarily stale. Showing the last successful refresh."
      })
    } as Response);

    const data = await fetchCryptoDashboardData("gbp");

    expect(data.isStale).toBe(true);
    expect(data.staleReason).toBe("Live data is temporarily stale. Showing the last successful refresh.");
  });

  it("throws a stable error when one of the requests fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false
    } as Response);

    await expect(fetchCryptoDashboardData("gbp")).rejects.toThrow("Unable to load crypto market data right now.");
  });

  it("adds the force flag when the caller explicitly requests a live refresh", async () => {
    // Assert against the raw URL so the client contract stays obvious even if fetch wrapper internals change later.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        assets: [],
        chartSeries: [],
        isStale: false
      })
    } as Response);

    await fetchCryptoDashboardData("gbp", { forceRefresh: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toContain("currency=gbp");
    expect(fetchSpy.mock.calls[0]?.[0]).toContain("force=1");
  });
});
