import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path:string)=>readFileSync(path,"utf8");

test("order submit waits for the commercial Firestore key to be confirmed",()=>{
  const ui=read("components/pages/orders-v3.tsx");
  const workspace=read("lib/workspace-context.tsx");
  const persistence=read("lib/persistence.ts");
  assert.match(ui,/await momentumStorage\.flushAndConfirm\(COMMERCIAL_KEY\)/);
  assert.match(ui,/Momentum cloud has NOT confirmed it/);
  assert.match(workspace,/momentumStorage\.setItem\(COMMERCIAL_KEY,JSON\.stringify\(nextCommercial\)\)/);
  assert.match(persistence,/async flushAndConfirm\(key:string,timeoutMs:number\)/);
});

test("authoritative Firebase access state gates the live workspace",()=>{
  const app=read("components/momentum-app.tsx");
  const orders=read("components/pages/orders-v3.tsx");
  assert.match(app,/firebase\.access\?\.accountState!=="Active"/);
  assert.match(orders,/firebase\.access\?\.accountState!=="Active"/);
});
