/**
 * Sales CRM activity monitor. This is a documentation prompt, NOT a payroll
 * timekeeper or proof that an employee stopped working. GPS, app opens,
 * browser visibility and location permission never count as work events.
 */
export const SALES_CRM_WARNING_MINUTES = 45;
export const SALES_CRM_REVIEW_MINUTES = 60;

export type SalesActivityEvidence = {
  at: string;
  kind: "crm" | "order" | "visit" | "gps" | "app-open" | "location-permission";
};
export type SalesCRMReview = {
  state: "unavailable" | "within-window" | "warning" | "review";
  elapsedMinutes?: number;
  lastCRMAt?: string;
  hadCRMEvent: boolean;
};

const businessEvidence = new Set<SalesActivityEvidence["kind"]>(["crm", "order", "visit"]);
const epoch = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Based only on confirmed, timestamped business records since shift start.
 * A gap cannot be translated into unpaid time without separate human review.
 */
export function evaluateSalesCRMInactivity(
  clockInAt: string | undefined,
  evidence: SalesActivityEvidence[],
  asOfMs: number,
): SalesCRMReview {
  const started = clockInAt ? epoch(clockInAt) : undefined;
  if (started === undefined || !Number.isFinite(asOfMs) || asOfMs < started) {
    return {state: "unavailable", hadCRMEvent: false};
  }
  let latest = started;
  let lastCRMAt: string | undefined;
  for (const event of evidence) {
    if (!businessEvidence.has(event.kind)) continue;
    const at = epoch(event.at);
    if (at === undefined || at < started || at > asOfMs || at < latest) continue;
    latest = at;
    lastCRMAt = event.at;
  }
  const elapsedMinutes = Math.floor((asOfMs - latest) / 60000);
  const state: SalesCRMReview["state"] =
    elapsedMinutes >= SALES_CRM_REVIEW_MINUTES ? "review" :
      elapsedMinutes >= SALES_CRM_WARNING_MINUTES ? "warning" : "within-window";
  return {state, elapsedMinutes, lastCRMAt, hadCRMEvent: Boolean(lastCRMAt)};
}
