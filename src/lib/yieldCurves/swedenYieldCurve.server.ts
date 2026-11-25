import { createServerFn } from "@tanstack/react-start";
import type { GetSwedenYieldHistoryResponse } from "./types";

export interface SwedenYieldHistoryInput {
  forceRefresh?: boolean;
}

/** Server loader — returns cached DI history; comparison is built client-side. */
export const getSwedenYieldHistory = createServerFn({ method: "POST" })
  .inputValidator((data: SwedenYieldHistoryInput) => data ?? {})
  .handler(async ({ data }): Promise<GetSwedenYieldHistoryResponse> => {
    const { getCachedSwedenYieldHistory } = await import("./swedenYieldCurve.cache");
    return getCachedSwedenYieldHistory(Boolean(data?.forceRefresh));
  });

/** @deprecated Use getSwedenYieldHistory */
export const getSwedenRiksbankYieldHistory = getSwedenYieldHistory;

/** @deprecated Use getSwedenYieldHistory */
export const getSwedenRiksbankYieldCurve = getSwedenYieldHistory;
