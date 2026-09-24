from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def replace_once(path:str,old:str,new:str):
    target=ROOT/path
    text=target.read_text()
    count=text.count(old)
    if count!=1:
        raise SystemExit(f"expected one match in {path}, found {count}: {old[:150]!r}")
    target.write_text(text.replace(old,new,1))
    print(f"patched {path}")

# Actor provenance fields are control metadata. They may authenticate the title actor,
# but should not pollute the human-readable change description.
replace_once(
    "lib/notification-engine.ts",
    'const ignoredNotificationFields = new Set(["id", "updatedAt", "createdAt", "readBy", "acknowledgedBy", "passwordChangedAt", "provisionedAt"]);',
    'const ignoredNotificationFields = new Set(["id", "updatedAt", "createdAt", "readBy", "acknowledgedBy", "passwordChangedAt", "provisionedAt", "createdBy", "submittedBy", "requesterId", "actorId", "updatedBy", "changedBy", "decidedBy", "approvedBy", "fulfilledBy", "reviewedBy", "resolvedBy", "returnedBy", "cancelledBy", "deletedBy", "approverId", "assignedBy", "claimedBy", "completedBy"]);',
)

# This copy test intentionally names Director, so make the event prove who performed
# the update instead of relying on a bare actorId that could have been viewer-derived.
replace_once(
    "tests/notification-copy.test.ts",
    '  changes: [{ field: "startTime", before: "13:00", after: "14:00" }],',
    '  changes: [{ field: "startTime", before: "13:00", after: "14:00" }, { field: "updatedBy", after: "usr-mia" }],',
)

# Passive remote hydration uses the System fallback in production. The regression
# must model that path, then prove a stale requester cannot become the actor.
replace_once(
    "tests/platform-critical-invariants.test.ts",
    'const events=diffAuditableRecords(before,after,{id:"viewer-mia",role:"Administrator"},"2026-09-24T18:00:00.000Z",[]);',
    'const events=diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-09-24T18:00:00.000Z",[]);',
)

print("actor provenance test fixtures aligned")
