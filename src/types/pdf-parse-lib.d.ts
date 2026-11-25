/**
 * Narrow declaration for the direct lib entry used by Daily Bulletin parsing.
 * The package root `pdf-parse` ships `@types/pdf-parse`, but `pdf-parse/lib/pdf-parse.js`
 * is untyped and preferred so Node does not execute the package's test harness main.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
    text: string;
  }

  export default function pdfParse(dataBuffer: Uint8Array): Promise<PdfParseResult>;
}
