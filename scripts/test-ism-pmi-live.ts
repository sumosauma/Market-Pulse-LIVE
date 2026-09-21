import { fetchIsmPmiSnapshot } from "../src/lib/macroPulse/ismPmi.ts";

const now = new Date();
for (const kind of ["services", "manufacturing"] as const) {
  const { snapshot, fromCache } = await fetchIsmPmiSnapshot(kind, now);
  console.log(kind, {
    fromCache,
    latest: snapshot.latest,
    previous: snapshot.previous,
    change: snapshot.latest - snapshot.previous,
    observationDate: snapshot.observationDate,
    nextRelease: snapshot.nextReleaseDisplay,
    nextEstimated: snapshot.nextReleaseIsEstimated,
    url: snapshot.reportUrl,
  });
}
