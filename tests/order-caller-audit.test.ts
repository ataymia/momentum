import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function filesUnder(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

test("every UI/import createOrder caller is an audited custody-ledger path", () => {
  const componentsRoot = new URL("../components/", import.meta.url).pathname;
  const callers = filesUnder(componentsRoot)
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(({ source }) => /\bcreateOrder\s*\(\s*\{/.test(source));

  const relative = callers.map(({ path }) => path.slice(componentsRoot.length)).sort();
  assert.deepEqual(relative, ["pages/orders.tsx", "settings/data-exchange-center.tsx"]);

  const orders = callers.find(({ path }) => path.endsWith("pages/orders.tsx"))!.source;
  assert.match(orders, /productInventoryStatus\(ledger\s*,\s*data\s*,\s*form\.product\)/);
  assert.match(orders, /inventoryAvailableAtOrder\s*:\s*stock\?\.available/);
  assert.match(orders, /productInventoryStatus\(ledger\s*,\s*data\s*,\s*product\)\.available/);

  const exchange = callers.find(({ path }) => path.endsWith("settings/data-exchange-center.tsx"))!.source;
  assert.match(exchange, /const available\s*=\s*productInventoryStatus\(ledger\s*,\s*data\s*,\s*record\.product\)\.available/);
  assert.match(exchange, /inventoryAvailableAtOrder\s*:\s*available/);

  const workspace = readFileSync(new URL("../lib/workspace-context.tsx", import.meta.url), "utf8");
  assert.match(workspace, /typeof inventoryAvailableAtOrder !== "number"/);
  assert.match(workspace, /!Number\.isFinite\(inventoryAvailableAtOrder\)/);
  assert.doesNotMatch(workspace, /inventoryAvailableAtOrder\s*\?\?/);
});

test("retail reorder and account order actions route through the audited Orders page instead of creating orders directly", () => {
  for (const file of ["../components/pages/retail.tsx", "../components/pages/accounts.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bcreateOrder\s*\(\s*\{/);
    assert.match(source, /navigate\("orders"\)/);
  }
});
