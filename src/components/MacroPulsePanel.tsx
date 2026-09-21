import { Panel } from "@/components/PageShell";

import {

  MACRO_INDICATOR_ORDER,

  MACRO_CONSENSUS_IDS,

  type MacroPulsePayload,

  type MacroPulseRow,

  type MacroPulseSectionId,

} from "@/lib/macroPulse/types";



const CHANGE_HEADER_TITLE = "Change from previous release";

const CONSENSUS_HEADER_TITLE =
  "Trading Economics market consensus for the latest released observation";



const SECTION_LABELS: Record<MacroPulseSectionId, string> = {

  inflation: "Inflation",

  labour: "Labour",

  growth: "Growth",

};



const HAS_CONSENSUS_COLUMN = MACRO_CONSENSUS_IDS.length > 0;

const TABLE_COLS = HAS_CONSENSUS_COLUMN ? 5 : 4;



function StatusHint({ row }: { row: MacroPulseRow }) {

  if (row.freshness === "fresh") return null;



  const label =

    row.freshness === "error"

      ? row.error ?? "Error"

      : row.freshness === "cached"

        ? "Cached"

        : row.freshness === "stale"

          ? "Stale"

          : null;



  if (!label) return null;



  return (

    <span

      className={

        row.freshness === "error"

          ? "text-destructive/80"

          : "text-muted-foreground/80"

      }

    >

      · {label}

    </span>

  );

}



function ConsensusCell({ row }: { row: MacroPulseRow }) {

  if (!row.consensusDisplay) {

    return <span className="text-muted-foreground">—</span>;

  }



  return (

    <div className="text-right">

      {row.consensusSourceUrl ? (

        <a

          href={row.consensusSourceUrl}

          target="_blank"

          rel="noopener noreferrer"

          className="tabular-nums font-medium text-foreground hover:text-primary hover:underline"

          title={CONSENSUS_HEADER_TITLE}

        >

          {row.consensusDisplay}

        </a>

      ) : (

        <div className="tabular-nums font-medium text-foreground">{row.consensusDisplay}</div>

      )}

      {row.consensusRevisionDisplay ? (

        <div

          className="mt-0.5 text-[10px] leading-tight text-muted-foreground"

          title="Current forecast minus previous forecast for the same upcoming observation"

        >

          {row.consensusRevisionDisplay}

        </div>

      ) : null}

    </div>

  );

}



function ChangeCell({ row }: { row: MacroPulseRow }) {

  if (!row.changeVsPriorDisplay) {

    return <span className="text-muted-foreground">—</span>;

  }

  return (

    <div className="text-right">

      <div className="tabular-nums font-medium text-foreground">{row.changeVsPriorDisplay}</div>

      {row.changeReferenceDisplay ? (

        <div

          className="mt-0.5 text-[10px] leading-tight text-muted-foreground"

          title={`Compared with ${row.changeReferenceDisplay}`}

        >

          {row.changeReferenceDisplay}

        </div>

      ) : null}

    </div>

  );

}



function NextCell({ row }: { row: MacroPulseRow }) {

  if (!row.nextReleaseDisplay || row.nextReleaseDisplay === "—") {

    return <span className="text-muted-foreground">—</span>;

  }

  const hasEstInDisplay = /\best\.?/i.test(row.nextReleaseDisplay);

  const suffix =

    row.nextReleaseIsEstimated && !hasEstInDisplay ? "est." : null;

  return (

    <div className="text-right">

      <div className="tabular-nums text-foreground/90">

        {row.nextReleaseDisplay}

        {suffix ? <span className="ml-1 text-muted-foreground">{suffix}</span> : null}

      </div>

      <div

        className="mt-0.5 text-[10px] leading-tight text-muted-foreground"

        title="Trading Economics market consensus for the next unreleased observation"

      >

        Consensus: {row.nextReleaseConsensusDisplay ?? "—"}

      </div>

    </div>

  );

}



function LatestCell({ row }: { row: MacroPulseRow }) {

  const momHint =

    row.displayKind === "yoy_mom" && row.secondaryValue ? row.secondaryValue : undefined;

  const indexHint =

    row.displayKind === "index_pts" && row.secondaryValue ? row.secondaryValue : undefined;



  return (

    <>

      <div className="tabular-nums font-medium text-foreground" title={momHint}>

        {row.headlineValue}

      </div>

      {momHint ? (

        <div

          className="mt-0.5 cursor-help text-[10px] leading-tight text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"

          title={momHint}

        >

          MoM

        </div>

      ) : null}

      {indexHint ? (

        <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{indexHint}</div>

      ) : null}

    </>

  );

}



