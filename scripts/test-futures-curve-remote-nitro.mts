/**
 * Prove the compiled Nitro server hydrates FUTURES_CURVE_REMOTE_URL
 * (stable latest JSON) without a read token.
 */
import { createServer } from "node:http";
import { readFileSync, copyFileSync, unlinkSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const DISK = "data/cache/commodities-futures-curve.json";
const BAK = `${DISK}.nitro-test-bak`;
const PORT = 8791;
const REMOTE_PORT = 8792;
const SERVER_FN_ID = "7e711b533b28a32da3d854c0f01972b7fa5373c6c1267f133bdfc22ccb9097a0";

const envelope = readFileSync(DISK, "utf8");
const parsed = JSON.parse(envelope) as {
  version: number;
  savedAt: string;
  payload: { fetchedAt: string; curves: Array<{ id: string; sourceLabel: string | null }> };
};
parsed.savedAt = new Date().toISOString();
parsed.payload.fetchedAt = parsed.savedAt;
const tagged = JSON.stringify(parsed);

const remoteServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(tagged);
});
await new Promise<void>((r) => remoteServer.listen(REMOTE_PORT, "127.0.0.1", r));

if (existsSync(DISK)) copyFileSync(DISK, BAK);
try {
  if (existsSync(DISK)) unlinkSync(DISK);

  const child = spawn(process.execPath, [".output/server/index.mjs"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      FUTURES_CURVE_REMOTE_URL: `http://127.0.0.1:${REMOTE_PORT}/commodities-futures-curve.json`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let boot = "";
  child.stdout?.on("data", (d) => {
    boot += d.toString();
  });
  child.stderr?.on("data", (d) => {
    boot += d.toString();
  });

  let ready = false;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.status > 0) {
        ready = true;
        break;
      }
    } catch {
      /* booting */
    }
  }
  if (!ready) {
    child.kill("SIGTERM");
    remoteServer.close();
    throw new Error(`Nitro server failed to boot:\n${boot.slice(-2000)}`);
  }

  const sf = await fetch(`http://127.0.0.1:${PORT}/_serverFn/${SERVER_FN_ID}`);
  const text = await sf.text();
  const okStatus = sf.status === 200;
  const hasBrent = text.includes("brent");
  const hasCme =
    text.includes("CME settlements") ||
    text.includes("CME Daily Bulletin") ||
    text.includes("Daily Bulletin");
  const hasYahooOnly = text.includes("Yahoo (fallback)") && !hasCme;

  console.log(
    JSON.stringify(
      {
        ok: okStatus && hasBrent && hasCme && !hasYahooOnly,
        status: sf.status,
        bytes: text.length,
        hasBrent,
        hasCme,
        hasYahooOnly,
        tokenUsed: false,
        diskSeeded: existsSync(DISK),
      },
      null,
      2,
    ),
  );

  if (!(okStatus && hasBrent && hasCme)) {
    child.kill("SIGTERM");
    remoteServer.close();
    throw new Error(`Nitro remote hydrate failed: status=${sf.status} hasBrent=${hasBrent} hasCme=${hasCme}`);
  }

  child.kill("SIGTERM");
  await sleep(300);
} finally {
  remoteServer.close();
  if (existsSync(BAK)) {
    copyFileSync(BAK, DISK);
    unlinkSync(BAK);
  }
}
