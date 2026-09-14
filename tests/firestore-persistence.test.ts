import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "test.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "momentum-test";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "momentum-test.appspot.com";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "1";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:1:web:1";

// Minimal browser surface so the persistence layer believes it runs in a tab.
const sessionStore = new Map<string, string>();
sessionStore.set("momentum-firebase-session-v1", JSON.stringify({ uid: "admin", email: "admin@example.com", idToken: "token", refreshToken: "refresh", expiresAt: Date.now() + 3_600_000 }));
const fakeWindow = {
  sessionStorage: { getItem: (key: string) => sessionStore.get(key) ?? null, setItem: (key: string, value: string) => void sessionStore.set(key, value), removeItem: (key: string) => void sessionStore.delete(key) },
  localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  setTimeout: () => 0, clearTimeout: () => undefined, setInterval: () => 0, clearInterval: () => undefined,
  addEventListener: () => undefined, removeEventListener: () => undefined,
};
(globalThis as unknown as { window: unknown }).window = fakeWindow;
(globalThis as unknown as { document: unknown }).document = { addEventListener: () => undefined, removeEventListener: () => undefined, visibilityState: "visible" };

// ---------------------------------------------------------------------------
// In-memory Firestore REST fake: documents, batchGet, commit with preconditions + updateMask.
// ---------------------------------------------------------------------------
type StoredDoc = { fields: Record<string, unknown>; updateTime: string };
const root = "projects/momentum-test/databases/(default)/documents";
const server = new Map<string, StoredDoc>();
let clock = 0;
const stamp = () => `2026-01-01T00:00:${String(clock++).padStart(2, "0")}Z`;
const relative = (name: string) => name.startsWith(`${root}/`) ? name.slice(root.length + 1) : name;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const failure = (status: number, code: string, message: string) => json({ error: { code: status, status: code, message } }, status);

function encodeItems(items: unknown[]) { return { items: { arrayValue: { values: items.map((item) => ({ mapValue: { fields: Object.fromEntries(Object.entries(item as Record<string, string>).map(([key, value]) => [key, { stringValue: value }])) } })) } } }; }
export function seedServer(path: string, fields: Record<string, unknown>) { server.set(path, { fields, updateTime: stamp() }); }
function setNested(target: Record<string, unknown>, segments: string[], value: unknown) {
  const [head, ...rest] = segments;
  if (rest.length === 0) { target[head] = value; return; }
  const current = (target[head] as { mapValue?: { fields?: Record<string, unknown> } } | undefined) ?? { mapValue: { fields: {} } };
  const mapValue = current.mapValue ?? { fields: {} };
  const fields = mapValue.fields ?? {};
  setNested(fields, rest, value);
  target[head] = { mapValue: { fields } };
}
function readNested(source: Record<string, unknown>, segments: string[]): unknown {
  const [head, ...rest] = segments;
  const value = source[head] as { mapValue?: { fields?: Record<string, unknown> } } | undefined;
  if (rest.length === 0) return value;
  return value?.mapValue?.fields ? readNested(value.mapValue.fields, rest) : undefined;
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  if (url.endsWith(":batchGet")) {
    return json((body.documents as string[]).map((name) => { const doc = server.get(relative(name)); return doc ? { found: { name, fields: doc.fields, updateTime: doc.updateTime } } : { missing: name }; }));
  }
  if (url.endsWith(":commit")) {
    const writes = body.writes as Array<{ update?: { name: string; fields: Record<string, unknown> }; delete?: string; currentDocument?: { exists?: boolean; updateTime?: string }; updateMask?: { fieldPaths: string[] } }>;
    for (const write of writes) {
      const path = relative(write.update?.name ?? write.delete ?? "");
      const existing = server.get(path);
      if (write.currentDocument?.exists === false && existing) return failure(409, "ALREADY_EXISTS", `Document already exists: ${path}`);
      if (write.currentDocument?.updateTime && existing?.updateTime !== write.currentDocument.updateTime) return failure(400, "FAILED_PRECONDITION", `the stored version (${existing?.updateTime}) does not match the required base version (${write.currentDocument.updateTime})`);
    }
    const results: Array<{ updateTime: string }> = [];
    const commitTime = stamp();
    for (const write of writes) {
      if (write.delete) { server.delete(relative(write.delete)); results.push({ updateTime: commitTime }); continue; }
      const path = relative(write.update!.name);
      if (write.updateMask) {
        const fields = { ...(server.get(path)?.fields ?? {}) };
        for (const fieldPath of write.updateMask.fieldPaths) { const segments = fieldPath.split("."); setNested(fields, segments, readNested(write.update!.fields, segments)); }
        server.set(path, { fields, updateTime: commitTime });
      } else server.set(path, { fields: write.update!.fields, updateTime: commitTime });
      results.push({ updateTime: commitTime });
    }
    return json({ writeResults: results, commitTime });
  }
  const match = /\/v1\/(projects\/[^?]+)/.exec(url);
  if (match && (!init?.method || init.method === "GET")) {
    const doc = server.get(relative(decodeURIComponent(match[1])));
    return doc ? json({ name: match[1], fields: doc.fields, updateTime: doc.updateTime }) : failure(404, "NOT_FOUND", "missing");
  }
  return failure(500, "UNIMPLEMENTED", `fake firestore: ${url}`);
}) as typeof fetch;

