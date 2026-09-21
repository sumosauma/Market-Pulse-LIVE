import { mapPctColor, MAP_PALETTE } from "@/lib/equities/equityMapStyle";
import {
  europeChipLabel,
  fmtEuropeChipPct,
} from "@/lib/equities/equityEuropeChipLabels";
import { fmtChangePct, fmtEquityPrice } from "@/lib/equities/equityMarketsUi";
import { EquityCountryFlag } from "@/components/equities/EquityCountryFlag";
import { EquitySparkline } from "@/components/equities/EquitySparkline";
import { EQUITY_MARKET_BY_ID } from "@/lib/equities/equityMarketsRegistry";
import { hasEquityQuoteData } from "@/lib/equities/equityMarketStatus";
import type { EquityMarketRow } from "@/lib/equities/types";

function cardStyle(selected: boolean, overlay?: boolean): React.CSSProperties {
  return {
    background: overlay ? "rgba(255,255,255,0.94)" : MAP_PALETTE.cardBg,
    borderColor: selected ? MAP_PALETTE.cardBorderSelected : MAP_PALETTE.cardBorder,
    boxShadow: selected ? MAP_PALETTE.cardShadowHover : MAP_PALETTE.cardShadow,
  };
}

/** Market row card — default for panels/tables, overlay for map clusters. */
export function EquityMarketCard({
  row,
  selected,
  onSelect,
  compact,
  overlay,
  europeDrilldown,
}: {
  row: EquityMarketRow;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
  overlay?: boolean;
  europeDrilldown?: boolean;
}) {
  const pct = fmtChangePct(row.changePercent);
  const pctColor = mapPctColor(row.changePercent);
  const price = fmtEquityPrice(row.price);
  const unavailable = !hasEquityQuoteData(row);
  const changeLabel = unavailable ? "—" : pct;
  const changeColor = unavailable ? MAP_PALETTE.textMuted : pctColor;
  const tooltip = `${row.countryName} · ${row.indexName}${unavailable ? "" : ` · ${price} · ${pct}`}`;
  const showFlag = Boolean(EQUITY_MARKET_BY_ID[row.countryId]);

  if (europeDrilldown) {
    const chipLabel = europeChipLabel(row.countryId, row.indexName);
    const chipPct = unavailable ? "—" : fmtEuropeChipPct(row.changePercent);

    return (
      <button
        type="button"
        title={tooltip}
        aria-label={tooltip}
        className={[
          "inline-flex shrink-0 items-center rounded border text-left whitespace-nowrap",
          "gap-x-1 px-1.5 py-0.5",
          "transition-[border-color,box-shadow] duration-150",
        ].join(" ")}
        style={cardStyle(selected, true)}
        onClick={() => onSelect()}
      >
        {showFlag ? (
          <EquityCountryFlag countryId={row.countryId} size="xs" />
        ) : (
          <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-slate-200/80" />
        )}

        <span
          className="shrink-0 text-[8px] font-semibold leading-none"
          style={{ color: MAP_PALETTE.textPrimary }}
        >
          {chipLabel}
        </span>

        <span
          className={[
            "shrink-0 font-mono text-[9px] font-bold tabular-nums leading-none sm:text-[10px]",
          ].join(" ")}
          style={{ color: changeColor }}
        >
          {chipPct}
        </span>

        {!unavailable ? (
          <EquitySparkline
            countryId={row.countryId}
            changePercent={row.changePercent}
            tiny
          />
        ) : null}
      </button>
    );
  }

  if (overlay) {
    return (
      <button
        type="button"
        title={tooltip}
        aria-label={tooltip}
        className={[
          "grid w-full max-w-full items-center rounded border text-left",
          "gap-x-1.5 px-1.5 py-1 sm:px-2 sm:py-1",
          "grid-cols-[auto_minmax(0,1fr)_auto_auto]",
          "transition-[border-color,box-shadow] duration-150",
        ].join(" ")}
        style={cardStyle(selected, true)}
        onClick={() => onSelect()}
      >
        {showFlag ? (
          <EquityCountryFlag countryId={row.countryId} size="sm" />
        ) : (
          <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-slate-200/80" />
        )}

        <div className="min-w-0 leading-tight">
          <div
            className="truncate text-[10px] font-semibold leading-none"
            style={{ color: MAP_PALETTE.textPrimary }}
          >
            {row.indexName}
          </div>
          <div
            className="mt-px truncate text-[8px] leading-none"
            style={{ color: MAP_PALETTE.textSecondary }}
          >
            {row.countryName}
          </div>
        </div>

        <span
          className={[
            "shrink-0 font-mono text-[13px] font-bold tabular-nums leading-none sm:text-[14px]",
          ].join(" ")}
          style={{ color: changeColor }}
        >
          {changeLabel}
        </span>

        {!unavailable ? (
          <div className="shrink-0">
            <EquitySparkline
              countryId={row.countryId}
              changePercent={row.changePercent}
              compact
            />
          </div>
        ) : (
          <span className="w-[34px] shrink-0" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      className={[
        "grid w-full max-w-full items-center rounded-lg border text-left transition-[border-color,box-shadow] duration-150",
        compact
          ? "gap-x-1 px-1.5 py-1 sm:gap-x-1.5 sm:px-2 sm:py-1.5"
          : "gap-x-1.5 px-2 py-1.5 sm:gap-x-2 sm:px-2.5 sm:py-2",
        "grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
      ].join(" ")}
      style={cardStyle(selected)}
      onClick={() => onSelect()}
    >
      {showFlag ? (
        <EquityCountryFlag countryId={row.countryId} size={compact ? "sm" : "md"} />
      ) : (
        <span className="inline-block h-4 w-4 shrink-0 rounded-full bg-slate-200/80 sm:h-[18px] sm:w-[18px]" />
      )}

      <div className="min-w-0">
        <div
          className={[
            "truncate font-semibold leading-tight",
            compact ? "text-[10px] sm:text-[11px]" : "text-[11px] sm:text-[12px]",
          ].join(" ")}
          style={{ color: MAP_PALETTE.textPrimary }}
        >
          {row.indexName}
        </div>
        <div
          className={[
            "truncate leading-tight",
            compact ? "mt-px text-[8px] sm:text-[9px]" : "mt-0.5 text-[9px] sm:text-[10px]",
          ].join(" ")}
          style={{ color: MAP_PALETTE.textSecondary }}
        >
          {row.countryName}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end leading-none">
        <span
          className={[
            "font-mono tabular-nums",
            compact ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-[11px]",
          ].join(" ")}
          style={{ color: unavailable ? MAP_PALETTE.textMuted : MAP_PALETTE.textPrimary }}
        >
          {unavailable ? "—" : price}
        </span>
        <span
          className={[
            "mt-px font-mono font-semibold tabular-nums sm:mt-0.5",
            compact ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-[11px]",
          ].join(" ")}
          style={{ color: unavailable ? MAP_PALETTE.textMuted : pctColor }}
        >
          {unavailable ? "—" : pct}
        </span>
      </div>

      <div className="hidden shrink-0 md:block">
        <EquitySparkline countryId={row.countryId} changePercent={row.changePercent} />
      </div>
    </button>
  );
}
