import { createServerFn } from "@tanstack/react-start";
import type { PolicyRatesPayload } from "./types";

export const POLICY_RATES_QUERY_KEY = ["policy-rates", "v3"] as const;

export type PolicyRatesSwrPayload = PolicyRatesPayload & {
  fromStaleCache?: boolean;
};

export const getPolicyRates = createServerFn({ method: "GET" }).handler(
  async (): Promise<PolicyRatesSwrPayload> => {
    const { getCachedPolicyRates } = await import("./policyRates.cache");
    return getCachedPolicyRates();
  },
);