const { attachFirestorePersistence, detachFirestorePersistence, getSyncStatus, momentumStorage, subscribeStorageKey } = await import("../lib/persistence");
const { buildPersistenceScope } = await import("../lib/firebase-access");
const { sharedDocPath, userDocPath } = await import("../lib/firestore-domains");
type WorkspaceUser = import("../lib/types").WorkspaceUser;

const user = (id: string, role: WorkspaceUser["role"], team: WorkspaceUser["team"], managerId?: string): WorkspaceUser => ({ id, name: id, firstName: id, email: `${id}@example.com`, initials: "XX", title: role, role, team, managerId, accent: "#000" });
const directory = [user("admin", "Administrator", "Leadership"), user("rep", "Sales Representative", "Sales", "admin")];
const adminScope = () => buildPersistenceScope({ uid: "admin", email: "admin@example.com", role: "Administrator", team: "Leadership", accountState: "Active", updatedAt: "", updatedBy: "" }, directory);
const repScope = () => buildPersistenceScope({ uid: "rep", email: "rep@example.com", role: "Sales Representative", team: "Sales", managerId: "admin", accountState: "Active", updatedAt: "", updatedBy: "" }, directory);
const decodeItems = (doc: StoredDoc | undefined) => ((doc?.fields.items as { arrayValue: { values: Array<{ mapValue: { fields: Record<string, { stringValue: string }> } }> } } | undefined)?.arrayValue.values ?? []).map((value) => Object.fromEntries(Object.entries(value.mapValue.fields).map(([key, item]) => [key, item.stringValue])));

const CRM = "momentum-crm-v1";
const HCM = "momentum-hcm-v4";

test("Firestore persistence primes an empty tenancy, shards engine state on flush, and bumps change-detection versions", async () => {
  server.clear();
  await attachFirestorePersistence({ scope: adminScope(), onDirectoryChange: () => undefined });
  assert.equal(momentumStorage.mode(), "firestore");
  assert.equal(momentumStorage.getItem(CRM), null);

  momentumStorage.setItem(CRM, JSON.stringify({ version: 1, contacts: [{ id: "c1", name: "Ada" }], interactions: [], opportunities: [], responsibilityHistory: [] }));
  assert.equal(getSyncStatus().pending, 1);
  await momentumStorage.flush();

  assert.deepEqual(decodeItems(server.get(sharedDocPath("crm", "contacts"))), [{ id: "c1", name: "Ada" }]);
  assert.ok(server.has(sharedDocPath("crm", "_root")), "scalar remainder is stored under _root");
  assert.equal(server.has(sharedDocPath("crm", "interactions")), false, "empty fields do not create documents");
  const meta = server.get("platform/meta");
  assert.ok(meta && readNested(meta.fields, ["versions", "domains_crm_fields_contacts"]), "meta version bumped for the written document");
  assert.equal(getSyncStatus().pending, 0);
  assert.equal(getSyncStatus().lastError, undefined);
  await detachFirestorePersistence();
});

