import type { HistoryPoint } from "./indicators";
import { calendarDaysBetween } from "./overview";

export const SECTOR_PERIODS = ["1D", "1W", "1M", "YTD"] as const;
export type SectorPeriod = (typeof SECTOR_PERIODS)[number];

export const SECTOR_STALE_DAYS = 5;
const WEEK_SESSIONS = 5;

export const SECTOR_PROVIDERS = ["invesco", "wisdomtree"] as const;
export type SectorProviderId = (typeof SECTOR_PROVIDERS)[number];

export type SectorFund = {
  /** Exchange ticker shown to users. */
  ticker: string;
  /** Yahoo chart symbol for the listing used. */
  symbol: string;
  fund: string;
  exposure: string;
  benchmark: boolean;
  isin?: string;
  trackedIndex?: string;
  /**
   * Desk-facing constituent summary for sector (i) tooltips.
   * Broad Commodities lists index groups; sector funds list named commodities.
   * Verified against provider / index methodology (not assumed cross-provider parity).
   */
  underlyingCommodities: string;
};

export type SectorProviderSpec = {
  id: SectorProviderId;
  label: string;
  productNoun: "ETF" | "ETC";
  subtitle: string;
  currency: "USD" | "EUR";
  instrumentType: "ETF";
  exchangeTimezone: string;
  exchangeLabel: string;
  /** Yahoo prints a flat bar with zero volume for sessions without trades on some venues. */
  skipZeroVolume: boolean;
  funds: readonly SectorFund[];
};

export const SECTOR_PROVIDER_SPECS: Record<SectorProviderId, SectorProviderSpec> = {
  invesco: {
    id: "invesco",
    label: "Invesco",
    productNoun: "ETF",
    subtitle: "Invesco DB Commodity ETFs · USD market-price returns",
    currency: "USD",
    instrumentType: "ETF",
    exchangeTimezone: "America/New_York",
    exchangeLabel: "NYSE Arca",
    skipZeroVolume: false,
    funds: [
      // DBC / DBIQ Optimum Yield Diversified — groups per DBIQ / Invesco prospectus (Nov 2025+ universe).
      {
        ticker: "DBC",
        symbol: "DBC",
        fund: "Invesco DB Commodity Index Tracking Fund",
        exposure: "Broad Commodities",
        benchmark: true,
        underlyingCommodities: "Energy, precious metals, industrial metals, agriculture",
      },
      // DBE — DBIQ Optimum Yield Energy (SEC 424B3 / 10-Q, as of 10 Nov 2025).
      {
        ticker: "DBE",
        symbol: "DBE",
        fund: "Invesco DB Energy Fund",
        exposure: "Energy",
        benchmark: false,
        underlyingCommodities:
          "WTI crude oil, Brent crude oil, natural gas, RBOB gasoline, ultra-low sulphur diesel, gas oil",
      },
      // DBB — DBIQ Optimum Yield Industrial Metals (SEC 10-K / 424B3, as of 10 Nov 2025).
      {
        ticker: "DBB",
        symbol: "DBB",
        fund: "Invesco DB Base Metals Fund",
        exposure: "Base Metals",
        benchmark: false,
        underlyingCommodities: "Aluminium, zinc, lead, nickel, copper",
      },
      // DBP — DBIQ Optimum Yield Precious Metals (Invesco prospectus: gold and silver).
      {
        ticker: "DBP",
        symbol: "DBP",
        fund: "Invesco DB Precious Metals Fund",
        exposure: "Precious Metals",
        benchmark: false,
        underlyingCommodities: "Gold, silver",
      },
      // DBA — DBIQ Diversified Agriculture (Invesco prospectus constituents).
      {
        ticker: "DBA",
        symbol: "DBA",
        fund: "Invesco DB Agriculture Fund",
        exposure: "Agriculture",
        benchmark: false,
        underlyingCommodities:
          "Corn, soybeans, wheat, Kansas wheat, sugar, cocoa, coffee, cotton, live cattle, feeder cattle, lean hogs",
      },
    ],
  },
  wisdomtree: {
    id: "wisdomtree",
    label: "WisdomTree",
    productNoun: "ETC",
    subtitle: "WisdomTree Commodity ETCs · Borsa Italiana market-price returns (EUR)",
    currency: "EUR",
    instrumentType: "ETF",
    exchangeTimezone: "Europe/Rome",
    exchangeLabel: "Borsa Italiana",
    skipZeroVolume: true,
    funds: [
      // AIGC — Bloomberg Commodity (BCOM) groups; Broad lists categories only.
      {
        ticker: "AIGC",
        symbol: "AIGC.MI",
        fund: "WisdomTree Broad Commodities",
        exposure: "Broad Commodities",
        benchmark: true,
        isin: "GB00B15KY989",
        trackedIndex: "Bloomberg Commodity 4W Total Return (BCOM4T)",
        underlyingCommodities:
          "Energy, grains, softs, livestock, industrial metals, precious metals",
      },
      // AIGE — BCOM Energy Subindex (BCOM 2026/2027 target weights).
      {
        ticker: "AIGE",
        symbol: "AIGE.MI",
        fund: "WisdomTree Energy",
        exposure: "Energy",
        benchmark: false,
        isin: "GB00B15KYB02",
        trackedIndex: "Bloomberg Commodity Energy Subindex 4W Total Return (BCOMEN4T)",
        underlyingCommodities:
          "Brent crude oil, WTI crude oil, natural gas, low sulphur gas oil, ULS diesel, RBOB gasoline",
      },
      // AIGI — BCOM Industrial Metals Subindex.
      {
        ticker: "AIGI",
        symbol: "AIGI.MI",
        fund: "WisdomTree Industrial Metals",
        exposure: "Industrial Metals",
        benchmark: false,
        isin: "GB00B15KYG56",
        trackedIndex: "Bloomberg Commodity Industrial Metals Subindex 4W Total Return (BCOMIN4T)",
        underlyingCommodities: "Copper, aluminium, zinc, nickel, lead",
      },
      // AIGP — BCOM Precious Metals Subindex (gold and silver in current BCOM weights).
      {
        ticker: "AIGP",
        symbol: "AIGP.MI",
        fund: "WisdomTree Precious Metals",
        exposure: "Precious Metals",
        benchmark: false,
        isin: "GB00B15KYF40",
        trackedIndex: "Bloomberg Commodity Precious Metals Subindex 4W Total Return (BCOMPR4T)",
        underlyingCommodities: "Gold, silver",
      },
      // AIGA — BCOM Agriculture Subindex (grains + softs + livestock).
      {
        ticker: "AIGA",
        symbol: "AIGA.MI",
        fund: "WisdomTree Agriculture",
        exposure: "Agriculture",
        benchmark: false,
        isin: "GB00B15KYH63",
        trackedIndex: "Bloomberg Commodity Agriculture Subindex 4W Total Return (BCOMAG4T)",
        underlyingCommodities:
          "Corn, soybeans, soybean meal, soybean oil, wheat, HRW wheat, sugar, coffee, cotton, cocoa, live cattle, lean hogs",
      },
    ],
  },
};

