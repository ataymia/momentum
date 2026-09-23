from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Add a byte ceiling in addition to the record-count ceiling. Firestore rejects
# documents above 1 MiB, so keep the derived bell queue far below that limit.
path = ROOT / "lib/notification-engine.ts"
text = path.read_text()
old = '''export const MAX_PERSISTED_NOTIFICATION_DELIVERIES = 500;
export function compactNotificationDeliveries(deliveries: NotificationDelivery[]): NotificationDelivery[] {
  const seen = new Set<string>();
  const unique: NotificationDelivery[] = [];
  for (const delivery of deliveries) {
    if (!delivery?.id || seen.has(delivery.id)) continue;
    seen.add(delivery.id);
    unique.push(delivery);
  }
  const actionable = unique.filter((delivery) => !["Read", "Sent"].includes(delivery.status));
  const resolved = unique.filter((delivery) => ["Read", "Sent"].includes(delivery.status));
  return [...actionable, ...resolved].slice(0, MAX_PERSISTED_NOTIFICATION_DELIVERIES);
}'''
new = '''export const MAX_PERSISTED_NOTIFICATION_DELIVERIES = 500;
export const MAX_PERSISTED_NOTIFICATION_BYTES = 600_000;
const serializedBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function compactNotificationDeliveries(deliveries: NotificationDelivery[]): NotificationDelivery[] {
  const seen = new Set<string>();
  const unique: NotificationDelivery[] = [];
  for (const delivery of deliveries) {
    if (!delivery?.id || seen.has(delivery.id)) continue;
    seen.add(delivery.id);
    unique.push(delivery);
  }
  const actionable = unique.filter((delivery) => !["Read", "Sent"].includes(delivery.status));
  const resolved = unique.filter((delivery) => ["Read", "Sent"].includes(delivery.status));
  const compacted: NotificationDelivery[] = [];
  for (const delivery of [...actionable, ...resolved]) {
    if (compacted.length >= MAX_PERSISTED_NOTIFICATION_DELIVERIES) break;
    const candidate = [...compacted, delivery];
    if (serializedBytes(candidate) > MAX_PERSISTED_NOTIFICATION_BYTES) continue;
    compacted.push(delivery);
  }
  return compacted;
}'''
if text.count(old) != 1:
    raise SystemExit(f"lib/notification-engine.ts: expected one compaction helper, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))

# Extend the production-incident regression suite with a byte-budget assertion.
path = ROOT / "tests/platform-critical-invariants.test.ts"
text = path.read_text()
old_import = 'import { MAX_PERSISTED_NOTIFICATION_DELIVERIES, auditEventCreatesNotification, compactNotificationDeliveries } from "../lib/notification-engine";'
new_import = 'import { MAX_PERSISTED_NOTIFICATION_BYTES, MAX_PERSISTED_NOTIFICATION_DELIVERIES, auditEventCreatesNotification, compactNotificationDeliveries } from "../lib/notification-engine";'
if text.count(old_import) != 1:
    raise SystemExit(f"tests/platform-critical-invariants.test.ts: expected one notification import, found {text.count(old_import)}")
text = text.replace(old_import, new_import, 1)
marker = '''  test("notification deliveries may be intentionally replaced while business records remain merge-protected", () => {'''
byte_test = '''  test("notification delivery storage also respects a byte budget below Firestore's 1 MiB ceiling", () => {
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

'''
if text.count(marker) != 1:
    raise SystemExit(f"tests/platform-critical-invariants.test.ts: expected one insertion marker, found {text.count(marker)}")
text = text.replace(marker, byte_test + marker, 1)
# Keep exactly one terminal newline so git diff --check remains clean.
path.write_text(text.rstrip() + "\n")

print("PASS: byte-safe notification compaction and EOF cleanup applied")
