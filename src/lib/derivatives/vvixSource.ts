import { fetchOfficialText } from "./officialFetch";
import { parseCboeVolHistory } from "./volTermStructure";
import { VIX_CBOE_HISTORY_URL } from "./vixEodPercentile";
import type { VolIndexDef, VolIndexRow } from "./volIndices";
import {
  emptyVvixRow,
  resolveVvixIndex,
  resolveVvixVixRatio,
  VVIX_CBOE_HISTORY_URL,
  vvixRowFromResolved,
} from "./vvixIndex";

export async function loadVvixIndex(def: VolIndexDef): Promise<VolIndexRow> {
  try {
    const [vvixText, vixText] = await Promise.all([
      fetchOfficialText(VVIX_CBOE_HISTORY_URL, "text/csv,*/*", "https://www.cboe.com/"),
      fetchOfficialText(VIX_CBOE_HISTORY_URL, "text/csv,*/*", "https://www.cboe.com/"),
    ]);
    if (!vvixText) return emptyVvixRow(def);
    const resolved = resolveVvixIndex(vvixText);
    if (!resolved) return emptyVvixRow(def);
    const ratio = vixText
      ? resolveVvixVixRatio(parseCboeVolHistory(vvixText), parseCboeVolHistory(vixText))
      : null;
    return vvixRowFromResolved(def, resolved, ratio);
  } catch {
    return emptyVvixRow(def);
  }
}
