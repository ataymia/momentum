from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"PATCH FAILED: marker not found in {path}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


# Export the new server-side durable ledger functions.
replace_once(
    "functions/src/index.ts",
    'import {getFirestore} from "firebase-admin/firestore";\n',
    'import {getFirestore} from "firebase-admin/firestore";\n\nexport {submitOrder, listOrders, decideOrder} from "./order-ledger";\n',
)

# Wire the enhanced workspace to the durable ledger.
replace_once(
    "lib/workspace-context.tsx",
    'import { activeFieldAppointmentForUser } from "./field-work-session";\n',
    'import { activeFieldAppointmentForUser } from "./field-work-session";\nimport { decideDurableOrder, listDurableOrders, submitDurableOrder, type DurableOrderRecord } from "./durable-order-api";\n',
)
replace_once(
    "lib/workspace-context.tsx",
    '  createOrder: (order: EnhancedOrderInput) => string | null;\n',
    '  createOrder: (order: EnhancedOrderInput) => Promise<string | null>;\n',
)
replace_once(
    "lib/workspace-context.tsx",
    '  decideApproval: (id: string, decision: "Approved" | "Returned") => void;\n',
    '  decideApproval: (id: string, decision: "Approved" | "Returned") => Promise<boolean>;\n',
)
replace_once(
    "lib/workspace-context.tsx",
    '  const [commercial, setCommercial] = useState<CommercialState>(() => readCommercial(base.data));\n  const [warehouseSession, setWarehouseSession] = useState(false);\n',
    '  const [commercial, setCommercial] = useState<CommercialState>(() => readCommercial(base.data));\n  const [durableOrders, setDurableOrders] = useState<DurableOrderRecord[]>([]);\n  const [warehouseSession, setWarehouseSession] = useState(false);\n\n  // Production orders are refreshed from the authoritative per-order ledger. This path is deliberately\n  // independent of the legacy shared commercial JSON document so an oversized/unrelated shard cannot\n  // make a submitted order invisible to another employee.\n  useEffect(() => {\n    if (demoMode || typeof window === "undefined") { setDurableOrders([]); return; }\n    let active = true;\n    const refresh = () => { void listDurableOrders().then((result) => { if (active && result.ok) setDurableOrders(result.records); }); };\n    refresh();\n    const timer = window.setInterval(refresh, 3_000);\n    window.addEventListener("focus", refresh);\n    document.addEventListener("visibilitychange", refresh);\n    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };\n  }, [demoMode]);\n',
)
replace_once(
    "lib/workspace-context.tsx",
    '    const appointmentIds = new Set(commercial.appointments.map((item) => item.id));\n    const approvals = reconcileApprovals(commercial.approvals, base.data.approvals);\n    const orders = reconcileOrders(commercial.orders, baseOrders, approvals);\n',
    '    const appointmentIds = new Set(commercial.appointments.map((item) => item.id));\n    const durableApprovals = durableOrders.map((record) => record.approval);\n    const approvals = reconcileApprovals(durableApprovals, reconcileApprovals(commercial.approvals, base.data.approvals));\n    const legacyOrders = reconcileOrders(commercial.orders, baseOrders, approvals);\n    const orders = reconcileOrders(durableOrders.map((record) => record.order), legacyOrders, approvals);\n',
)
replace_once(
    "lib/workspace-context.tsx",
    '  }, [base.data, commercial, demoMode]);\n',
    '  }, [base.data, commercial, demoMode, durableOrders]);\n',
)

