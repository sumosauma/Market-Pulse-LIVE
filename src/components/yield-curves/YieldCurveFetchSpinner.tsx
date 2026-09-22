import { useId } from "react";

/** Visible status indicator. Unmounts as soon as fetching stops. */
export function YieldCurveFetchSpinner() {
  const gradientId = `yc-arc-${useId().replace(/:/g, "")}`;

  return (
    <span
      className="inline-flex size-[18px] shrink-0 items-center justify-center"
      role="status"
      aria-label="Loading yield curve"
    >
      <svg
        viewBox="0 0 48 48"
        className="yc-spin size-[18px]"
        fill="none"
        aria-hidden="true"
        shapeRendering="geometricPrecision"
      >
        <circle cx="24" cy="24" r="18" stroke="#e2e8f0" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r="18"
          stroke={`url(#${gradientId})`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="56 70"
        />
        <defs>
          <linearGradient id={gradientId} x1="6" y1="24" x2="42" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.08" />
            <stop offset="42%" stopColor="#0f172a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}

/** Centers the spinner over a table's numeric columns, under the header. */
export function YieldCurveTableLoadingOverlay() {
  return (
    <div className="pointer-events-none absolute bottom-12 left-[22%] right-3 top-10 flex items-center justify-center">
      <YieldCurveFetchSpinner />
    </div>
  );
}
