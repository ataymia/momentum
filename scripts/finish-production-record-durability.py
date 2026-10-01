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

# Add permanent regressions for the production incident and attribution requirement.
p = Path("tests/production-record-consistency.test.ts")
s = p.read_text()
anchor = 'test("Delivery Driver invoice access is read-only in the persistence domain",()=>{'
insert = '''test("critical approval and fulfillment changes enter persistence before cloud confirmation is checked",()=>{\n  const commercial=readFileSync("lib/workspace-context.tsx","utf8");\n  const base=readFileSync("lib/workspace-context-v5.tsx","utf8");\n  assert.match(commercial,/const commitCommercialState =/);\n  assert.match(commercial,/momentumStorage\\.setItem\\(COMMERCIAL_KEY, JSON\\.stringify\\(next\\)\\)/);\n  assert.match(commercial,/void commitCommercialState\\(next\\)/);\n  assert.match(base,/const commitWorkspaceData =/);\n  assert.match(base,/momentumStorage\\.setItem\\(DATA_KEY, JSON\\.stringify\\(next\\)\\)/);\n  assert.match(base,/void commitWorkspaceData\\(next\\)/);\n});\n\ntest("approval review identifies the original order creator separately from later approval submitters",()=>{\n  const work=readFileSync("components/pages/work-v2.tsx","utf8");\n  assert.match(work,/Placed by/);\n  assert.match(work,/Approval submitted by/);\n  assert.match(work,/Sales credit/);\n  assert.match(work,/linkedOrder\\.ownerId/);\n  assert.match(work,/flushAndConfirm\\(COMMERCIAL_KEY\\)/);\n});\n\n'''
if 'critical approval and fulfillment changes enter persistence' not in s:
    if anchor not in s:
        raise SystemExit("Regression test insertion anchor not found")
    p.write_text(s.replace(anchor, insert + anchor, 1))

print("Production record durability finish patch applied.")
