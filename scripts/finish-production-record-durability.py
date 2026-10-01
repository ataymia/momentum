from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Finish patch anchor not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


# Approval screen must both cloud-confirm decisions and identify the original order creator.
replace_once(
    "components/pages/work-v2.tsx",
    'import type { Approval, PageKey } from "../../lib/types";\nimport { useWorkspace } from "../../lib/workspace-context";',
    'import type { Approval, PageKey } from "../../lib/types";\nimport { momentumStorage } from "../../lib/persistence";\nimport { COMMERCIAL_KEY, useWorkspace } from "../../lib/workspace-context";',
)
replace_once(
    "components/pages/work-v2.tsx",
    '  const [reviewId,setReviewId]=useState<string|null>(null);\n  const [returnNote,setReturnNote]=useState("");',
    '  const [reviewId,setReviewId]=useState<string|null>(null);\n  const [returnNote,setReturnNote]=useState("");\n  const [decisionError,setDecisionError]=useState("");\n  const [deciding,setDeciding]=useState(false);',
)
replace_once(
    "components/pages/work-v2.tsx",
    '  const reviewAccount=reviewOrder?scope.accounts.find((account)=>account.id===reviewOrder.accountId)??null:null;\n  const reviewTimecard=',
    '  const reviewAccount=reviewOrder?scope.accounts.find((account)=>account.id===reviewOrder.accountId)??null:null;\n  const reviewSalesRep=reviewOrder?data.users.find((user)=>user.role==="Sales Representative"&&user.id===(reviewOrder.creditedRepId??reviewOrder.ownerId))??null:null;\n  const reviewTimecard=',
)
replace_once(
    "components/pages/work-v2.tsx",
    '  const openReview=(id:string)=>{setReviewId(id);setReturnNote("");};\n  const decide=(decision:"Approved"|"Returned")=>{if(!reviewApproval)return;if(reviewApproval.type==="Timecard"&&reviewTimecard){if(decision==="Returned"&&!returnNote.trim())return;if(decision==="Returned")auditReturn(reviewTimecard.id,returnNote);else auditApprove(reviewTimecard.id);decideTimecard(reviewTimecard.id,decision==="Approved"?"Manager approved":"Returned");}else decideApproval(reviewApproval.id,decision);setReviewId(null);setReturnNote("");};',
    '  const openReview=(id:string)=>{setReviewId(id);setReturnNote("");setDecisionError("");};\n  const decide=async(decision:"Approved"|"Returned")=>{if(!reviewApproval||deciding)return;setDecisionError("");if(reviewApproval.type==="Timecard"&&reviewTimecard){if(decision==="Returned"&&!returnNote.trim())return;if(decision==="Returned")auditReturn(reviewTimecard.id,returnNote);else auditApprove(reviewTimecard.id);decideTimecard(reviewTimecard.id,decision==="Approved"?"Manager approved":"Returned");}else{setDeciding(true);decideApproval(reviewApproval.id,decision);const confirmed=await momentumStorage.flushAndConfirm(COMMERCIAL_KEY);setDeciding(false);if(!confirmed.ok){setDecisionError(`This decision is still safely queued on this device and is NOT cloud-confirmed. Do not approve it again. ${confirmed.message??"Check Momentum sync status before leaving this record."}`);return;}}setReviewId(null);setReturnNote("");};',
)
replace_once(
    "components/pages/work-v2.tsx",
    '  const approvalCard=(approval:Approval)=>{const Icon=iconFor(approval.type);const requester=data.users.find((user)=>user.id===approval.requesterId);const allowed=canReviewApproval(data,currentUser,approval);return <article className="approval-card" key={approval.id}>',
    '  const approvalCard=(approval:Approval)=>{const Icon=iconFor(approval.type);const requester=data.users.find((user)=>user.id===approval.requesterId);const linkedOrder=orderApproval(approval.type)?scope.orders.find((order)=>order.id===approval.recordId):undefined;const orderCreator=linkedOrder?data.users.find((user)=>user.id===linkedOrder.ownerId):undefined;const allowed=canReviewApproval(data,currentUser,approval);return <article className="approval-card" key={approval.id}>',
)
replace_once(
    "components/pages/work-v2.tsx",
    '<span>{approval.requestedBy}</span><i/>',
    '<span>{linkedOrder?`Placed by ${orderCreator?.name??linkedOrder.ownerId}`:`Submitted by ${approval.requestedBy}`}</span><i/>',
)
replace_once(
    "components/pages/work-v2.tsx",
    '<div><span>Status</span><strong>{reviewOrder.status}</strong></div><div><span>Approval rule</span><strong>One Administrator decision</strong></div>',
    '<div><span>Status</span><strong>{reviewOrder.status}</strong></div><div><span>Placed by</span><strong>{data.users.find((user)=>user.id===reviewOrder.ownerId)?.name??reviewOrder.ownerId}</strong></div><div><span>Sales credit</span><strong>{reviewSalesRep?.name??"Not recorded on this order"}</strong></div><div><span>Approval submitted by</span><strong>{reviewApproval.requestedBy}</strong></div><div><span>Approval rule</span><strong>One Administrator decision</strong></div>',
)
replace_once(
    "components/pages/work-v2.tsx",
    'disabled={reviewApproval.type==="Timecard"&&!returnNote.trim()} onClick={()=>decide("Returned")}>Return</Button>}{canDecide&&<Button icon={<Check size={15}/>} onClick={()=>decide("Approved")}>Approve</Button>',
    'disabled={deciding||(reviewApproval.type==="Timecard"&&!returnNote.trim())} onClick={()=>void decide("Returned")}>Return</Button>}{canDecide&&<Button icon={<Check size={15}/>} disabled={deciding} onClick={()=>void decide("Approved")}>{deciding?"Saving…":"Approve"}</Button>',
)
replace_once(
    "components/pages/work-v2.tsx",
    '        {!reviewOrder&&!reviewTimecard&&<div className="record-review__section"><AlertTriangle size={20}/><h3>{reviewApproval.type}</h3><p>{reviewApproval.detail}</p></div>}\n      </div>}',
    '        {!reviewOrder&&!reviewTimecard&&<div className="record-review__section"><AlertTriangle size={20}/><h3>{reviewApproval.type}</h3><p>{reviewApproval.detail}</p></div>}\n        {decisionError&&<p className="form-error" role="alert">{decisionError}</p>}\n      </div>}',
)

