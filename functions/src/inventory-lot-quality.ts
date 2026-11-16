/** Conservative operational quality gate, not statutory expiration policy.
 * Past-dated, unknown or invalid best-by lots need Operations review before
 * automatic fulfillment. All business dates use America/Phoenix.
 */
type Lot = Record<string, unknown>;
const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** Arizona date, independent of the server's timezone.
 * @param {Date} date Instant to resolve.
 * @return {string} YYYY-MM-DD.
 */
export function phoenixDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (name: string) =>
    parts.find((part) => part.type === name)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

/** Fail closed when best-by evidence is missing, malformed or older than today.
 * @param {Lot} lot Untrusted source lot.
 * @param {string} asOfDate Date for shipment.
 * @return {boolean} True if automatic allocation can safely proceed.
 */
export function lotEligibleForAutomaticDelivery(
  lot: Lot,
  asOfDate: string,
): boolean {
  const bestBy = text(lot.bestBy);
  if (
    !["Available", "Low stock"].includes(text(lot.status)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(bestBy) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)
  ) {
    return false;
  }
  const parsed = new Date(bestBy + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === bestBy &&
    bestBy >= asOfDate;
}
