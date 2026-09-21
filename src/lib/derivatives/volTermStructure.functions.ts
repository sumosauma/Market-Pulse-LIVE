import { createServerFn } from "@tanstack/react-start";
import type { VolTermStructurePayload } from "./volTermStructure";
import { loadVolTermStructure } from "./volTermStructureSource";

export const VOL_TERM_QUERY_KEY = ["derivatives-vol-term-structure", "v3"] as const;

export const getVolTermStructure = createServerFn({ method: "GET" }).handler(
  async (): Promise<VolTermStructurePayload> => loadVolTermStructure(),
);
