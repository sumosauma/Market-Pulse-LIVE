/**
 * Extract text from CME Daily Bulletin PDFs.
 *
 * IMPORTANT: Do not statically import `pdf-parse` into the Nitro/Rollup graph.
 * Bundling rewrites its dynamic `require("./pdf.js/...")` into a stub that always
 * throws in production (DigitalOcean), which silently disabled the bulletin path.
 *
 * Runtime createRequire loads the real package from node_modules (project root or
 * traced server node_modules), preserving the pdf.js files pdf-parse needs.
 */
import { createRequire } from "node:module";
import { join } from "node:path";

type PdfParseFn = (data: Buffer) => Promise<{ text?: string }>;

let cached: PdfParseFn | null = null;

function loadPdfParse(): PdfParseFn {
  if (cached) return cached;

  const attempts: Array<() => PdfParseFn> = [
    () => createRequire(import.meta.url)("pdf-parse/lib/pdf-parse.js") as PdfParseFn,
    () => createRequire(join(process.cwd(), "package.json"))("pdf-parse/lib/pdf-parse.js") as PdfParseFn,
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      cached = attempt();
      return cached;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(
    `pdf-parse is unavailable at runtime (Daily Bulletin disabled). Tried createRequire from module URL and cwd. ${errors.join(" | ")}`,
  );
}

/** Returns PDF plain text, or null when the buffer is not a usable PDF. */
export async function extractPdfText(buf: Buffer): Promise<string | null> {
  if (buf.length < 100 || buf.slice(0, 4).toString() !== "%PDF") return null;
  const pdfParse = loadPdfParse();
  const parsed = await pdfParse(buf);
  return typeof parsed.text === "string" ? parsed.text : null;
}
