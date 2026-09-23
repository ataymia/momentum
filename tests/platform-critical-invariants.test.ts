import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { reconcileApprovals, reconcileOrders } from "../lib/order-approval-engine";
import { mergeDocument } from "../lib/persistence";
import { GOLDEN_EAGLE_SKUS, HISTORICAL_PURCHASE_ORDER_POLICY, PRODUCT_CATALOG_INVENTORY_POLICY, WHOLESALE_BARCODE_POLICY } from "../lib/product-catalog";
import { MAX_PERSISTED_NOTIFICATION_BYTES, MAX_PERSISTED_NOTIFICATION_DELIVERIES, auditEventCreatesNotification, compactNotificationDeliveries } from "../lib/notification-engine";
import { documentReplacesOnWrite } from "../lib/firestore-domains";
import type { Approval, Order } from "../lib/types";

const pending: Approval = {
  id: "apr-1", type: "Order", title: "Review GE-1", detail: "10 cases", requestedBy: "Matt",
  requesterId: "rep", recordId: "ord-1", team: "Sales", submittedAt: "2026-09-23T16:00:00.000Z",
  dueAt: "2026-09-24T16:00:00.000Z", priority: "High", status: "Pending",
};
const order: Order = {
  id: "ord-1", number: "GE-1", accountId: "acc-1", cases: 10, pricePerCase: 24, amount: 240,
  status: "Awaiting approval", placedAt: "2026-09-23", ownerId: "rep", priceBasis: "test", paymentStatus: "Not invoiced",
};

describe("order state can never regress or disappear silently", () => {
  test("one final Administrator approval dominates any stale pending replica", () => {
    const approved: Approval = { ...pending, status: "Approved", decidedBy: "admin-flo", decidedAt: "2026-09-23T16:05:00.000Z" };
    const result = reconcileApprovals([pending], [approved]);
    assert.equal(result.length, 1);
    assert.equal(result[0].status, "Approved");
    assert.equal(reconcileOrders([order], [], result)[0].status, "Approved");
  });

  test("a more advanced fulfillment state cannot be overwritten by a stale order replica", () => {
    const approvedOrder: Order = { ...order, status: "Approved" };
    const deliveredOrder: Order = { ...order, status: "Delivered" };
    const result = reconcileOrders([approvedOrder], [deliveredOrder], []);
    assert.equal(result.length, 1);
    assert.equal(result[0].status, "Delivered");
  });

  test("Firestore merge preserves remote records omitted from a local snapshot", () => {
    const base = { items: [{ id: "a", value: 1 }, { id: "b", value: 1 }] };
    const local = { items: [{ id: "a", value: 2 }] };
    const remote = { items: [{ id: "a", value: 1 }, { id: "b", value: 1 }, { id: "c", value: 1 }] };
    const merged = mergeDocument(base, local, remote) as { items: Array<{ id: string; value: number }> };
    assert.deepEqual(new Set(merged.items.map((item) => item.id)), new Set(["a", "b", "c"]));
    assert.equal(merged.items.find((item) => item.id === "a")?.value, 2);
  });
});