workspace = read("lib/workspace-context.tsx")
start = workspace.index('  const createOrder = (input: EnhancedOrderInput) => {')
end = workspace.index('\n\n  const decideApproval =', start)
new_create = r'''  const createOrder = async (input: EnhancedOrderInput) => {
    const {accountId}=input;
    if (!currentUser || !["Administrator", "Sales Manager", "Sales Representative", "Customer"].includes(currentUser.role)) return null;
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account || !accountIsVisible(data, currentUser, account)) return null;
    if(currentUser.role==="Sales Representative"&&!documentTerritoryDeviation(account,currentUser.id,"placing an order"))return null;
    const pricing=evaluatePartnerPricing(data,accountId);const price=pricing.currentPricePerCase;
    if(!Number.isFinite(price)||!price||price<=0)return null;
    const supplied=input.lines?.length?input.lines:[{product:input.product?.trim()||data.inventory[0]?.product||"Golden Eagle",cases:input.cases??0,inventoryAvailableAtOrder:input.inventoryAvailableAtOrder,sourcePlacementId:input.sourcePlacementId}];
    const grouped=new Map<string,EnhancedOrderLineInput>();
    for(const candidate of supplied){
      const sku=skuForProductName(candidate.product);
      if(!sku?.active)return null;
      const product=sku.description;const cases=Number(candidate.cases);
      if(!Number.isInteger(cases)||cases<1)return null;
      const key=product.toLowerCase();const existing=grouped.get(key);
      grouped.set(key,{product,cases:(existing?.cases??0)+cases,inventoryAvailableAtOrder:Math.min(existing?.inventoryAvailableAtOrder??Number.POSITIVE_INFINITY,typeof candidate.inventoryAvailableAtOrder==="number"&&Number.isFinite(candidate.inventoryAvailableAtOrder)&&candidate.inventoryAvailableAtOrder>=0?candidate.inventoryAvailableAtOrder:0),sourcePlacementId:candidate.sourcePlacementId??existing?.sourcePlacementId});
    }
    const lineInputs=[...grouped.values()];if(!lineInputs.length)return null;
    const id=uid("ord");const number=`GE-${Date.now().toString().slice(-9)}-${Math.floor(Math.random()*1000).toString().padStart(3,"0")}`;const creditedRepId=currentUser.role==="Sales Representative"?currentUser.id:undefined;
    const priceBasis=pricing.effectiveTier?`Tier ${pricing.effectiveTier} · ${pricing.status}`:pricing.status;
    const lines=lineInputs.map((line,index)=>{
      const sourcePlacement=line.sourcePlacementId?data.placements.find((placement)=>placement.id===line.sourcePlacementId&&placement.accountId===accountId&&productsEquivalent(placement.product,line.product)):undefined;
      const available=Number.isFinite(line.inventoryAvailableAtOrder)?Number(line.inventoryAvailableAtOrder):0;
      return{id:`${id}-line-${index+1}`,product:line.product,cases:line.cases,pricePerCase:price,amount:line.cases*price,inventoryAvailableAtOrder:available,sourcePlacementId:sourcePlacement?.id,lowStockApprovalRequired:available<50};
    });
    const cases=lines.reduce((sum,line)=>sum+line.cases,0);const amount=lines.reduce((sum,line)=>sum+line.amount,0);const lowStock=lines.some((line)=>line.lowStockApprovalRequired);const available=Math.min(...lines.map((line)=>line.inventoryAvailableAtOrder??0));
    const product=lines.length===1?lines[0].product:"Multiple products";
    const order:Order={id,number,accountId,cases,pricePerCase:price,amount,status:"Awaiting approval",placedAt:today(),ownerId:currentUser.id,creditedRepId,sourcePlacementId:lines.length===1?lines[0].sourcePlacementId:undefined,product,inventoryAvailableAtOrder:available,lowStockApprovalRequired:lowStock,priceBasis,paymentStatus:"Not invoiced",lines};
    const lineSummary=lines.map((line)=>`${line.cases} ${line.product}`).join(" · ");
    const approval:Approval={id:uid("apr"),type:lowStock?"Low stock sale":"Order",title:lowStock?`Low-stock approval · ${number}`:`Review order ${number}`,detail:`${lineSummary} · ${cases} total cases · ${account.locationName??account.name}`,requestedBy:currentUser.name,requesterId:currentUser.id,recordId:id,team:currentUser.role==="Customer"?"Sales":currentUser.team,submittedAt:now(),dueAt:new Date(Date.now()+86400000).toISOString(),priority:lowStock?"Urgent":"High",status:"Pending"};

    // An order is not considered submitted until Firebase confirms the dedicated order document exists.
    // The shared commercial state is retained as a compatibility cache only after that durable acknowledgement.
    if(!demoMode){
      const stored=await submitDurableOrder(order,approval);
      if(!stored.ok)return null;
      setDurableOrders((records)=>[stored.record,...records.filter((record)=>record.order.id!==stored.record.order.id)]);
      order=stored.record.order as Order;
      approval=stored.record.approval as Approval;
    }
    setCommercial((state)=>({...state,orders:[order,...state.orders.filter((item)=>item.id!==order.id)],approvals:[approval,...state.approvals.filter((item)=>item.id!==approval.id)],accountPatches:{...state.accountPatches,[accountId]:{...(state.accountPatches[accountId]??{}),stage:"Opening order",lastActivity:`Order request ${number} submitted`}},activities:[{id:uid("act-order"),accountId,type:"order",title:lowStock?"Low-stock order submitted":"Order submitted",detail:`${number} · ${lineSummary} · ${cases} total cases · ${price.toFixed(2)}/case.`,at:now(),userId:currentUser.id},...state.activities]}));
    return id;
  };'''
# Need mutable order/approval because server normalizes authority fields.
new_create = new_create.replace('    const order:Order=', '    let order:Order=').replace('    const approval:Approval=', '    let approval:Approval=')
workspace = workspace[:start] + new_create + workspace[end:]
write("lib/workspace-context.tsx", workspace)

