import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = JSON.parse(readFileSync("firebase.json","utf8"));
const smoke = JSON.parse(readFileSync("firebase.architecture-smoke.json","utf8"));
const fallback = rule => rule?.source === "**" && rule?.destination === "/index.html";
assert(source.hosting?.rewrites?.some(fallback),"Production Firebase Hosting configuration must include the SPA entry fallback");
assert(smoke.hosting?.rewrites?.some(fallback),"Local Hosting emulator must test the same fallback rule");

const root = "http://127.0.0.1:5011";
const routes = [
  "/", "/calendar/meetings", "/crm/deals/qa-placeholder",
  "/crm/contacts/qa-placeholder", "/sales/customers/qa-placeholder",
  "/sales/orders/qa-placeholder", "/items/qa-placeholder",
  "/admin/employee-profiles/qa-placeholder", "/portal/orders/qa-placeholder",
];

async function get(path) {
  const response = await fetch(root + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status,200,"Hosting emulator returned "+response.status+" for "+path);
  assert.match(response.headers.get("content-type")??"",/text\/html/i,"Expected an HTML application document for "+path);
  return response.text();
}

const entry = await get("/");
assert.match(entry,/<html[\s>]/i,"Build must emit an HTML entry point");
for (const path of routes.slice(1)) {
  assert.equal(await get(path),entry,"Direct navigation to "+path+" must resolve to the root application HTML");
}
console.log("A04 Hosting emulator SPA fallback: "+routes.length+" routes returned the same static application entry");