export type Distribution = { exDate: string; amount: number };

/** Unadjusted daily closes keyed by exchange-local session date. */
export type FundSeries = {
  ticker: string;
  closes: HistoryPoint[];
  distributions: Distribution[];
};

export type SectorCell = {
  period: SectorPeriod;
  returnPct: number | null;
  referenceDate: string | null;
  referenceClose: number | null;
  /** An ex-distribution date falls after the reference session, so the price return omits that payout. */
  distributionInWindow: boolean;
};

export type SectorRow = {
  ticker: string;
  symbol: string;
  fund: string;
  exposure: string;
  benchmark: boolean;
  isin: string | null;
  trackedIndex: string | null;
  latestClose: number | null;
  latestDate: string | null;
  cells: SectorCell[];
  unavailableReason: string | null;
};

export type ProviderPerformance = {
  provider: SectorProviderId;
  rows: SectorRow[];
  asOf: string | null;
  references: Record<SectorPeriod, string | null>;
  /** The latest bar belongs to a regular session that has not closed yet. */
  sessionOpen: boolean;
  quotedAt: string | null;
  stale: boolean;
  distributions: { ticker: string; exDate: string; amount: number }[];
};

export type SectorPerformance = {
  providers: Record<SectorProviderId, ProviderPerformance>;
  fetchedAt: string;
  fromStaleCache: boolean;
};

