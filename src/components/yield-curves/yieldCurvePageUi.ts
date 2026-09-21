import type { SovereignCountryId } from "@/lib/yieldCurves/types";

export type YieldSourceTone = "live" | "cached" | "offline" | "unknown";

export type YieldSourceDisplay = Readonly<{
  headline: string;
  detail?: string;
  tone: YieldSourceTone;
}>;

export function fmtYieldPageTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Presentation-only labels for existing data source tags — no fetch logic. */
export function formatYieldSourceDisplay(
  countryId: SovereignCountryId,
  dataSourceTag: string,
  opts?: { updatedAt?: string | null; cacheSavedAt?: string | null; liveRefreshFailed?: boolean },
): YieldSourceDisplay {
  const updated = fmtYieldPageTs(opts?.cacheSavedAt ?? opts?.updatedAt);

  if (countryId === "US") {
    const publisher = "U.S. Treasury";
    if (dataSourceTag === "treasury-live") {
      return { headline: `${publisher} · Live`, tone: "live" };
    }
    if (dataSourceTag === "treasury-disk-cache" || dataSourceTag === "browser-local-storage") {
      return {
        headline: `${publisher} · Cached · Last updated ${updated}`,
        detail: opts?.liveRefreshFailed
          ? "Live refresh unavailable; showing latest cached official data."
          : undefined,
        tone: "cached",
      };
    }
    if (dataSourceTag === "mock-fallback") {
      return { headline: `${publisher} · Offline illustrative data`, tone: "offline" };
    }
  }

  if (countryId === "SE") {
    if (dataSourceTag === "di-live") {
      return { headline: "Riksbank SWEA + Millistream/DI · Live", tone: "live" };
    }
    if (dataSourceTag === "di-disk-cache" || dataSourceTag === "browser-local-storage") {
      return {
        headline: `Riksbank SWEA + Millistream/DI · Cached · Last updated ${updated}`,
        detail: opts?.liveRefreshFailed
          ? "Live refresh unavailable; showing latest cached Sweden curve."
          : undefined,
        tone: "cached",
      };
    }
  }

  if (countryId === "NO") {
    if (dataSourceTag === "norgesbank-live") {
      return { headline: "Norges Bank data · Live", tone: "live" };
    }
    if (dataSourceTag === "norgesbank-disk-cache" || dataSourceTag === "browser-local-storage") {
      return {
        headline: `Norges Bank data · Cached · Last updated ${updated}`,
        detail: opts?.liveRefreshFailed
          ? "Live refresh unavailable; showing latest cached official data."
          : undefined,
        tone: "cached",
      };
    }
  }

  if (countryId === "GB") {
    if (dataSourceTag === "tv-live") {
      return { headline: "TradingView UK Government Bond Yields · Live", tone: "live" };
    }
    if (dataSourceTag === "boe-fallback") {
      return {
        headline: "Bank of England data · Fallback",
        detail: "TradingView UK government bond yields unavailable.",
        tone: "cached",
      };
    }
    if (dataSourceTag === "boe-live") {
      return { headline: "Bank of England data · Live", tone: "live" };
    }
    if (dataSourceTag === "boe-disk-cache" || dataSourceTag === "browser-local-storage") {
      return {
        headline: `Bank of England data · Cached · Last updated ${updated}`,
        detail: opts?.liveRefreshFailed
          ? "Live refresh unavailable; showing latest cached official data."
          : undefined,
        tone: "cached",
      };
    }
  }

  if (countryId === "CN") {
    if (dataSourceTag === "chinabond-live") {
      return { headline: "ChinaBond data · Live", tone: "live" };
    }
    if (dataSourceTag === "chinabond-disk-cache" || dataSourceTag === "browser-local-storage") {
      return {
        headline: `ChinaBond data · Cached · Last updated ${updated}`,
        detail: opts?.liveRefreshFailed
          ? "Live refresh unavailable; showing latest cached official data."
          : undefined,
        tone: "cached",
      };
    }
  }

  const fallbackPublisher =
    countryId === "SE"
      ? "Millistream/DI"
      : countryId === "NO"
        ? "Norges Bank"
        : countryId === "GB"
          ? "Bank of England"
          : countryId === "CN"
            ? "ChinaBond"
            : "U.S. Treasury";
  return { headline: fallbackPublisher, tone: "unknown" };
}

export const YC_CHART_MARGIN = { top: 12, right: 20, left: 4, bottom: 28 } as const;
export const YC_CHART_HEIGHT = 360;
export const YC_AXIS_TICK = {
  fontSize: 11,
  fill: "var(--muted-foreground)",
  fontFamily: "ui-monospace, monospace",
} as const;