workspace = read("lib/workspace-context.tsx")
start = workspace.index('  const decideApproval = (id: string, decision: "Approved" | "Returned") => {')
end = workspace.index('\n\n  const setOrderStatus =', start)
new_decide = r'''  const decideApproval = async (id: string, decision: "Approved" | "Returned") => {
    const approval = data.approvals.find((item) => item.id === id);
    if (!approval) return false;
    if (!currentUser || approval.status !== "Pending" || !canReviewApproval(data, currentUser, approval)) return false;
    if(approval.type==="Territory exception"){
      let returnReason="";
      if(decision==="Returned"){
        if(typeof window==="undefined")return false;
        returnReason=window.prompt("Why is this territory exception being returned? This note will be kept with the account history.")?.trim()??"";
        if(returnReason.length<3)return false;
      }
      const accountId=approval.recordId;
      setCommercial((state)=>({...state,approvals:state.approvals.map((item)=>item.id===id?{...item,status:decision}:item),activities:accountId?[{id:uid("act-territory-review"),accountId,type:"note",title:decision==="Approved"?"Territory exception validated":"Territory exception returned",detail:decision==="Approved"?`${approval.detail} Reviewed and approved by ${currentUser.name}.`:`${approval.detail} Returned by ${currentUser.name}: ${returnReason}`,at:now(),userId:currentUser.id},...state.activities]:state.activities}));
      return true;
    }
    let returnReason: string | undefined;
    if (decision === "Returned") {
      if (typeof window === "undefined") return false;
      returnReason = window.prompt("What needs to be corrected before this order can be approved?")?.trim();
      if (!returnReason || returnReason.length < 3) return false;
    }
    const durable=durableOrders.find((record)=>record.approval.id===id||record.order.id===approval.recordId);
    let decidedAt=now();
    let decidedApproval:Approval={...approval,status:decision,decidedBy:currentUser.id,decidedAt,returnReason};
    let decidedOrder=data.orders.find((order)=>order.id===approval.recordId);
    if(!demoMode&&durable){
      const stored=await decideDurableOrder(approval.recordId,decision,returnReason);
      if(!stored.ok)return false;
      decidedAt=stored.record.updatedAt;
      decidedApproval=stored.record.approval;
      decidedOrder=stored.record.order;
      setDurableOrders((records)=>records.map((record)=>record.order.id===stored.record.order.id?stored.record:record));
    }
    setCommercial((state) => ({
      ...state,
      approvals: [decidedApproval,...state.approvals.filter((item)=>item.id!==id)],
      orders: decidedOrder?[decidedOrder,...state.orders.filter((order)=>order.id!==decidedOrder!.id)]:state.orders,
      activities: approval.recordId ? [{ id: uid("act-approval"), accountId: decidedOrder?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: decision === "Approved" ? `${approval.title} approved by ${currentUser.name}.` : `${approval.title} returned by ${currentUser.name}: ${returnReason}`, at: decidedAt, userId: currentUser.id }, ...state.activities] : state.activities,
    }));
    return true;
  };'''
workspace = workspace[:start] + new_decide + workspace[end:]
write("lib/workspace-context.tsx", workspace)

# Order entry now waits for durable server acknowledgement and visibly stays busy while submitting.
replace_once(
    "components/pages/orders-v3.tsx",
    ' const[query,setQuery]=useState("");const[selectedId,setSelectedId]=useState(focused?.id??scope.orders[0]?.id??"");const[open,setOpen]=useState(false);const[error,setError]=useState("");\n',
    ' const[query,setQuery]=useState("");const[selectedId,setSelectedId]=useState(focused?.id??scope.orders[0]?.id??"");const[open,setOpen]=useState(false);const[error,setError]=useState("");const[submitting,setSubmitting]=useState(false);\n',
)
orders = read("components/pages/orders-v3.tsx")
old_submit = ' const submit=(e:FormEvent)=>{e.preventDefault();if(!price){setError("Current account pricing must be configured before this order can be submitted.");return}if(!lines.length||lines.some((l)=>!Number.isInteger(l.cases)||l.cases<1)){setError("Every order line needs a whole-number case quantity of at least 1.");return}const id=createOrder({accountId,lines:lines.map((l)=>({...l,inventoryAvailableAtOrder:productInventoryStatus(ledger,data,l.product).available}))});if(!id){setError("Momentum rejected this request. Review the account, pricing, quantities, and permissions. Nothing was silently submitted.");return}setSelectedId(id);setOpen(false);setError("")};'
new_submit = ' const submit=async(e:FormEvent)=>{e.preventDefault();if(submitting)return;if(!price){setError("Current account pricing must be configured before this order can be submitted.");return}if(!lines.length||lines.some((l)=>!Number.isInteger(l.cases)||l.cases<1)){setError("Every order line needs a whole-number case quantity of at least 1.");return}setSubmitting(true);setError("");const id=await createOrder({accountId,lines:lines.map((l)=>({...l,inventoryAvailableAtOrder:productInventoryStatus(ledger,data,l.product).available}))});setSubmitting(false);if(!id){setError("The order was not durably stored in Firebase, so Momentum did not mark it submitted. Keep this draft open and try again after the sync issue is resolved.");return}setSelectedId(id);setOpen(false);setError("")};'
if new_submit not in orders:
    if old_submit not in orders: raise SystemExit("PATCH FAILED: orders submit marker missing")
    orders = orders.replace(old_submit, new_submit, 1)
