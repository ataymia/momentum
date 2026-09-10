import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

function filesUnder(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.(?:ts|tsx)$/.test(path) ? [path] : [];
  });
}

test("every business-data localStorage key is covered by demo reset or explicitly retained", () => {
  const repoRoot = new URL("../", import.meta.url).pathname;
  const files = [...filesUnder(join(repoRoot, "lib")), ...filesUnder(join(repoRoot, "components"))];
  const settings = readFileSync(join(repoRoot, "components/pages/settings-v3.tsx"), "utf8");
  const intentionallyRetained = new Map<string, string>([
    ["momentum-demo-session-v2", "Resetting business data should not silently impersonate or sign out the current demo reviewer."],
    ["momentum-sidebar-collapsed-v1", "Sidebar collapse is a UI preference, not business data."],
    ["momentum-runtime-mode-v1", "Runtime mode must survive a demo-data reset so production mode cannot be changed by clearing demo data."],
    ["momentum-presentation-seed-2026-08-31", "One-time presentation seed marker is demo boot metadata, not a business ledger."],
  ]);
  const discovered = new Map<string, string>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const declarations = [...source.matchAll(/(?:export\s+)?const\s+([A-Z0-9_]+)\s*=\s*["'](momentum-[^"']+)["']/g)];
    for (const [, name, value] of declarations) {
      const usedByStorage = new RegExp(`localStorage\\.(?:get|set|remove)Item\\(\\s*${name}\\b`).test(source);
      if (usedByStorage) discovered.set(value, `${relative(repoRoot, file)}:${name}`);
    }
  }

  const uncovered = [...discovered.entries()].filter(([value, origin]) => {
    if (intentionallyRetained.has(value)) return false;
    return !settings.includes(value) && !settings.includes(origin.split(":").at(-1)!);
  });
  assert.deepEqual(uncovered, [], `Business-data stores missing from Settings reset: ${uncovered.map(([key, origin]) => `${key} (${origin})`).join(", ")}`);

  for (const [key, reason] of intentionallyRetained) {
    assert.ok(discovered.has(key), `Retained-key allowlist is stale: ${key}. Rationale: ${reason}`);
  }
});

test("reset explicitly clears transient record-focus and order-intent session state", () => {
  const source = readFileSync(new URL("../components/pages/settings-v3.tsx", import.meta.url), "utf8");
  for (const key of ["momentum-focus-record", "momentum-order-intent", "momentum-order-product", "momentum-order-source-placement", "momentum-people-tab"]) assert.match(source, new RegExp(key));
});
