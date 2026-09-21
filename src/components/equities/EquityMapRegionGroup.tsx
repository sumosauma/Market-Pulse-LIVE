import { regionAnchorStyle, type MapRegionAnchor } from "@/lib/equities/equityMapOverlayLayout";
import { MAP_PALETTE } from "@/lib/equities/equityMapStyle";

function RegionLabel({
  label,
  drilldown,
  onDrilldown,
}: {
  label: string;
  drilldown?: boolean;
  onDrilldown?: () => void;
}) {
  const header = (
    <span
      className={[
        "text-[8px] font-semibold uppercase tracking-[0.11em] sm:text-[9px] sm:tracking-[0.13em]",
        drilldown ? "cursor-pointer transition-opacity hover:opacity-80" : "",
      ].join(" ")}
      style={{ color: MAP_PALETTE.columnHeader }}
    >
      {label}
      {drilldown ? (
        <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground">
          →
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="mb-1 sm:mb-1.5">
      {drilldown && onDrilldown ? (
        <button type="button" className="text-left" onClick={onDrilldown}>
          {header}
        </button>
      ) : (
        header
      )}
      <div
        className="mt-1 h-px w-full opacity-80"
        style={{ background: MAP_PALETTE.columnDivider }}
      />
    </div>
  );
}

/** Anchored market group — sits over a continent/sub-region on the map canvas. */
export function EquityMapRegionGroup({
  anchor,
  label,
  drilldown,
  onDrilldown,
  chipGrowScale = 1,
  children,
}: {
  anchor: MapRegionAnchor;
  label: string;
  drilldown?: boolean;
  onDrilldown?: () => void;
  /** 1 = design size; below 1 shrinks with narrower map frame. */
  chipGrowScale?: number;
  children: React.ReactNode;
}) {
  const scale = chipGrowScale > 0 ? chipGrowScale : 1;
  const transformOrigin = anchor.right != null ? "top right" : "top left";

  return (
    <div
      className="pointer-events-auto absolute z-10 flex min-w-0 flex-col"
      style={{
        ...regionAnchorStyle(anchor),
        transform: scale < 0.999 ? `scale(${scale})` : undefined,
        transformOrigin,
      }}
    >
      <RegionLabel label={label} drilldown={drilldown} onDrilldown={onDrilldown} />
      <div className="flex flex-col gap-1 sm:gap-1.5">{children}</div>
    </div>
  );
}
