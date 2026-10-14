import {createHash} from "node:crypto";

type Row = Record<string, unknown>;
export type NotificationCandidate = {
  id: string;
  kind: string;
  sourcePath: string;
  sourceRecordId: string;
  eventId: string;
  occurredAt: string;
  status: "Review required";
  transportEnabled: false;
  reason: string;
};

const record = (value: unknown): value is Row =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const rows = (value: unknown): Row[] =>
  record(value) && Array.isArray(value.items) ?
    value.items.filter(record) : [];
const stamp = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

/**
 * Detect new persisted transitions, never turn browser notifications into mail.
 * The legacy shards are client-writable: these are review candidates, NOT
 * authorized sends. No address, HR data, financial amount or body is copied.
 * @param {string} sourcePath Persisted shard path.
 * @param {unknown} before Previous document.
 * @param {unknown} after Current document.
 * @param {string} eventId Firestore event identity, stable across retries.
 * @param {string} occurredAt Firestore event time, not a browser timestamp.
 * @return {NotificationCandidate[]} Deduplicated review-only candidates.
 */
export function notificationCandidates(
  sourcePath: string,
  before: unknown,
  after: unknown,
  eventId: string,
  occurredAt: string,
): NotificationCandidate[] {
  if (!eventId || !stamp(occurredAt) || !record(before) || !record(after)) {
    // First document writes/imports are deliberately not a historical replay.
    return [];
  }
  const prior = new Map(rows(before).map((row) => [row.id, row]));
  const result = new Map<string, NotificationCandidate>();
  for (const row of rows(after)) {
    if (typeof row.id !== "string" || !row.id || row.id.length > 200) continue;
    const old = prior.get(row.id);
    let kind = "";
    if (sourcePath === "domains/commercial/fields/orders" && old &&
        old.status !== row.status && row.status === "Approved") {
      kind = "order_approved";
    } else if (sourcePath === "domains/delivery/fields/tasks" && old &&
        old.status !== row.status) {
      if (row.status === "In transit" && stamp(row.departedAt)) {
        kind = "order_out_for_delivery";
      }
      if (row.status === "Delivered" && stamp(row.deliveredAt)) {
        kind = "order_delivered";
      }
    } else if (sourcePath === "domains/delivery/fields/overrides" && !old &&
        row.status === "Delivered" && stamp(row.deliveredAt)) {
      kind = "order_delivered";
    } else if (sourcePath === "domains/commerce/fields/payments" &&
        row.status === "Cleared" && old?.status !== "Cleared" &&
        stamp(row.settledAt) && row.settledBy !== "system" &&
        typeof row.amount === "number" && row.amount > 0) {
      kind = "payment_received";
    } else if (sourcePath === "domains/commerce/fields/invoices" &&
        row.status === "Open" && (!old || old.status === "Draft") &&
        stamp(row.issuedAt)) {
      kind = "invoice_issued";
    }
    if (!kind) continue;
    const id = createHash("sha256").update(JSON.stringify([
      sourcePath, row.id, kind, eventId,
    ])).digest("hex");
    result.set(id, {
      id, kind, sourcePath, sourceRecordId: row.id, eventId, occurredAt,
      status: "Review required", transportEnabled: false,
      reason: "Verify source, current recipient, access and email policy " +
        "before authorizing a future send. Preview cannot be sent or replayed.",
    });
  }
  return [...result.values()];
}