# Permanent regression coverage for this exact production incident.
test_path = Path("tests/production-record-durability.test.ts")
test_path.write_text('''import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\n\ntest("critical commercial order lifecycle changes enter persistence synchronously",()=>{\n  const source=readFileSync("lib/workspace-context.tsx","utf8");\n  assert.match(source,/const commitCommercialState =/);\n  assert.match(source,/momentumStorage\\.setItem\\(COMMERCIAL_KEY, JSON\\.stringify\\(next\\)\\)/);\n  assert.match(source,/commercialRef\\.current = next/);\n  assert.match(source,/void commitCommercialState\\(next\\)/);\n  assert.match(source,/void commitCommercialState\\(nextCommercial\\)/);\n});\n\ntest("legacy workspace approval and fulfillment mutations use the same durable write boundary",()=>{\n  const source=readFileSync("lib/workspace-context-v5.tsx","utf8");\n  assert.match(source,/const commitWorkspaceData =/);\n  assert.match(source,/momentumStorage\\.setItem\\(DATA_KEY, JSON\\.stringify\\(next\\)\\)/);\n  assert.match(source,/dataRef\\.current = next/);\n  assert.match(source,/void commitWorkspaceData\\(next\\)/);\n});\n\ntest("approval UI waits for cloud confirmation and names the original order creator",()=>{\n  const source=readFileSync("components/pages/work-v2.tsx","utf8");\n  assert.match(source,/flushAndConfirm\\(COMMERCIAL_KEY\\)/);\n  assert.match(source,/Placed by/);\n  assert.match(source,/Approval submitted by/);\n  assert.match(source,/Sales credit/);\n  assert.match(source,/linkedOrder\\.ownerId/);\n});\n\ntest("all primary order surfaces retain creator attribution",()=>{\n  const orders=readFileSync("components/pages/orders-v3.tsx","utf8");\n  const delivery=readFileSync("components/pages/deliveries.tsx","utf8");\n  assert.match(orders,/Placed by/);\n  assert.match(delivery,/Placed by/);\n});\n\ntest("delivery actions require cloud confirmation of delivery inventory and commercial records",()=>{\n  const source=readFileSync("components/pages/deliveries.tsx","utf8");\n  assert.match(source,/flushAndConfirm\\(DELIVERY_STORAGE_KEY\\)/);\n  assert.match(source,/flushAndConfirm\\(INVENTORY_LEDGER_STORAGE_KEY\\)/);\n  assert.match(source,/flushAndConfirm\\(COMMERCIAL_KEY\\)/);\n});\n''')

package_path = Path("package.json")
package = package_path.read_text()
needle = "tests/account-email-management.test.ts tests/delivery-driver.test.ts"
replacement = "tests/account-email-management.test.ts tests/production-record-durability.test.ts tests/delivery-driver.test.ts"
if replacement not in package:
    if needle not in package:
        raise SystemExit("package.json logic test anchor not found")
    package_path.write_text(package.replace(needle, replacement, 1))

print("Production record durability finish patch applied.")