test("Concurrent edits fail the precondition, merge record-by-record, republish to subscribers, and re-flush", async () => {
  server.clear();
  seedServer(sharedDocPath("crm", "contacts"), encodeItems([{ id: "c1", name: "Ada" }]));
  seedServer(sharedDocPath("crm", "_root"), { data: { mapValue: { fields: { version: { integerValue: "1" } } } } });
  await attachFirestorePersistence({ scope: adminScope(), onDirectoryChange: () => undefined });
  const loaded = JSON.parse(momentumStorage.getItem(CRM)!) as { contacts: Array<{ id: string }> };
  assert.deepEqual(loaded.contacts.map((item) => item.id), ["c1"]);

  let notified = 0;
  const unsubscribe = subscribeStorageKey(CRM, () => { notified += 1; });
  // Another employee adds c2 behind our back.
  seedServer(sharedDocPath("crm", "contacts"), encodeItems([{ id: "c1", name: "Ada" }, { id: "c2", name: "Grace" }]));
  // We add c3 and rename c1 locally.
  momentumStorage.setItem(CRM, JSON.stringify({ ...loaded, contacts: [{ id: "c3", name: "Linus" }, { id: "c1", name: "Ada L." }] }));
  await momentumStorage.flush();

  const merged = decodeItems(server.get(sharedDocPath("crm", "contacts")));
  assert.deepEqual(merged.map((item) => item.id), ["c2", "c3", "c1"]);
  assert.equal(merged.find((item) => item.id === "c1")?.name, "Ada L.");
  assert.ok(notified >= 1, "engine is told to re-read the merged state");
  assert.deepEqual((JSON.parse(momentumStorage.getItem(CRM)!) as { contacts: Array<{ id: string }> }).contacts.map((item) => item.id), ["c2", "c3", "c1"]);
  assert.ok(getSyncStatus().conflicts >= 1);
  assert.equal(getSyncStatus().lastError, undefined);
  unsubscribe();
  await detachFirestorePersistence();
});

test("Employees only write their own permitted shards; management decisions and other users' data are never sent", async () => {
  server.clear();
  await attachFirestorePersistence({ scope: repScope(), onDirectoryChange: () => undefined });
  momentumStorage.setItem(HCM, JSON.stringify({
    version: 4,
    employees: [{ userId: "rep", employeeNumber: "MD-0001" }],
    privateProfiles: [{ userId: "rep", phone: "555" }, { userId: "admin", phone: "000" }],
    compensation: [{ id: "comp-forged", userId: "rep", rate: "999" }],
    audit: [{ id: "a1", actorId: "rep", action: "Updated profile" }],
  }));
  await momentumStorage.flush();

  assert.deepEqual(decodeItems(server.get(userDocPath("rep", "hcm", "privateProfiles"))), [{ userId: "rep", phone: "555" }]);
  assert.equal(server.has(userDocPath("admin", "hcm", "privateProfiles")), false, "another user's shard is not written");
  assert.equal(server.has(userDocPath("rep", "hcm", "compensation")), false, "an employee cannot author their own compensation");
  assert.equal(server.has(sharedDocPath("hcm", "employees")), false, "shared HCM records are management-only");
  assert.deepEqual(decodeItems(server.get(userDocPath("rep", "hcm", "audit"))), [{ id: "a1", actorId: "rep", action: "Updated profile" }]);
  assert.equal(getSyncStatus().lastError, undefined);
  await detachFirestorePersistence();
  assert.equal(momentumStorage.mode(), "local");
});