describe("order-entry UI invariants", () => {
  const source = readFileSync(new URL("../components/pages/orders-v3.tsx", import.meta.url), "utf8");
  test("multi-SKU order entry stays enabled", () => {
    assert.match(source, /Add another product/);
    assert.match(source, /lines\.map/);
    assert.match(source, /One Administrator approval/);
  });
  test("there is no 10-case maximum", () => {
    assert.doesNotMatch(source, /max=["'{]?10/);
    assert.match(source, /min=["']1["']/);
  });
  test("submission failure is visible instead of silent", () => {
    assert.match(source, /Nothing was silently submitted/);
  });
});

describe("SKU and inventory master invariants", () => {
  test("canonical SKU names exactly match the approved six-SKU catalog", () => {
    assert.deepEqual(GOLDEN_EAGLE_SKUS.map((sku) => sku.description), [
      "0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",
      "0.25L (8.4oz) Golden Eagle SugarFree (24pack)",
      "0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)",
      "0.25L (8.4oz) Golden Eagle RED Edition (24pack)",
      "0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)",
      "0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)",
    ]);
  });
  test("historical PO quantities are reference only and cannot masquerade as current stock", () => {
    assert.match(HISTORICAL_PURCHASE_ORDER_POLICY, /never populate current on-hand/i);
    assert.match(PRODUCT_CATALOG_INVENTORY_POLICY, /verified physical inventory receipts/i);
    assert.deepEqual(GOLDEN_EAGLE_SKUS.map((sku) => sku.historicalPurchaseOrderCases), [5400, 1890, 945, 945, 540, 0]);
  });
  test("wholesale barcode policy is case-level only", () => {
    assert.match(WHOLESALE_BARCODE_POLICY, /case barcodes only/i);
  });
});

describe("notification bell remains an action queue", () => {
  test("routine audit activity does not create a notification", () => {
    assert.equal(auditEventCreatesNotification({
      id: "audit-1", at: "2026-09-23T16:00:00.000Z", actorId: "rep", actorRole: "Sales Representative",
      action: "Updated", module: "CRM", collection: "interactions", entityType: "CRM.interactions", entityId: "i-1",
      label: "Visit", summary: "Visit updated", sensitivity: "operational", changes: [{ field: "summary", before: "a", after: "b" }],
    }), false);
  });
  test("new pending approvals do create a notification", () => {
    assert.equal(auditEventCreatesNotification({
      id: "audit-2", at: "2026-09-23T16:00:00.000Z", actorId: "rep", actorRole: "Sales Representative",
      action: "Created", module: "Workspace", collection: "approvals", entityType: "Workspace.approvals", entityId: "apr-1",
      label: "Review GE-1", summary: "Approval created", sensitivity: "manager", changes: [{ field: "status", after: "Pending" }],
    }), true);
  });
});

describe("production persistence incident guards", () => {
  test("notification delivery storage is bounded far below the Firestore document ceiling", () => {
    const deliveries = Array.from({ length: 1600 }, (_, index) => ({
      id: `notice-${index}`,
      sourceEventId: `audit-${index}`,
      recipientUserId: "admin",
      channel: "In app" as const,
      title: `Action ${index}`,
      detail: "Requires attention",
      tone: "warning" as const,
      createdAt: new Date(2026, 8, 23, 12, 0, index % 60).toISOString(),
      status: index < 700 ? "Unread" as const : "Read" as const,
    }));
    const compacted = compactNotificationDeliveries(deliveries);
    assert.equal(compacted.length, MAX_PERSISTED_NOTIFICATION_DELIVERIES);
    assert.ok(compacted.every((item) => item.status === "Unread"), "actionable entries are kept ahead of resolved history");
  });

  test("notification delivery storage also respects a byte budget below Firestore's 1 MiB ceiling", () => {
    const deliveries = Array.from({ length: 100 }, (_, index) => ({
      id: `large-${index}`,
      sourceEventId: `audit-large-${index}`,
      recipientUserId: "admin",
      channel: "In app" as const,
      title: `Large action ${index}`,
      detail: "x".repeat(20_000),
      tone: "warning" as const,
      createdAt: new Date(2026, 8, 23, 12, 0, index % 60).toISOString(),
      status: "Unread" as const,
    }));
    const compacted = compactNotificationDeliveries(deliveries);
    const bytes = new TextEncoder().encode(JSON.stringify(compacted)).byteLength;
    assert.ok(bytes <= MAX_PERSISTED_NOTIFICATION_BYTES);
    assert.ok(compacted.length > 0);
  });

  test("notification deliveries may be intentionally replaced while business records remain merge-protected", () => {
    assert.equal(documentReplacesOnWrite("domains/notificationRules/fields/deliveries"), true);
    assert.equal(documentReplacesOnWrite("domains/commercial/fields/orders"), false);
  });

  test("persistence isolates a failed document instead of poisoning unrelated writes and journals pending state", () => {
    const source = readFileSync(new URL("../lib/persistence.ts", import.meta.url), "utf8");
    assert.match(source, /isolateWriteFailures/);
    assert.match(source, /momentum-firestore-pending-v1/);
    assert.match(source, /documentReplacesOnWrite/);
  });

  test("production app exposes cloud sync health and hides sidebar scrollbar chrome", () => {
    const shell = readFileSync(new URL("../components/app-shell-v4.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    assert.match(shell, /SyncStatusPill/);
    assert.match(css, /sidebar__nav::-webkit-scrollbar/);
    assert.match(css, /scrollbar-width:none/);
  });
});
