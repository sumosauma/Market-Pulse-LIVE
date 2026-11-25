import { useEffect, useRef } from "react";

/**
 * When the server returns a stale-while-revalidate snapshot, schedule follow-up
 * refetches so the UI picks up the background refresh without a full page reload.
 * Stops once `fromStale` becomes false or maxAttempts is reached.
 */
export function useRefetchWhenStale(
  fromStale: boolean | undefined,
  refetch: () => unknown,
  options?: { delayMs?: number; intervalMs?: number; maxAttempts?: number },
): void {
  const delayMs = options?.delayMs ?? 400;
  const intervalMs = options?.intervalMs ?? 1_500;
  const maxAttempts = options?.maxAttempts ?? 6;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!fromStale) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts += 1;
      void Promise.resolve(refetchRef.current()).finally(() => {
        if (cancelled || attempts >= maxAttempts) return;
        timer = setTimeout(tick, intervalMs);
      });
    };

    timer = setTimeout(tick, delayMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fromStale, delayMs, intervalMs, maxAttempts]);
}