function MacroRow({ row }: { row: MacroPulseRow }) {

  const hasValue = row.headlineValue != null && row.metadataDisplay != null;



  return (

    <tr className="border-b border-border/60 last:border-0 hover:bg-muted/30">

      <td className="px-4 py-2 align-top">

        <div className="font-medium leading-tight text-foreground">{row.label}</div>

        {hasValue ? (

          <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">

            <a

              href={row.sourceUrl}

              target="_blank"

              rel="noopener noreferrer"

              className="hover:text-primary hover:underline"

            >

              {row.metadataDisplay}

            </a>

            <StatusHint row={row} />

          </div>

        ) : (

          <div className="mt-1 text-[10px] text-destructive/90">{row.error ?? "Unavailable"}</div>

        )}

      </td>

      <td className="px-2 py-2 text-right align-top">

        {hasValue ? <LatestCell row={row} /> : <span className="text-muted-foreground">—</span>}

      </td>

      {HAS_CONSENSUS_COLUMN ? (

        <td className="px-2 py-2 text-right align-top">

          {hasValue ? <ConsensusCell row={row} /> : <span className="text-muted-foreground">—</span>}

        </td>

      ) : null}

      <td className="px-2 py-2 align-top">

        {hasValue ? <ChangeCell row={row} /> : <span className="text-muted-foreground">—</span>}

      </td>

      <td className="px-4 py-2 text-right align-top">

        {hasValue ? <NextCell row={row} /> : <span className="text-muted-foreground">—</span>}

      </td>

    </tr>

  );

}



function SectionRows({ section, rows }: { section: MacroPulseSectionId; rows: MacroPulseRow[] }) {

  const sectionRows = rows.filter((r) => r.section === section);

  if (!sectionRows.length) return null;

  return (

    <>

      <tr className="border-b border-border/80 bg-muted/15">

        <td

          colSpan={TABLE_COLS}

          className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"

        >

          {SECTION_LABELS[section]}

        </td>

      </tr>

      {sectionRows.map((row) => (

        <MacroRow key={row.id} row={row} />

      ))}

    </>

  );

}



type MacroPulsePanelProps = {

  data: MacroPulsePayload | undefined;

  isLoading?: boolean;

};



export function MacroPulsePanel({ data, isLoading }: MacroPulsePanelProps) {

  const rows = data?.rows ?? [];



  return (

    <Panel title="Macro Pulse" meta="Key macro releases relevant for policy and markets">

      {isLoading && !data ? (

        <div className="px-4 py-3 text-[12px] text-muted-foreground">Loading macro data…</div>

      ) : (

        <div className="min-w-0 overflow-x-auto">

          <table className="w-full table-fixed border-collapse text-[12px]">

            <thead>

              <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">

                <th className="w-[28%] px-4 py-2 font-semibold">Indicator</th>

                <th className="w-[15%] px-2 py-2 text-right font-semibold">Latest</th>

                {HAS_CONSENSUS_COLUMN ? (

                  <th

                    className="w-[15%] px-2 py-2 text-right font-semibold"

                    title={CONSENSUS_HEADER_TITLE}

                  >

                    Consensus

                  </th>

                ) : null}

                <th

                  className="w-[16%] px-2 py-2 text-right font-semibold"

                  title={CHANGE_HEADER_TITLE}

                >

                  Change

                </th>

                <th className="w-[26%] px-4 py-2 text-right font-semibold">Next Release</th>

              </tr>

            </thead>

            <tbody>

              <SectionRows section="inflation" rows={rows} />

              <SectionRows section="labour" rows={rows} />

              <SectionRows section="growth" rows={rows} />

            </tbody>

          </table>

        </div>

      )}

      <p className="border-t border-border px-4 py-2 text-[10px] leading-relaxed text-muted-foreground">

        {MACRO_INDICATOR_ORDER.length} official indicators · Change = latest value minus previous

        release · Consensus = Trading Economics market consensus for the latest released observation

      </p>

    </Panel>

  );

}

