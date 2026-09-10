import { readFileSync } from "node:fs";

const checklistUrl = new URL("../docs/PRODUCTION_LAUNCH_CHECKLIST.md", import.meta.url);
const source = readFileSync(checklistUrl, "utf8");
const rows = [...source.matchAll(/^- \[([ x])\] ((?:INT|EXT)-[A-Z0-9-]+)\s+(.+)$/gm)].map((match) => ({
  checked: match[1] === "x",
  id: match[2],
  description: match[3].trim(),
}));

if (!rows.length) throw new Error("No INT/EXT launch checklist items were found.");
const ids = rows.map((row) => row.id);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) throw new Error(`Duplicate launch checklist IDs: ${duplicateIds.join(", ")}`);

const internal = rows.filter((row) => row.id.startsWith("INT-"));
const external = rows.filter((row) => row.id.startsWith("EXT-"));
if (!internal.length || !external.length) throw new Error("Launch checklist must contain both INT and EXT items.");

const internalDone = internal.filter((row) => row.checked).length;
const externalDone = external.filter((row) => row.checked).length;
const internalContribution = (internalDone / internal.length) * 90;
const externalContribution = (externalDone / external.length) * 10;
const overall = internalContribution + externalContribution;
const openInternal = internal.filter((row) => !row.checked);

const result = {
  internal: { complete: internalDone, total: internal.length, contribution: Number(internalContribution.toFixed(2)) },
  external: { complete: externalDone, total: external.length, contribution: Number(externalContribution.toFixed(2)) },
  overall: Number(overall.toFixed(2)),
  integrationReady: internalDone === internal.length,
  openInternal: openInternal.map(({ id, description }) => ({ id, description })),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Internal product layer: ${internalDone}/${internal.length} = ${internalContribution.toFixed(1)} / 90 points`);
  console.log(`External integrations: ${externalDone}/${external.length} = ${externalContribution.toFixed(1)} / 10 points`);
  console.log(`Overall production readiness: ${overall.toFixed(1)}%`);
  console.log(`Integration-ready internal layer: ${result.integrationReady ? "YES" : "NO"}`);
  if (openInternal.length) {
    console.log("Open internal items:");
    for (const item of openInternal) console.log(`- ${item.id} ${item.description}`);
  }
}