old_modal = '<Modal open={open} title="Create order request" description="Add as many Golden Eagle SKUs as the customer needs. There is no 10-case maximum. One Administrator approval covers the complete order." onClose={()=>setOpen(false)} wide footer={<><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form="order-v3-form">Submit order</Button></>}'
new_modal = '<Modal open={open} title="Create order request" description="Add as many Golden Eagle SKUs as the customer needs. There is no 10-case maximum. One Administrator approval covers the complete order." onClose={()=>{if(!submitting)setOpen(false)}} wide footer={<><Button variant="ghost" disabled={submitting} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form="order-v3-form" disabled={submitting}>{submitting?"Saving to Firebase…":"Submit order"}</Button></>}'
if new_modal not in orders:
    if old_modal not in orders: raise SystemExit("PATCH FAILED: orders modal marker missing")
    orders = orders.replace(old_modal, new_modal, 1)
write("components/pages/orders-v3.tsx", orders)

# Approval UI waits for the authoritative Administrator decision before closing the review modal.
replace_once(
    "components/pages/work-v2.tsx",
    '  const [returnNote,setReturnNote]=useState("");\n',
    '  const [returnNote,setReturnNote]=useState("");\n  const [decisionBusy,setDecisionBusy]=useState(false);\n',
)
work = read("components/pages/work-v2.tsx")
old = '  const decide=(decision:"Approved"|"Returned")=>{if(!reviewApproval)return;if(reviewApproval.type==="Timecard"&&reviewTimecard){if(decision==="Returned"&&!returnNote.trim())return;if(decision==="Returned")auditReturn(reviewTimecard.id,returnNote);else auditApprove(reviewTimecard.id);decideTimecard(reviewTimecard.id,decision==="Approved"?"Manager approved":"Returned");}else decideApproval(reviewApproval.id,decision);setReviewId(null);setReturnNote("");};'
new = '  const decide=async(decision:"Approved"|"Returned")=>{if(!reviewApproval||decisionBusy)return;if(reviewApproval.type==="Timecard"&&reviewTimecard){if(decision==="Returned"&&!returnNote.trim())return;if(decision==="Returned")auditReturn(reviewTimecard.id,returnNote);else auditApprove(reviewTimecard.id);decideTimecard(reviewTimecard.id,decision==="Approved"?"Manager approved":"Returned");setReviewId(null);setReturnNote("");return;}setDecisionBusy(true);const saved=await decideApproval(reviewApproval.id,decision);setDecisionBusy(false);if(saved){setReviewId(null);setReturnNote("");}};'
if new not in work:
    if old not in work: raise SystemExit("PATCH FAILED: work decision marker missing")
    work = work.replace(old, new, 1)
work = work.replace('disabled={reviewApproval.type==="Timecard"&&!returnNote.trim()} onClick={()=>decide("Returned")}', 'disabled={decisionBusy||(reviewApproval.type==="Timecard"&&!returnNote.trim())} onClick={()=>void decide("Returned")}', 1)
work = work.replace('<Button icon={<Check size={15}/>} onClick={()=>decide("Approved")}>Approve</Button>', '<Button icon={<Check size={15}/>} disabled={decisionBusy} onClick={()=>void decide("Approved")}>{decisionBusy?"Saving…":"Approve"}</Button>', 1)
write("components/pages/work-v2.tsx", work)

# CSV order import uses the same durable acknowledgement instead of treating a Promise as a successful id.
exchange = read("components/settings/data-exchange-center.tsx")
exchange = exchange.replace('  const commitImport=()=>{', '  const commitImport=async()=>{', 1)
old = 'const id=createOrder({accountId:record.accountId,cases:record.cases,product:record.product,inventoryAvailableAtOrder:available});if(!id)'
new = 'const id=await createOrder({accountId:record.accountId,cases:record.cases,product:record.product,inventoryAvailableAtOrder:available});if(!id)'
if new not in exchange:
    if old not in exchange: raise SystemExit("PATCH FAILED: CSV order marker missing")
    exchange = exchange.replace(old, new, 1)
write("components/settings/data-exchange-center.tsx", exchange)

print("PASS: durable order ledger application patch applied")
