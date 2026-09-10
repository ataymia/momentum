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

test("production code does not derive Arizona business dates by truncating UTC ISO timestamps", () => {
  const repoRoot = new URL("../", import.meta.url).pathname;
  const files = [...filesUnder(join(repoRoot, "lib")), ...filesUnder(join(repoRoot, "components")), ...filesUnder(join(repoRoot, "app"))];
  const risky = [
    /\.toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/,
    /\.toISOString\(\)\.substring\(\s*0\s*,\s*10\s*\)/,
    /\.toISOString\(\)\.substr\(\s*0\s*,\s*10\s*\)/,
    /\.toISOString\(\)\.split\(\s*["']T["']\s*\)\s*\[\s*0\s*\]/,
  ];
  const violations = files.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return risky.some((pattern) => pattern.test(source)) ? [relative(repoRoot, file)] : [];
  });
  assert.deepEqual(violations, [], `UTC truncation found in business-date code: ${violations.join(", ")}`);
});

test("company-date source modules use the Arizona calendar helpers", () => {
  const required: [string, RegExp][] = [
    ["../lib/workspace-context-v5.tsx", /arizonaDateKey/],
    ["../lib/workspace-context.tsx", /arizonaDateKey/],
    ["../lib/hcm-engine.ts", /arizonaDateKey/],
    ["../lib/performance-engine.ts", /arizonaDateKey/],
    ["../lib/payroll-engine.ts", /arizonaDateKey/],
    ["../lib/demo-data.ts", /arizonaDateKey/],
    ["../components/pages/dispatch-board.tsx", /arizonaDateKey/],
    ["../components/pages/settings-v3.tsx", /arizonaDateKey/],
    ["../components/pages/people-v2.tsx", /arizonaDateKey/],
    ["../components/hcm/advanced-hcm.tsx", /arizonaDateKey/],
  ];
  for (const [file, pattern] of required) assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), pattern, `${file} must use the Arizona company-date helper`);
});
