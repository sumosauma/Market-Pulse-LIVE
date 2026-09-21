/** Map presentation — separate from data registry / fetching. */

export type EquityMapLabelConfig = Readonly<{
  short: string;
}>;

export const EQUITY_MAP_LABELS: Record<string, EquityMapLabelConfig> = {
  US: { short: "S&P 500" },
  SE: { short: "OMXS30" },
  DE: { short: "DAX" },
  FR: { short: "CAC 40" },
  GB: { short: "FTSE 100" },
  JP: { short: "Nikkei" },
  CN: { short: "CSI 300" },
  HK: { short: "Hang Seng" },
  IN: { short: "Nifty 50" },
  KR: { short: "KOSPI" },
  AU: { short: "ASX 200" },
  CA: { short: "TSX" },
  BR: { short: "Bovespa" },
  MX: { short: "IPC" },
  IT: { short: "FTSE MIB" },
  ES: { short: "IBEX 35" },
  NL: { short: "AEX" },
  CH: { short: "SMI" },
  NO: { short: "OBX" },
  DK: { short: "OMX C25" },
  FI: { short: "OMX H25" },
};