function oneMonthEarlier(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const year = m === 1 ? y - 1 : y;
  const monthIndex = m === 1 ? 11 : m - 2;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

function lastOnOrBefore(calendar: readonly string[], target: string): string | null {
  for (let i = calendar.length - 1; i >= 0; i--) {
    if (calendar[i]! <= target) return calendar[i]!;
  }
  return null;
}

/** Reference sessions on the shared calendar of every fund's session dates. */
export function referenceSessions(calendar: readonly string[]): {
  asOf: string | null;
  references: Record<SectorPeriod, string | null>;
} {
  const asOf = calendar[calendar.length - 1] ?? null;
  const last = calendar.length - 1;
  if (!asOf) return { asOf: null, references: { "1D": null, "1W": null, "1M": null, YTD: null } };
  const monthTarget = oneMonthEarlier(asOf);
  return {
    asOf,
    references: {
      "1D": calendar[last - 1] ?? null,
      "1W": calendar[last - WEEK_SESSIONS] ?? null,
      // The anchor must be strictly earlier than the latest session.
      "1M": monthTarget < asOf ? lastOnOrBefore(calendar.slice(0, last), monthTarget) : null,
      YTD: lastOnOrBefore(calendar, `${Number(asOf.slice(0, 4)) - 1}-12-31`),
    },
  };
}

export function periodReturn(latest: number, reference: number): number {
  return (latest / reference - 1) * 100;
}

export function computeProviderPerformance(
  spec: SectorProviderSpec,
  series: ReadonlyMap<string, FundSeries | null>,
  today: string,
  session: { sessionOpen: boolean; quotedAt: string | null },
): ProviderPerformance {
  const dates = new Set<string>();
  for (const fund of series.values()) for (const point of fund?.closes ?? []) dates.add(point.date);
  const calendar = [...dates].sort();
  const { asOf, references } = referenceSessions(calendar);
  const age = asOf ? calendarDaysBetween(asOf, today) : null;
  const stale = age == null || age > SECTOR_STALE_DAYS;
  const distributions: ProviderPerformance["distributions"] = [];
  const noun = spec.productNoun;

  const rows = spec.funds.map((fundSpec): SectorRow => {
    const fund = series.get(fundSpec.ticker) ?? null;
    const base = {
      ticker: fundSpec.ticker,
      symbol: fundSpec.symbol,
      fund: fundSpec.fund,
      exposure: fundSpec.exposure,
      benchmark: fundSpec.benchmark,
      isin: fundSpec.isin ?? null,
      trackedIndex: fundSpec.trackedIndex ?? null,
    };
    const emptyCells = SECTOR_PERIODS.map((period) => ({
      period,
      returnPct: null,
      referenceDate: references[period],
      referenceClose: null,
      distributionInWindow: false,
    }));
    if (!fund) {
      return {
        ...base,
        latestClose: null,
        latestDate: null,
        cells: emptyCells,
        unavailableReason: `N/A. ${fundSpec.ticker} did not return a verified ${spec.currency} ${noun} history.`,
      };
    }
    const byDate = new Map(fund.closes.map((point) => [point.date, point.close]));
    const latestClose = asOf ? (byDate.get(asOf) ?? null) : null;
    const ownLatest = fund.closes[fund.closes.length - 1]?.date ?? null;
    if (latestClose == null) {
      return {
        ...base,
        latestClose: null,
        latestDate: ownLatest,
        cells: emptyCells,
        unavailableReason: `N/A. ${fundSpec.ticker} has no traded close for the ${asOf ?? "latest"} session.`,
      };
    }
    if (stale) {
      return { ...base, latestClose, latestDate: asOf, cells: emptyCells, unavailableReason: `N/A. The latest session (${asOf}) is more than ${SECTOR_STALE_DAYS} days old.` };
    }
    for (const dist of fund.distributions) {
      if (references.YTD && dist.exDate > references.YTD && asOf && dist.exDate <= asOf) {
        distributions.push({ ticker: fundSpec.ticker, ...dist });
      }
    }
    const cells = SECTOR_PERIODS.map((period): SectorCell => {
      const referenceDate = references[period];
      const referenceClose = referenceDate ? (byDate.get(referenceDate) ?? null) : null;
      return {
        period,
        referenceDate,
        referenceClose,
        returnPct: referenceClose != null && referenceClose > 0 ? periodReturn(latestClose, referenceClose) : null,
        distributionInWindow:
          referenceDate != null &&
          fund.distributions.some((dist) => dist.exDate > referenceDate && asOf != null && dist.exDate <= asOf),
      };
    });
    return { ...base, latestClose, latestDate: asOf, cells, unavailableReason: null };
  });

  return { provider: spec.id, rows, asOf, references, sessionOpen: session.sessionOpen, quotedAt: session.quotedAt, stale, distributions };
}
