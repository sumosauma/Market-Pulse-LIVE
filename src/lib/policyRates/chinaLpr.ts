export function getNextChinaLprPublication(from = new Date()): {
  iso: string;
  display: string;
  isRuleBased: true;
} {
  const y = from.getFullYear();
  const m = from.getMonth();
  const day = from.getDate();

  let targetYear = y;
  let targetMonth = m;
  if (day > 20) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  const rollWeekend = (year: number, month: number): Date => {
    let candidate = new Date(Date.UTC(year, month, 20));
    const dow = candidate.getUTCDay();
    if (dow === 6) candidate = new Date(Date.UTC(year, month, 22));
    if (dow === 0) candidate = new Date(Date.UTC(year, month, 21));
    return candidate;
  };

  let candidate = rollWeekend(targetYear, targetMonth);

  if (candidate.getTime() <= Date.UTC(y, m, day)) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
    candidate = rollWeekend(targetYear, targetMonth);
  }

  const iso = candidate.toISOString().slice(0, 10);
  const display = candidate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return { iso, display: `${display} rule-based`, isRuleBased: true };
}
