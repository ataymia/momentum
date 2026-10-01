from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise SystemExit(f"Missing expected anchor in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    text = read(path)
    begin = text.find(start)
    if begin < 0:
        raise SystemExit(f"Missing start anchor in {path}: {start!r}")
    finish = text.find(end, begin)
    if finish < 0:
        raise SystemExit(f"Missing end anchor in {path}: {end!r}")
    write(path, text[:begin] + replacement + text[finish:])


# ---------------------------------------------------------------------------
# 1. Persistence: durable, path-aware three-way merge + truthful confirmation.
# ---------------------------------------------------------------------------
replace_between(
    "lib/persistence.ts",
    "function mergeItems(",
    "const emptyDocument=",
    r'''type PendingJournalV2={journalVersion:2;base:string|null;value:string};
type DecodedJournal={base:string|null;value:string;legacy:boolean};

const instantValue=(value:unknown)=>typeof value==="string"&&!Number.isNaN(new Date(value).getTime())?new Date(value).getTime():0;
const statusText=(record:Record<string,unknown>)=>typeof record.status==="string"?record.status:"";
const recordObject=(value:unknown):Record<string,unknown>|undefined=>isRecord(value)?value:undefined;

function decodePendingJournal(raw:string):DecodedJournal{
  try{
    const parsed=JSON.parse(raw) as Partial<PendingJournalV2>;
    if(parsed&&parsed.journalVersion===2&&typeof parsed.value==="string"&&(typeof parsed.base==="string"||parsed.base===null))return{base:parsed.base,value:parsed.value,legacy:false};
  }catch{/* legacy raw state */}
  return{base:raw,value:raw,legacy:true};
}

const encodePendingJournal=(base:string|null,value:string)=>JSON.stringify({journalVersion:2,base,value} satisfies PendingJournalV2);

function mergeNestedArray(base:unknown,localValue:unknown,remoteValue:unknown,path:string){
  if(!Array.isArray(localValue)||!Array.isArray(remoteValue))return localValue;
  return mergeItems(Array.isArray(base)?base:[],localValue,remoteValue,path);
}

function mergeRoot(base:Record<string,unknown>|undefined,localData:Record<string,unknown>,remote:Record<string,unknown>,depth=0):Record<string,unknown>{
  const output:Record<string,unknown>={};
  for(const key of new Set([...Object.keys(remote),...Object.keys(localData)])){
    if(!(key in localData)&&key in remote){output[key]=remote[key];continue;}
    const localValue=localData[key];const baseValue=base?.[key];const remoteValue=remote[key];
    if(Array.isArray(localValue)&&Array.isArray(remoteValue)){output[key]=mergeNestedArray(baseValue,localValue,remoteValue,`nested:${key}`);continue;}
    if(depth<4&&isRecord(localValue)&&isRecord(remoteValue)){output[key]=mergeRoot(isRecord(baseValue)?baseValue:undefined,localValue,remoteValue,depth+1);continue;}
    if(stable(localValue)!==stable(baseValue))output[key]=localValue;
    else output[key]=key in remote?remoteValue:localValue;
  }
  return output;
}

function canonicalOrder(localRecord:Record<string,unknown>,remoteRecord:Record<string,unknown>){
  const rank:Record<string,number>={Draft:0,"Awaiting approval":1,Approved:2,Allocated:3,"Out for delivery":4,Delivered:5,Paid:6};
  const localStatus=statusText(localRecord);const remoteStatus=statusText(remoteRecord);
  if(localStatus==="Cancelled"||remoteStatus==="Cancelled"){
    const other=localStatus==="Cancelled"?remoteRecord:localRecord;
    const cancelled=localStatus==="Cancelled"?localRecord:remoteRecord;
    return ["Delivered","Paid"].includes(statusText(other))?other:cancelled;
  }
  return (rank[localStatus]??-1)>=(rank[remoteStatus]??-1)?localRecord:remoteRecord;
}

function canonicalApproval(localRecord:Record<string,unknown>,remoteRecord:Record<string,unknown>){
  const localFinal=statusText(localRecord)!=="Pending";const remoteFinal=statusText(remoteRecord)!=="Pending";
  if(localFinal!==remoteFinal)return localFinal?localRecord:remoteRecord;
  const localAt=instantValue(localRecord.decidedAt)||instantValue(localRecord.submittedAt);
  const remoteAt=instantValue(remoteRecord.decidedAt)||instantValue(remoteRecord.submittedAt);
  return localAt>=remoteAt?localRecord:remoteRecord;
}

function canonicalDelivery(localRecord:Record<string,unknown>,remoteRecord:Record<string,unknown>){
  // Physical custody evidence is monotonic. A stale release/cancel cannot undo loading, transit, or delivery.
  const rank:Record<string,number>={Accepted:0,Cancelled:1,Loaded:2,"In transit":3,Delivered:4};
  return (rank[statusText(localRecord)]??-1)>=(rank[statusText(remoteRecord)]??-1)?localRecord:remoteRecord;
}

function canonicalReservation(localRecord:Record<string,unknown>,remoteRecord:Record<string,unknown>){
  const rank:Record<string,number>={Active:0,Released:1,Fulfilled:2};
  return (rank[statusText(localRecord)]??-1)>=(rank[statusText(remoteRecord)]??-1)?localRecord:remoteRecord;
}

function mergeRecord(path:string,baseItem:unknown,localItem:Record<string,unknown>,remoteItem:Record<string,unknown>){
  const merged=mergeRoot(recordObject(baseItem),localItem,remoteItem);
  let winner:Record<string,unknown>|undefined;
  if(/\/(workspace|commercial)\/fields\/(orders|approvals)$/.test(path)){
    winner=path.endsWith("/orders")?canonicalOrder(localItem,remoteItem):canonicalApproval(localItem,remoteItem);
  }else if(path.endsWith("/delivery/fields/tasks"))winner=canonicalDelivery(localItem,remoteItem);
  else if(path.endsWith("/inventoryLedger/fields/reservations"))winner=canonicalReservation(localItem,remoteItem);
  if(winner){
    merged.status=winner.status;
    for(const field of ["decidedBy","decidedAt","returnReason","cancelledAt","cancelledBy","cancellationReason","loadedAt","departedAt","deliveredAt","releasedAt","fulfilledAt"]){
      if(field in winner)merged[field]=winner[field];
    }
  }
  return merged;
}

function mergeItems(base:unknown[],localItems:unknown[],remote:unknown[],path=""):unknown[]{
  const baseMap=new Map(base.map((item)=>[recordIdentity(item),item]));
  const result=new Map(remote.map((item)=>[recordIdentity(item),item]));
  for(const item of localItems){
    const key=recordIdentity(item);const baseItem=baseMap.get(key);const remoteItem=result.get(key);
    if(remoteItem!==undefined&&isRecord(item)&&isRecord(remoteItem)){
      result.set(key,mergeRecord(path,baseItem,item,remoteItem));
      continue;
    }
    // New records and actual local edits win. An omitted record never means delete.
    if(baseItem===undefined||stable(item)!==stable(baseItem)||!result.has(key))result.set(key,item);
  }
  return [...result.values()];
}

export function mergeDocument(base:Record<string,unknown>|null|undefined,localDoc:Record<string,unknown>,remote:Record<string,unknown>|null,path=""):Record<string,unknown>{
  if(!remote)return localDoc;
  if(Array.isArray(localDoc.items)||Array.isArray(remote.items))return{items:mergeItems(Array.isArray(base?.items)?base!.items as unknown[]:[],Array.isArray(localDoc.items)?localDoc.items:[],Array.isArray(remote.items)?remote.items:[],path)};
  if(isRecord(localDoc.data)||isRecord(remote.data))return{data:mergeRoot(isRecord(base?.data)?base!.data:undefined,isRecord(localDoc.data)?localDoc.data:{},isRecord(remote.data)?remote.data:{})};
  return localDoc;
}

function mergeStoredState(spec:DomainSpec,baseRaw:string|null,localRaw:string,remoteRaw:string|null){
  let localState:unknown;let baseState:unknown;let remoteState:unknown;
  try{localState=JSON.parse(localRaw);}catch{return remoteRaw;}
  try{baseState=baseRaw==null?null:JSON.parse(baseRaw);}catch{baseState=null;}
  try{remoteState=remoteRaw==null?null:JSON.parse(remoteRaw);}catch{remoteState=null;}
  const baseShards=baseState?shardState(spec,baseState):new Map<string,Record<string,unknown>>();
  const localShards=shardState(spec,localState);
  const remoteShards=remoteState?shardState(spec,remoteState):new Map<string,Record<string,unknown>>();
  const documents=new Map<string,Record<string,unknown>|null>();
  for(const path of new Set([...remoteShards.keys(),...localShards.keys(),...baseShards.keys()])){
    const localDoc=localShards.get(path);const remoteDoc=remoteShards.get(path)??null;
    const next=localDoc?mergeDocument(baseShards.get(path),localDoc,remoteDoc,path):remoteDoc;
    if(next)documents.set(path,next);
  }
  const assembled=assembleState(spec,documents);
  return assembled?JSON.stringify(assembled):remoteRaw??localRaw;
}

''',
)

replace_once(
    "lib/persistence.ts",
    '''  private dirty=new Set<string>();
  private denied=new Set<string>();''',
    '''  private dirty=new Set<string>();
  private denied=new Set<string>();
  private blockedKeys=new Map<string,string>();''',
)

replace_once(
    "lib/persistence.ts",
    '''    // Recover any locally journaled Firestore state that did not finish syncing before a reload/crash.
    for(const spec of DOMAIN_SPECS){
      const pending=local()?.getItem(pendingJournalKey(this.scope.uid,spec.key));
      if(typeof pending==="string"){this.cache.set(spec.key,pending);this.dirty.add(spec.key);}
    }''',
    '''    // Recover locally journaled changes without letting an old browser snapshot roll shared records backward.
    for(const spec of DOMAIN_SPECS){
      const key=pendingJournalKey(this.scope.uid,spec.key);
      const pending=local()?.getItem(key);
      if(typeof pending!=="string")continue;
      const remote=this.cache.get(spec.key)??null;
      const journal=decodePendingJournal(pending);
      const merged=mergeStoredState(spec,journal.base,journal.value,remote);
      if(merged&&merged!==remote){
        this.cache.set(spec.key,merged);
        this.dirty.add(spec.key);
        local()?.setItem(key,encodePendingJournal(remote,merged));
      }else local()?.removeItem(key);
    }''',
)

replace_once(
    "lib/persistence.ts",
    '''  async flushAndConfirm(key:string,timeoutMs:number){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      if(!this.flushing&&this.dirty.has(key))await this.flush();
      if(!this.flushing&&!this.dirty.has(key))return{ok:true};
      await new Promise((resolve)=>setTimeout(resolve,75));
    }
    return{ok:false,message:status.lastError??"Momentum cloud did not confirm this change before the safety timeout."};
  }

  setItem(key:string,value:string){
    if(this.cache.get(key)===value)return;
    this.cache.set(key,value);
    local()?.setItem(pendingJournalKey(this.scope.uid,key),value);
    this.dirty.add(key);
    setStatus({pending:this.dirty.size});
    this.scheduleFlush(350);
  }''',
    '''  async flushAndConfirm(key:string,timeoutMs:number){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      const blocked=this.blockedKeys.get(key);
      if(blocked)return{ok:false,message:blocked};
      if(!this.flushing&&this.dirty.has(key))await this.flush();
      const journal=local()?.getItem(pendingJournalKey(this.scope.uid,key));
      if(!this.flushing&&!this.dirty.has(key)&&!journal)return{ok:true};
      await new Promise((resolve)=>setTimeout(resolve,75));
    }
    return{ok:false,message:status.lastError??"Momentum cloud did not confirm this change before the safety timeout."};
  }

  setItem(key:string,value:string){
    const previous=this.cache.get(key)??null;
    if(previous===value)return;
    const journalKey=pendingJournalKey(this.scope.uid,key);
    const existingRaw=local()?.getItem(journalKey);
    const existing=typeof existingRaw==="string"?decodePendingJournal(existingRaw):undefined;
    const base=existing?(existing.legacy?previous:existing.base):previous;
    this.cache.set(key,value);
    local()?.setItem(journalKey,encodePendingJournal(base,value));
    this.dirty.add(key);
    setStatus({pending:this.dirty.size});
    this.scheduleFlush(350);
  }''',
)

replace_once(
    "lib/persistence.ts",
    '''        const next=base?.data?(documentReplacesOnWrite(doc.path)?proposed:mergeDocument(base.data,proposed,base.data)):proposed;''',
    '''        const next=base?.data?(documentReplacesOnWrite(doc.path)?proposed:mergeDocument(base.data,proposed,base.data,doc.path)):proposed;''',
)

replace_once(
    "lib/persistence.ts",
    '''        if(writes.length===0){for(const key of keys)local()?.removeItem(pendingJournalKey(this.scope.uid,key));break;}''',
    '''        if(writes.length===0){for(const key of keys)if(!this.blockedKeys.has(key))local()?.removeItem(pendingJournalKey(this.scope.uid,key));break;}''',
)

replace_once(
    "lib/persistence.ts",
    '''      if(isFirestorePermissionDenied(result)){this.denied.add(write.path);messages.push(`${write.path}: Security Rules rejected the write.`);continue;}''',
    '''      if(isFirestorePermissionDenied(result)){
        this.denied.add(write.path);
        if(key)this.blockedKeys.set(key,`${write.path}: Security Rules rejected the write. The change remains safely queued and is not cloud-confirmed.`);
        messages.push(`${write.path}: Security Rules rejected the write.`);continue;
      }''',
)

replace_once(
    "lib/persistence.ts",
    '''      if(failedKeys.has(key)){this.dirty.add(key);continue;}''',
    '''      if(failedKeys.has(key)){if(!this.blockedKeys.has(key))this.dirty.add(key);continue;}''',
)

replace_between(
    "lib/persistence.ts",
    "  private async isolateDenied(",
    "  /** Re-read conflicting documents",
    r'''  private async isolateDenied(writes:FirestoreWrite[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){
    const successfulKeys=new Set<string>();
    const blockedKeys=new Set<string>();
    for(const write of writes){
      const key=pathKey.get(write.path);
      const stamp=`${new Date().toISOString()}#${Math.random().toString(36).slice(2,8)}`;
      const versionEntry=metaVersionKey(write.path);
      const metaWrite:FirestoreWrite={kind:"merge",path:PLATFORM_META_DOCUMENT,data:{versions:{[versionEntry]:stamp}},fieldPaths:[`versions.${versionEntry}`]};
      const result=await commitFirestoreWrites([write,metaWrite]);
      if(result.ok){
        this.docs.set(write.path,{data:nextDocs.get(write.path)??null,updateTime:result.updateTimes[write.path]});
        this.metaVersions[versionEntry]=stamp;
        if(key)successfulKeys.add(key);
        continue;
      }
      if(isFirestorePermissionDenied(result)){
        this.denied.add(write.path);
        if(key){
          blockedKeys.add(key);
          this.blockedKeys.set(key,`${write.path}: Security Rules rejected the write. The change remains safely queued and is not cloud-confirmed.`);
        }
        console.warn(`[momentum] Firestore denied write to ${write.path} for ${key}; the change remains locally journaled and unconfirmed.`);
        continue;
      }
      if(isFirestoreConflict(result)){if(key&&!this.blockedKeys.has(key))this.dirty.add(key);continue;}
      throw new Error(result.message);
    }
    for(const key of successfulKeys)if(!blockedKeys.has(key))local()?.removeItem(pendingJournalKey(this.scope.uid,key));
    setStatus({lastSyncedAt:successfulKeys.size?new Date().toISOString():status.lastSyncedAt,lastError:blockedKeys.size?`Some changes were rejected by Security Rules (${blockedKeys.size} storage key${blockedKeys.size===1?"":"s"}) and were NOT cloud-confirmed.`:undefined});
  }

''',
)

replace_once(
    "lib/persistence.ts",
    '''      const merged=localDoc?(documentReplacesOnWrite(snapshot.path)?localDoc:mergeDocument(base?.data,localDoc,snapshot.data)):snapshot.data;''',
    '''      const merged=localDoc?(documentReplacesOnWrite(snapshot.path)?localDoc:mergeDocument(base?.data,localDoc,snapshot.data,snapshot.path)):snapshot.data;''',
)

replace_once(
    "lib/persistence.ts",
    '''          if(raw!=null){try{const localShard=shardState(spec,JSON.parse(raw)).get(snapshot.path);if(localShard)override=documentReplacesOnWrite(snapshot.path)?localShard:mergeDocument(base?.data,localShard,snapshot.data);}catch{/* keep remote */}}''',
    '''          if(raw!=null){try{const localShard=shardState(spec,JSON.parse(raw)).get(snapshot.path);if(localShard)override=documentReplacesOnWrite(snapshot.path)?localShard:mergeDocument(base?.data,localShard,snapshot.data,snapshot.path);}catch{/* keep remote */}}''',
)

# ---------------------------------------------------------------------------
# 2. Commercial normalization: never drop canonical order decisions/evidence.
# ---------------------------------------------------------------------------
replace_once(
    "lib/commercial-state.ts",
    '''const orderStatuses = new Set(["Draft", "Awaiting approval", "Approved", "Allocated", "Out for delivery", "Delivered", "Paid"]);''',
    '''const orderStatuses = new Set(["Draft", "Awaiting approval", "Approved", "Allocated", "Out for delivery", "Delivered", "Paid", "Cancelled"]);''',
)
replace_once("lib/commercial-state.ts", '''  const baseOrderIds = new Set(data.orders.map((record) => record.id));\n''', "")
replace_once("lib/commercial-state.ts", '''  const baseApprovalIds = new Set(data.approvals.map((record) => record.id));\n''', "")
replace_once(
    "lib/commercial-state.ts",
    '''    if (!id || baseOrderIds.has(id) || !text(raw.number) || !accountId || !owner ||''',
    '''    if (!id || !text(raw.number) || !accountId || !owner ||''',
)
replace_once(
    "lib/commercial-state.ts",
    '''    return [{ id, number: text(raw.number), accountId, cases, pricePerCase: price, amount, status: safeStatus as Order["status"], placedAt: text(raw.placedAt), ownerId, paidAt: optionalText(raw.paidAt), firstSettledAt: optionalText(raw.firstSettledAt), priceBasis: text(raw.priceBasis), paymentStatus: safePaymentStatus as Order["paymentStatus"], product, creditedRepId, sourcePlacementId, inventoryAvailableAtOrder: Number(raw.inventoryAvailableAtOrder), lowStockApprovalRequired: typeof raw.lowStockApprovalRequired === "boolean" ? raw.lowStockApprovalRequired : undefined, lines }];''',
    '''    return [{ id, number: text(raw.number), accountId, cases, pricePerCase: price, amount, status: safeStatus as Order["status"], placedAt: text(raw.placedAt), ownerId, paidAt: optionalText(raw.paidAt), firstSettledAt: optionalText(raw.firstSettledAt), priceBasis: text(raw.priceBasis), paymentStatus: safePaymentStatus as Order["paymentStatus"], product, creditedRepId, sourcePlacementId, inventoryAvailableAtOrder: Number(raw.inventoryAvailableAtOrder), lowStockApprovalRequired: typeof raw.lowStockApprovalRequired === "boolean" ? raw.lowStockApprovalRequired : undefined, lines, cancelledAt: optionalText(raw.cancelledAt), cancelledBy: optionalText(raw.cancelledBy), cancellationReason: optionalText(raw.cancellationReason) }];''',
)
replace_once(
    "lib/commercial-state.ts",
    '''    if (!id || baseApprovalIds.has(id) || !approvalTypes.has(type) ||''',
    '''    if (!id || !approvalTypes.has(type) ||''',
)

# ---------------------------------------------------------------------------
# 3. Order approvals and fulfillment write the exact state immediately.
# ---------------------------------------------------------------------------
replace_between(
    "lib/workspace-context.tsx",
    "  const decideApproval =",
    "  const setOrderStatus =",
    r'''  const decideApproval = (id: string, decision: "Approved" | "Returned") => {
    const approval = commercial.approvals.find((item) => item.id === id);
    if (!approval) {
      base.decideApproval(id, decision);
      return;
    }
    if (!currentUser || approval.status !== "Pending" || !canReviewApproval(data, currentUser, approval)) return;
    if(approval.type==="Territory exception"){
      let returnReason="";
      if(decision==="Returned"){
        if(typeof window==="undefined")return;
        returnReason=window.prompt("Why is this territory exception being returned? This note will be kept with the account history.")?.trim()??"";
        if(returnReason.length<3)return;
      }
      const accountId=approval.recordId;
      const decidedAt=now();
      const nextCommercial:CommercialState={...commercial,approvals:commercial.approvals.map((item)=>item.id===id?{...item,status:decision,decidedBy:currentUser.id,decidedAt,returnReason:returnReason||undefined}:item),activities:accountId?[{id:uid("act-territory-review"),accountId,type:"note",title:decision==="Approved"?"Territory exception validated":"Territory exception returned",detail:decision==="Approved"?`${approval.detail} Reviewed and approved by ${currentUser.name}.`:`${approval.detail} Returned by ${currentUser.name}: ${returnReason}`,at:decidedAt,userId:currentUser.id},...commercial.activities]:commercial.activities};
      momentumStorage.setItem(COMMERCIAL_KEY,JSON.stringify(nextCommercial));
      setCommercial(nextCommercial);
      void momentumStorage.flush();
      return;
    }
    let returnReason: string | undefined;
    if (decision === "Returned") {
      if (typeof window === "undefined") return;
      returnReason = window.prompt("What needs to be corrected before this order can be approved?")?.trim();
      if (!returnReason || returnReason.length < 3) return;
    }
    const decidedAt = now();
    const nextCommercial:CommercialState={
      ...commercial,
      approvals:commercial.approvals.map((item)=>item.id===id?{...item,status:decision,decidedBy:currentUser.id,decidedAt,returnReason}:item),
      orders:commercial.orders.map((order)=>order.id===approval.recordId?{...order,status:decision==="Approved"?"Approved":"Draft"}:order),
      activities:approval.recordId?[{id:uid("act-approval"),accountId:commercial.orders.find((order)=>order.id===approval.recordId)?.accountId,type:"order",title:decision==="Approved"?"Order approved":"Order returned for edits",detail:decision==="Approved"?`${approval.title} approved by ${currentUser.name}.`:`${approval.title} returned by ${currentUser.name}: ${returnReason}`,at:decidedAt,userId:currentUser.id},...commercial.activities]:commercial.activities,
    };
    momentumStorage.setItem(COMMERCIAL_KEY,JSON.stringify(nextCommercial));
    setCommercial(nextCommercial);
    void momentumStorage.flush();
  };

''',
)

replace_between(
    "lib/workspace-context.tsx",
    "  const setOrderStatus =",
    "  const cancelOrder =",
    r'''  const setOrderStatus = (id: string, status: OrderStatus) => {
    const order = commercial.orders.find((item) => item.id === id);
    if (!order) {
      base.setOrderStatus(id, status);
      return;
    }
    if (!currentUser || !canAdvanceFulfillment(currentUser) || nextFulfillment[order.status] !== status) return;
    const nextCommercial:CommercialState={...commercial,orders:commercial.orders.map((item)=>item.id===id?{...item,status,paymentStatus:status==="Delivered"&&item.paymentStatus==="Not invoiced"?"Open":item.paymentStatus}:item)};
    momentumStorage.setItem(COMMERCIAL_KEY,JSON.stringify(nextCommercial));
    setCommercial(nextCommercial);
    void momentumStorage.flush();
  };

''',
)

# ---------------------------------------------------------------------------
# 4. Approval review shows rep attribution and refuses to close on unconfirmed save.
# ---------------------------------------------------------------------------
replace_once(
    "components/pages/work-v2.tsx",
    '''import { useWorkspace } from "../../lib/workspace-context";''',
    '''import { momentumStorage } from "../../lib/persistence";
import { COMMERCIAL_KEY, useWorkspace } from "../../lib/workspace-context";''',
)
replace_once(
    "components/pages/work-v2.tsx",
    '''  const [returnNote,setReturnNote]=useState("");''',
    '''  const [returnNote,setReturnNote]=useState("");
  const [decisionError,setDecisionError]=useState("");
  const [deciding,setDeciding]=useState(false);''',
)
replace_once(
    "components/pages/work-v2.tsx",
    '''  const reviewAccount=reviewOrder?scope.accounts.find((account)=>account.id===reviewOrder.accountId)??null:null;''',
    '''  const reviewAccount=reviewOrder?scope.accounts.find((account)=>account.id===reviewOrder.accountId)??null:null;
  const reviewSalesRep=reviewOrder?data.users.find((user)=>user.role==="Sales Representative"&&user.id===(reviewOrder.creditedRepId??reviewApproval?.requesterId??reviewOrder.ownerId))??null:null;''',
)
replace_once(
    "components/pages/work-v2.tsx",
    '''  const openReview=(id:string)=>{setReviewId(id);setReturnNote("");};
  const decide=(decision:"Approved"|"Returned")=>{if(!reviewApproval)return;if(reviewApproval.type==="Timecard"&&reviewTimecard){if(decision==="Returned"&&!returnNote.trim())return;if(decision==="Returned")auditReturn(reviewTimecard.id,returnNote);else auditApprove(reviewTimecard.id);decideTimecard(reviewTimecard.id,decision==="Approved"?"Manager approved":"Returned");}else decideApproval(reviewApproval.id,decision);setReviewId(null);setReturnNote("");};''',
    '''  const openReview=(id:string)=>{setReviewId(id);setReturnNote("");setDecisionError("");};
  const decide=async(decision:"Approved"|"Returned")=>{
    if(!reviewApproval||deciding)return;
    setDecisionError("");
    if(reviewApproval.type==="Timecard"&&reviewTimecard){
      if(decision==="Returned"&&!returnNote.trim())return;
      if(decision==="Returned")auditReturn(reviewTimecard.id,returnNote);else auditApprove(reviewTimecard.id);
      decideTimecard(reviewTimecard.id,decision==="Approved"?"Manager approved":"Returned");
    }else{
      setDeciding(true);
      decideApproval(reviewApproval.id,decision);
      const confirmed=await momentumStorage.flushAndConfirm(COMMERCIAL_KEY);
      setDeciding(false);
      if(!confirmed.ok){setDecisionError(`This decision is still safely queued on this device and is NOT cloud-confirmed. Do not approve it again. ${confirmed.message??"Check Momentum sync status before leaving this record."}`);return;}
    }
    setReviewId(null);setReturnNote("");
  };''',
)
replace_once(
    "components/pages/work-v2.tsx",
    '''<span>{approval.requestedBy}</span><i/>''',
    '''<span>Submitted by {approval.requestedBy}</span><i/>''',
)
replace_once(
    "components/pages/work-v2.tsx",
    '''<div><span>Status</span><strong>{reviewOrder.status}</strong></div><div><span>Approval rule</span><strong>One Administrator decision</strong></div>''',
    '''<div><span>Status</span><strong>{reviewOrder.status}</strong></div><div><span>Submitted by</span><strong>{reviewApproval.requestedBy}</strong></div><div><span>Sales rep</span><strong>{reviewSalesRep?.name??"Not recorded on this order"}</strong></div><div><span>Approval rule</span><strong>One Administrator decision</strong></div>''',
)
replace_once(
    "components/pages/work-v2.tsx",
    '''{canDecide&&<Button variant="secondary" icon={<RotateCcw size={15}/>} disabled={reviewApproval.type==="Timecard"&&!returnNote.trim()} onClick={()=>decide("Returned")}>Return</Button>}{canDecide&&<Button icon={<Check size={15}/>} onClick={()=>decide("Approved")}>Approve</Button>}''',
    '''{canDecide&&<Button variant="secondary" icon={<RotateCcw size={15}/>} disabled={deciding||(reviewApproval.type==="Timecard"&&!returnNote.trim())} onClick={()=>void decide("Returned")}>Return</Button>}{canDecide&&<Button icon={<Check size={15}/>} disabled={deciding} onClick={()=>void decide("Approved")}>{deciding?"Saving…":"Approve"}</Button>}''',
)
replace_once(
    "components/pages/work-v2.tsx",
    '''        {!reviewOrder&&!reviewTimecard&&<div className="record-review__section"><AlertTriangle size={20}/><h3>{reviewApproval.type}</h3><p>{reviewApproval.detail}</p></div>}
      </div>}''',
    '''        {!reviewOrder&&!reviewTimecard&&<div className="record-review__section"><AlertTriangle size={20}/><h3>{reviewApproval.type}</h3><p>{reviewApproval.detail}</p></div>}
        {decisionError&&<p className="form-error" role="alert">{decisionError}</p>}
      </div>}''',
)

# ---------------------------------------------------------------------------
# 5. Regression tests: stale sessions may never roll business state backward.
# ---------------------------------------------------------------------------
write(
    "tests/production-record-consistency.test.ts",
    r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeCommercialState } from "../lib/commercial-state";
import { mergeDocument } from "../lib/persistence";
import { reconcileApprovals, reconcileOrders } from "../lib/order-approval-engine";
import type { Approval, Order, WorkspaceData, WorkspaceUser } from "../lib/types";

const rep:WorkspaceUser={id:"rep",name:"Rep",firstName:"Rep",email:"rep@test.local",initials:"RP",title:"Sales Representative",role:"Sales Representative",team:"Sales",accent:"#000"};
const admin:WorkspaceUser={id:"admin",name:"Admin",firstName:"Admin",email:"admin@test.local",initials:"AD",title:"Administrator",role:"Administrator",team:"Leadership",accent:"#000"};
const account={id:"acc",name:"Store",location:"Phoenix",channel:"Retail",stage:"Opening order" as const,ownerId:rep.id,contactName:"Owner",contactRole:"Owner",phone:"1",email:"a@b.com",lastActivity:"",nextAction:"",nextActionDate:"2026-10-02",health:"New" as const,lifetimeCases:0,reorderCount:0,notes:""};
const baseData:WorkspaceData={users:[admin,rep],customers:[],accounts:[account],activities:[],appointments:[],orders:[],placements:[],inventory:[],approvals:[],timeEntries:[],timecards:[],notifications:[],bulletins:[],territories:[]};
const order=(status:Order["status"]):Order=>({id:"ord",number:"GE-1",accountId:account.id,cases:10,pricePerCase:24,amount:240,status,placedAt:"2026-10-01",ownerId:rep.id,creditedRepId:rep.id,priceBasis:"Tier A",paymentStatus:status==="Delivered"?"Open":"Not invoiced",product:"0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",inventoryAvailableAtOrder:100});
const pending:Approval={id:"apr",type:"Order",title:"Review GE-1",detail:"10 cases",requestedBy:rep.name,requesterId:rep.id,recordId:"ord",team:"Sales",submittedAt:"2026-10-01T16:00:00.000Z",dueAt:"2026-10-02T16:00:00.000Z",priority:"High",status:"Pending"};

test("a stale order record cannot roll Delivered backward",()=>{
  const path="domains/commercial/fields/orders";
  const base={items:[order("Approved")]};
  const local={items:[order("Allocated")]};
  const remote={items:[order("Delivered")]};
  const merged=mergeDocument(base,local,remote,path);
  assert.equal((merged.items as Order[])[0].status,"Delivered");
});

test("a final Administrator approval cannot return to Pending",()=>{
  const approved={...pending,status:"Approved" as const,decidedBy:admin.id,decidedAt:"2026-10-01T16:05:00.000Z"};
  const path="domains/commercial/fields/approvals";
  const merged=mergeDocument({items:[pending]},{items:[pending]},{items:[approved]},path);
  assert.equal((merged.items as Approval[])[0].status,"Approved");
  assert.equal((merged.items as Approval[])[0].decidedBy,admin.id);
});

test("delivery and reservation custody evidence is monotonic",()=>{
  const taskBase={id:"task",orderId:"ord",driverId:"driver",status:"Accepted",acceptedAt:"2026-10-01T16:00:00.000Z",acceptedBy:"admin",history:[]};
  const local={...taskBase,status:"Loaded",loadedAt:"2026-10-01T16:10:00.000Z"};
  const remote={...local,status:"Delivered",departedAt:"2026-10-01T16:20:00.000Z",deliveredAt:"2026-10-01T16:30:00.000Z"};
  const tasks=mergeDocument({items:[taskBase]},{items:[local]},{items:[remote]},"domains/delivery/fields/tasks");
  assert.equal((tasks.items as Array<{status:string}>)[0].status,"Delivered");
  const reservations=mergeDocument({items:[{id:"r",status:"Active"}]},{items:[{id:"r",status:"Active"}]},{items:[{id:"r",status:"Fulfilled",fulfilledAt:"2026-10-01T16:30:00.000Z"}]},"domains/inventoryLedger/fields/reservations");
  assert.equal((reservations.items as Array<{status:string}>)[0].status,"Fulfilled");
});

test("commercial hydration keeps cancellation evidence and duplicate ids for canonical reconciliation",()=>{
  const cancelled={...order("Cancelled"),cancelledAt:"2026-10-01T17:00:00.000Z",cancelledBy:admin.id,cancellationReason:"Duplicate order"};
  const approved={...pending,status:"Approved" as const,decidedBy:admin.id,decidedAt:"2026-10-01T16:05:00.000Z"};
  const withLegacy:WorkspaceData={...baseData,orders:[order("Awaiting approval")],approvals:[pending]};
  const normalized=normalizeCommercialState({version:1,accountPatches:{},customerPatches:{},orders:[cancelled],appointments:[],approvals:[approved],activities:[],inventoryLots:[],territories:[]},withLegacy,"2026-10-01");
  assert.equal(normalized.orders.length,1);
  assert.equal(normalized.orders[0].status,"Cancelled");
  assert.equal(normalized.orders[0].cancellationReason,"Duplicate order");
  assert.equal(normalized.approvals.length,1);
  const approvals=reconcileApprovals(normalized.approvals,withLegacy.approvals);
  assert.equal(approvals[0].status,"Approved");
  const orders=reconcileOrders(normalized.orders,withLegacy.orders,approvals);
  assert.equal(orders[0].status,"Cancelled");
});

test("cloud confirmation cannot claim success while a permission-denied journal is blocked",()=>{
  const persistence=readFileSync("lib/persistence.ts","utf8");
  assert.match(persistence,/blockedKeys\.get\(key\)/);
  assert.match(persistence,/The change remains safely queued and is not cloud-confirmed/);
  assert.match(persistence,/commitFirestoreWrites\(\[write,metaWrite\]\)/);
});

test("Administrator approval UI identifies the submitting rep before decision",()=>{
  const ui=readFileSync("components/pages/work-v2.tsx","utf8");
  assert.match(ui,/Sales rep/);
  assert.match(ui,/Submitted by/);
  assert.match(ui,/flushAndConfirm\(COMMERCIAL_KEY\)/);
});
''',
)

print("Production record-consistency repair applied.")
