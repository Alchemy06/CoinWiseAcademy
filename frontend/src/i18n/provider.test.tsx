import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { I18nProvider } from "./provider";
import { LOCALE_STORAGE_KEY } from "./config";

function ReusedTextNodeExample({ nextText }: { nextText: string }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div>
      <p>{isLoaded ? nextText : "Loading market..."}</p>
      <button onClick={() => setIsLoaded(true)} type="button">
        Continue
      </button>
    </div>
  );
}

describe("I18nProvider DOM text translation", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0",
      configurable: true
    });
  });

  it("does not restore stale English loading text after a reused node updates in English mode", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en-GB");

    render(
      <I18nProvider>
        <ReusedTextNodeExample nextText="Updated 12:34:56" />
      </I18nProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("Updated 12:34:56")).toBeInTheDocument();
    });
    expect(screen.queryByText("Loading market...")).not.toBeInTheDocument();
  });

  it("does not restore stale translated loading text after a reused node updates in Chinese mode", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");

    render(
      <I18nProvider>
        <ReusedTextNodeExample nextText="Beginner" />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("正在加载市场数据...")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "继续" }));

    await waitFor(() => {
      expect(screen.getByText("初级")).toBeInTheDocument();
    });
    expect(screen.queryByText("正在加载市场数据...")).not.toBeInTheDocument();
  });
});
