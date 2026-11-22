import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const manifest=JSON.parse(fs.readFileSync("package.json","utf8"));
const commands=[
 manifest.scripts["test:logic"],
 manifest.scripts["test:rules"],
 manifest.scripts["test:storage"],
].join(" ");
const testFiles=fs.readdirSync("tests").filter(file=>file.endsWith(".test.ts"));
const orphaned=testFiles.filter(file=>!commands.includes("tests/"+file));
assert.equal(orphaned.length,0,
 "Existing regression tests silently excluded from CI: "+orphaned.join(", "));

const fullAudit=fs.readFileSync(".github/workflows/platform-exhaustive-browser-audit.yml","utf8");
assert.match(fullAudit,/pull_request:\s*\n\s*branches:\s*\n\s*- main/,
 "Every production PR must run the actual browser journey audit");
assert.match(fullAudit,/push:\s*\n\s*branches:\s*\n\s*- main/,
 "The production main branch must run the actual browser journey audit");
const browser=fs.readFileSync("scripts/platform-exhaustive-browser-audit.mjs","utf8");
for(const needle of [
 'P0 unapproved-issuer invoice prints after off-document warning',
 'P0 browser Back and refresh retain the selected module',
 'window.__momentumTestPrinted',
 'getByRole("button",{name:"Print selected (1)"})',
 'roleChecks',
])assert(browser.includes(needle),"Missing a required browser release check: "+needle);

console.log("RELEASE TEST REGISTRATION: "+testFiles.length+
 " tests registered; full browser audit required for every main PR/push.");

/* This registry check does NOT prove that the browser audit passed or that
 * any live production workflow was tested. GitHub Action evidence is separate. */
