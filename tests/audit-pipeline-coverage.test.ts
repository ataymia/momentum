import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path:string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("AuditProvider snapshots every material record engine upstream of notifications", () => {
  const audit = source("../lib/audit-context.tsx");
  const expected = [
    ["Workspace", "data"],
    ["CRM", "crm"],
    ["HCM", "hcm"],
    ["Payroll", "payroll"],
    ["Performance", "performance"],
    ["Commerce", "commerce"],
    ["Inventory", "ledger"],
    ["Finance", "finance"],
    ["Accounting", "accounting"],
    ["Marketing", "marketing"],
    ["Period locks", "periodLocks"],
    ["Field tracking", "auditableFieldTracking"],
  ] as const;
  for (const [module, variable] of expected) {
    assert.match(audit, new RegExp(`collectAuditableRecords\\(\\"${module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\",\\s*${variable}\\)`), `${module} is missing from common audit snapshots`);
  }
});

test("material field-control events are audited while high-frequency route samples remain source telemetry", () => {
  const audit = source("../lib/audit-context.tsx");
  for (const collection of ["geofences", "sessions", "appointmentEvents", "exceptions", "departureAlerts"]) assert.match(audit, new RegExp(`${collection}: fieldTracking\\.${collection}`));
  assert.doesNotMatch(audit, /samples:\s*fieldTracking\.samples/, "Route sampling should not generate an audit event for every GPS sample");
  const tracking = source("../lib/location-tracking-engine.ts");
  assert.match(tracking, /samples:/, "Route samples must still remain in the source tracking ledger");
});

test("notification policy and runtime-mode mutations create actor-bound manual audit events", () => {
  const notifications = source("../lib/notification-context-v2.tsx");
  assert.match(notifications, /recordManualAudit\(\{module:\"Notifications\",collection:\"preferences\"/);
  assert.match(notifications, /recordManualAudit\(\{module:\"Notifications\",collection:\"settings\"/);
  assert.doesNotMatch(notifications, /smsNumber[^\n]*changes:\[/, "Audit changes must not persist raw SMS destinations");

  const platform = source("../components/settings/platform-controls.tsx");
  assert.match(platform, /recordManualAudit\(\{module:\"Platform\",collection:\"runtime\"/);
});

test("manual audit callers cannot supply their own actor identity or timestamp", () => {
  const audit = source("../lib/audit-context.tsx");
  const inputStart = audit.indexOf("type ManualAuditInput");
  const inputEnd = audit.indexOf(";", inputStart);
  const inputDefinition = inputStart >= 0 && inputEnd > inputStart ? audit.slice(inputStart, inputEnd + 1) : "";
  assert.ok(inputDefinition, "ManualAuditInput type definition must exist");
  assert.doesNotMatch(inputDefinition, /actorId|actorRole|\bat\s*:/);
  assert.match(audit, /actorId:currentUser\.id/);
  assert.match(audit, /actorRole:currentUser\.role/);
  assert.match(audit, /at:new Date\(\)\.toISOString\(\)/);
});

test("provider topology keeps audit upstream of notification delivery to avoid recursive delivery auditing", () => {
  const app = source("../components/momentum-app.tsx");
  assert.match(app, /<AuditProvider><NotificationProvider>/);
  const engine = source("../lib/audit-engine.ts");
  assert.match(engine, /collection === \"notifications\"/);
});
