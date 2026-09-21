import { YIELD_CURVE_MATURITIES, type YieldCurveRowView } from "@/lib/yieldCurves/types";
import { YieldTableBpsCell, YieldTableYieldCell } from "./YieldCurveTableCells";

const TH =
  "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
const TD = "px-4 py-2 align-middle";

export function YieldCurveTable({
  rows,
  pending = false,
}: {
  rows: YieldCurveRowView[];
  /** Request in flight and there is no curve to keep on screen yet. */
  pending?: boolean;
}) {
  const blank = pending && rows.length === 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className={`${TH} text-left`}>Maturity</th>
            <th className={`${TH} text-right`}>Current</th>
            <th className={`${TH} text-right`}>Comparison</th>
            <th className={`${TH} w-28 text-right`}>Change (bps)</th>
          </tr>
        </thead>
        <tbody>
          {blank
            ? YIELD_CURVE_MATURITIES.map((maturity) => (
                <tr key={maturity} className="border-b border-border/60">
                  <td className={`${TD} font-mono text-[13px] font-medium text-foreground`}>
                    {maturity}
                  </td>
                  <td className={`${TD} text-right`}>
                    <YieldTableYieldCell value={null} sourceType="official" neutral />
                  </td>
                  <td className={`${TD} text-right`}>
                    <YieldTableYieldCell value={null} sourceType="official" neutral />
                  </td>
                  <td className={`${TD} text-right`}>
                    <YieldTableBpsCell value={null} neutral />
                  </td>
                </tr>
              ))
            : rows.map((r) => (
                <tr key={r.maturity} className="border-b border-border/60 hover:bg-muted/15">
                  <td className={`${TD} font-mono text-[13px] font-medium text-foreground`}>
                    {r.maturity}
                  </td>
                  <td className={`${TD} text-right`}>
                    <YieldTableYieldCell value={r.currentYield} sourceType={r.current.sourceType} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <YieldTableYieldCell value={r.comparisonYield} sourceType={r.comparison.sourceType} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <YieldTableBpsCell value={r.changeBps} />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
      <p className="border-t border-border/40 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Missing maturities are not estimated. “Not published” = absent from the official harmonized grid.
      </p>
    </div>
  );
}
