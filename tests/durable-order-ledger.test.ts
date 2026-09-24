import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

const workspace = readFileSync(new URL("../lib/workspace-context.tsx", import.meta.url), "utf8");
const ordersPage = readFileSync(new URL("../components/pages/orders-v3.tsx", import.meta.url), "utf8");
const durableApi = readFileSync(new URL("../lib/durable-order-api.ts", import.meta.url), "utf8");
const functionSource = readFileSync(new URL("../functions/src/order-ledger.ts", import.meta.url), "utf8");
const functionIndex = readFileSync(new URL("../functions/src/index.ts", import.meta.url), "utf8");
const commercial = readFileSync(new URL("../lib/commercial-state.ts", import.meta.url), "utf8");

describe("durable order submission contract", () => {
  test("order entry waits for Firebase acknowledgement before reporting success", () => {
    assert.match(ordersPage, /await createOrder\(/);
    assert.match(ordersPage, /Saving to Firebase/);
    assert.match(ordersPage, /not durably stored in Firebase/i);
    assert.match(workspace, /await submitDurableOrder\(order,approval\)/);
  });

  test("server uses one Firestore document per order and create semantics", () => {
    assert.match(functionSource, /const ORDER_COLLECTION = "orderRecords"/);
    assert.match(functionSource, /\.doc\(text\(order\.id\)\)/);
    assert.match(functionSource, /await ref\.create\(record\)/);
    assert.match(functionSource, /createdBy: caller\.uid/);
  });

  test("authenticated identity owns submitted records instead of trusting browser attribution", () => {
    assert.match(functionSource, /ownerId = caller\.uid/);
    assert.match(functionSource, /requesterId: caller\.uid/);
    assert.match(functionSource, /creditedRepId: caller\.uid/);
  });

  test("Administrator decisions are transactional and final", () => {
    assert.match(functionSource, /runTransaction/);
    assert.match(functionSource, /Only an active Administrator can decide an order/);
    assert.match(functionSource, /ORDER_ALREADY_DECIDED/);
  });

  test("all production sessions refresh durable orders independently of legacy commercial storage", () => {
    assert.match(workspace, /listDurableOrders\(\)/);
    assert.match(workspace, /window\.setInterval\(refresh, 3_000\)/);
    assert.match(workspace, /durableOrders\.map\(\(record\) => record\.order\)/);
  });

  test("client order service uses the existing Firebase identity token", () => {
    assert.match(durableApi, /currentFirebaseSession\(\)/);
    assert.match(durableApi, /authorization: `Bearer \$\{session\.idToken\}`/);
    assert.match(durableApi, /firebaseFunctionUrl\("submitOrder"\)/);
  });

  test("new Functions are exported for deployment", () => {
    assert.match(functionIndex, /submitOrder, listOrders, decideOrder/);
  });
});

describe("legacy compatibility never deletes a valid order because a directory shard is late", () => {
  test("missing owner profile is not a deletion predicate", () => {
    assert.doesNotMatch(commercial, /\|\| !owner \|\|/);
    assert.match(commercial, /owner\?\.role === "Customer"/);
  });

  test("missing Sales Representative directory entry does not erase attribution", () => {
    assert.doesNotMatch(commercial, /creditedRepId && !salesRepIds\.has/);
    assert.match(commercial, /server ledger binds new Sales Representative submissions/);
  });
});
