import type { YieldCurveCountryCompareRow } from "@/lib/yieldCurves/types";
import { YieldTableBpsCell, YieldTableYieldCell } from "./YieldCurveTableCells";

const TH =
  "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
const TD = "px-4 py-2 align-middle";

export function YieldCurveCountryTable({
  rows,
  primaryLabel,
  compareLabel,
  compareLoading = false,
  periodLabel = "current levels",
}: {
  rows: YieldCurveCountryCompareRow[];
  primaryLabel: string;
  compareLabel: string;
  compareLoading?: boolean;
  periodLabel?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className={`${TH} text-left`}>Maturity</th>
            <th className={`${TH} text-right`}>{primaryLabel}</th>
            <th className={`${TH} text-right`}>{compareLabel}</th>
            <th className={`${TH} w-40 text-right`}>Spread</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.maturity} className="border-b border-border/60 hover:bg-muted/15">
              <td className={`${TD} font-mono text-[13px] font-medium text-foreground`}>
                {r.maturity}
              </td>
              <td className={`${TD} text-right`}>
                <YieldTableYieldCell value={r.primaryYield} sourceType={r.primarySourceType} />
              </td>
              <td className={`${TD} text-right`}>
                <YieldTableYieldCell
                  value={r.compareYield}
                  sourceType={r.compareSourceType}
                  loading={compareLoading}
                />
              </td>
              <td className={`${TD} text-right`}>
                <YieldTableBpsCell value={r.spreadBps} loading={compareLoading} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border/40 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Yields shown at <span className="font-medium text-foreground/80">{periodLabel}</span>. Spread
        = {primaryLabel} yield minus {compareLabel} yield at each maturity. Missing points are not
        filled.
      </p>
    </div>
  );
}
