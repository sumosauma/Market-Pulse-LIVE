/** Tiny status indicator. No minimum visible time — unmounts as soon as fetching stops. */
export function YieldCurveFetchSpinner() {
  return (
    <span
      className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
      role="status"
      aria-label="Loading yield curve"
    />
  );
}
