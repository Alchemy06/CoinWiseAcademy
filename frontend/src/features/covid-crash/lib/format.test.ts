import { describe, expect, it } from "vitest";
import {
  formatBTC,
  formatGBP,
  formatGBPDelta,
  formatPercent,
  formatPercentDelta,
  parseBTCInputToSatoshis,
  parseInputToPence,
} from "./format";

describe("formatGBP", () => {
  it("formats pence as GBP currency string", () => {
    expect(formatGBP(792_000)).toBe("£7,920.00");
  });

  it("formats zero pence", () => {
    expect(formatGBP(0)).toBe("£0.00");
  });

  it("formats sub-pound values with two decimal places", () => {
    expect(formatGBP(150)).toBe("£1.50");
  });

  it("formats large values with thousand separator", () => {
    expect(formatGBP(1_000_000)).toBe("£10,000.00");
  });
});

describe("formatBTC", () => {
  it("formats 1 BTC (100_000_000 sats)", () => {
    expect(formatBTC(100_000_000)).toBe("1.000000 BTC");
  });

  it("formats a fractional amount", () => {
    expect(formatBTC(63_131_313)).toBe("0.631313 BTC");
  });

  it("formats zero satoshis", () => {
    expect(formatBTC(0)).toBe("0.000000 BTC");
  });
});

describe("formatPercent", () => {
  it("formats basis points as a percentage string", () => {
    expect(formatPercent(1_000)).toBe("10.00%");
  });

  it("formats fractional basis points", () => {
    expect(formatPercent(12_345)).toBe("123.45%");
  });

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });
});

describe("parseInputToPence", () => {
  it("parses a whole-number GBP string", () => {
    expect(parseInputToPence("2500")).toBe(250_000);
  });

  it("parses a decimal GBP string", () => {
    expect(parseInputToPence("2500.50")).toBe(250_050);
  });

  it("strips commas from formatted numbers", () => {
    expect(parseInputToPence("2,500.00")).toBe(250_000);
  });

  it("returns 0 for empty string", () => {
    expect(parseInputToPence("")).toBe(0);
  });

  it("truncates more than 2 decimal places", () => {
    // 2500.999 → treated as 2500.99
    expect(parseInputToPence("2500.999")).toBe(250_099);
  });
});

describe("parseBTCInputToSatoshis", () => {
  it("parses a BTC string to satoshis", () => {
    expect(parseBTCInputToSatoshis("1.0")).toBe(100_000_000);
  });

  it("parses fractional BTC", () => {
    expect(parseBTCInputToSatoshis("0.5")).toBe(50_000_000);
  });

  it("returns 0 for empty string", () => {
    expect(parseBTCInputToSatoshis("")).toBe(0);
  });

  it("returns 0 for negative value", () => {
    expect(parseBTCInputToSatoshis("-1")).toBe(0);
  });
});

describe("formatGBPDelta", () => {
  it("prefixes positive delta with +", () => {
    expect(formatGBPDelta(5_000)).toBe("+£50.00");
  });

  it("prefixes negative delta with -", () => {
    expect(formatGBPDelta(-5_000)).toBe("-£50.00");
  });

  it("formats zero as +£0.00", () => {
    expect(formatGBPDelta(0)).toBe("+£0.00");
  });
});

describe("formatPercentDelta", () => {
  it("prefixes positive delta with +", () => {
    expect(formatPercentDelta(16_800)).toBe("+168.00%");
  });

  it("no extra prefix on negative delta", () => {
    expect(formatPercentDelta(-5_000)).toBe("-50.00%");
  });

  it("formats zero", () => {
    expect(formatPercentDelta(0)).toBe("+0.00%");
  });
});
