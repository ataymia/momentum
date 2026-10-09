"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { PLATFORM_META_DOCUMENT, type PersistenceScope } from "./firebase-access";
import { FirestoreRequestError, commitFirestoreWrites, getFirestoreSnapshot, getFirestoreSnapshots, isFirestoreConflict, isFirestorePermissionDenied, type FirestoreWrite } from "./firebase-firestore-rest";
import { DOMAIN_BY_KEY, DOMAIN_SPECS, EMPLOYEE_DIRECTORY_META_KEY, ROOT_FIELD, assembleState, chunkManifestShardPaths, documentReplacesOnWrite, documentWritable, domainDocuments, emptyDocumentForPath, isChunkManifestPath, isDomainStorageKey, metaVersionKey, parseDocPath, recordIdentity, resolveUserPhysicalField, shardState, type DomainSpec } from "./firestore-domains";

/**
 * Momentum storage boundary.
 *
 * Every engine reads and writes its state through `momentumStorage` instead of touching `window.localStorage`
 * directly. In local demo mode the calls pass straight through to localStorage. In production a
 * `FirestoreBackend` is attached: reads are served from an in-memory cache that was primed from Firestore
 * before the provider tree mounted, and writes are sharded into role/owner-gated Firestore documents and
 * flushed with update-time preconditions so two employees editing the same record set cannot silently
 * overwrite each other. Conflicts are resolved with a record-level three-way merge, then re-flushed.
 */

type Listener=()=>void;
export type PersistenceMode="local"|"firestore";
export type SyncStatus={mode:PersistenceMode;pending:number;flushing:boolean;lastSyncedAt?:string;lastError?:string;conflicts:number;deniedDocuments:string[]};

const keyListeners=new Map<string,Set<Listener>>();
const statusListeners=new Set<Listener>();
let backend:FirestoreBackend|null=null;
let status:SyncStatus={mode:"local",pending:0,flushing:false,conflicts:0,deniedDocuments:[]};

const emitKey=(key:string)=>{for(const listener of keyListeners.get(key)??[])listener();};
const setStatus=(patch:Partial<SyncStatus>)=>{status={...status,...patch};for(const listener of statusListeners)listener();};
const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.keys(item as Record<string,unknown>).sort().reduce<Record<string,unknown>>((acc,key)=>{acc[key]=(item as Record<string,unknown>)[key];return acc;},{}):item);
const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const local=()=>typeof window==="undefined"?null:window.localStorage;
const PENDING_JOURNAL_PREFIX="momentum-firestore-pending-v1";
const pendingJournalKey=(uid:string,key:string)=>`${PENDING_JOURNAL_PREFIX}:${uid}:${key}`;

export function subscribeStorageKey(key:string,listener:Listener){
  const set=keyListeners.get(key)??new Set<Listener>();
  set.add(listener);keyListeners.set(key,set);
  return()=>{set.delete(listener);if(set.size===0)keyListeners.delete(key);};
}

export const momentumStorage={
  mode():PersistenceMode{return backend?"firestore":"local";},
  getItem(key:string):string|null{
    if(backend&&isDomainStorageKey(key))return backend.getItem(key);
    return local()?.getItem(key)??null;
  },
  setItem(key:string,value:string){
    if(backend&&isDomainStorageKey(key)){backend.setItem(key,value);return;}
    local()?.setItem(key,value);
  },
  removeItem(key:string){
    if(backend&&isDomainStorageKey(key)){backend.removeItem(key);return;}
    local()?.removeItem(key);
  },
  subscribe:subscribeStorageKey,
  /** Force pending Firestore writes now (used before sign-out). */
  async flush(){await backend?.flush();},
  /** Force a fresh read of critical cloud domains without discarding local edits. */
  async refreshKeys(keys:readonly string[]):Promise<{ok:boolean;message?:string}>{
    return backend?backend.refreshKeys(keys):{ok:true,message:"Local demo"};
  },
  /** Confirm that one storage key actually reached Firestore. Local/demo mode succeeds immediately. */
  async flushAndConfirm(key:string,timeoutMs=12_000):Promise<{ok:boolean;message?:string}>{
    if(!backend)return{ok:true};
    return backend.flushAndConfirm(key,timeoutMs);
  },
};

export function getSyncStatus(){return status;}
export function subscribeSyncStatus(listener:Listener){statusListeners.add(listener);return()=>{statusListeners.delete(listener);};}
export function useSyncStatus(){return useSyncExternalStore(subscribeSyncStatus,getSyncStatus,getSyncStatus);}

/** Re-read engine state when another user's change arrives or a conflict merge rewrites the cached document. */
export function useRemoteStorageSync(key:string,onChange:()=>void){
  const handler=useRef(onChange);
  useEffect(()=>{handler.current=onChange;});
  useEffect(()=>subscribeStorageKey(key,()=>handler.current()),[key]);
}

// ---------------------------------------------------------------------------

type DocState={data:Record<string,unknown>|null;updateTime?:string};
type BackendOptions={scope:PersistenceScope;onDirectoryChange:()=>void;pollIntervalMs?:number};

type PendingJournalV2={journalVersion:2;base:string|null;value:string};
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

  // Chunk boundaries are a persistence detail, not record identity. Merge chunked arrays at the logical
  // record level first so a recovery journal compacted by the browser-storage guard cannot shift records
  // between chunks and accidentally lose remote history.
  if(isRecord(localState)&&isRecord(remoteState)){
    const localRecord:Record<string,unknown>={...localState};
    const remoteRecord:Record<string,unknown>={...remoteState};
    const baseRecord:Record<string,unknown>=isRecord(baseState)?{...baseState}:{};
    for(const [field,fieldSpec] of Object.entries(spec.fields)){
      if(!fieldSpec.chunkBytes)continue;
      const baseItems=Array.isArray(baseRecord[field])?baseRecord[field] as unknown[]:[];
      const localItems=Array.isArray(localRecord[field])?localRecord[field] as unknown[]:[];
      const remoteItems=Array.isArray(remoteRecord[field])?remoteRecord[field] as unknown[]:[];
      const merged=mergeItems(baseItems,localItems,remoteItems,`logical:${spec.id}/${field}`);
      localRecord[field]=merged;remoteRecord[field]=merged;baseRecord[field]=merged;
    }
    localState=localRecord;remoteState=remoteRecord;baseState=baseRecord;
  }

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

const emptyDocument=(doc:Record<string,unknown>)=>(Array.isArray(doc.items)&&doc.items.length===0)||(isRecord(doc.data)&&Object.keys(doc.data).length===0)||(doc.shardManifestVersion===1&&Array.isArray(doc.shards)&&doc.shards.length===0&&doc.itemCount===0);
const isBoundedUserChunkPath=(spec:DomainSpec,path:string)=>{
  const parsed=parseDocPath(path);if(!parsed?.uid||parsed.domainId!==spec.id)return false;
  return resolveUserPhysicalField(spec,parsed.field)?.isChunk===true;
};

class FirestoreBackend{
  private cache=new Map<string,string|null>();
  private docs=new Map<string,DocState>();
  private dirty=new Set<string>();
  private denied=new Set<string>();
  private blockedKeys=new Map<string,string>();
  private metaVersions:Record<string,string>={};
  private timer:number|undefined;
  private pollTimer:number|undefined;
  /** Focus and interval refreshes must not race each other. */
  private polling=false;
  private flushing=false;
  private activeFlushKeys=new Set<string>();
  private retryDelay=0;
  private disposed=false;
  scope:PersistenceScope;
  private readonly onDirectoryChange:()=>void;
  private readonly pollIntervalMs:number;

  constructor(options:BackendOptions){
    this.scope=options.scope;
    this.onDirectoryChange=options.onDirectoryChange;
    this.pollIntervalMs=options.pollIntervalMs??5_000;
  }

  private readablePaths(){
    const paths=new Map<string,DomainSpec>();
    for(const spec of DOMAIN_SPECS)for(const doc of domainDocuments(spec,this.scope))paths.set(doc.path,spec);
    return paths;
  }

  private docsFor(spec:DomainSpec,overrides?:Map<string,Record<string,unknown>|null>){
    const documents=new Map<string,Record<string,unknown>|null>();
    for(const [path,state] of this.docs){const parsed=parseDocPath(path);if(parsed?.domainId===spec.id&&state.data)documents.set(path,state.data);}
    if(overrides)for(const [path,data] of overrides)documents.set(path,data);
    return documents;
  }

  /** Fetch bounded user-shard documents named by chunk manifests. Direct document reads keep rules simple. */
  private async hydrateChunkShards(){
    const requested=new Map<string,DomainSpec>();
    for(const [manifestPath,state] of this.docs){
      if(!state.data)continue;
      const parsed=parseDocPath(manifestPath);if(!parsed?.uid)continue;
      const spec=DOMAIN_SPECS.find((item)=>item.id===parsed.domainId);if(!spec)continue;
      for(const shardPath of chunkManifestShardPaths(spec,manifestPath,state.data)){
        if(!this.docs.has(shardPath)&&!this.denied.has(shardPath))requested.set(shardPath,spec);
      }
    }
    if(requested.size===0)return new Set<string>();
    const snapshots=await getFirestoreSnapshots([...requested.keys()]);
    const touched=new Set<string>();
    for(const snapshot of snapshots){
      const spec=requested.get(snapshot.path);if(!spec)continue;
      if((snapshot as {denied?:boolean}).denied){this.denied.add(snapshot.path);continue;}
      this.docs.set(snapshot.path,{data:snapshot.data,updateTime:snapshot.updateTime});
      touched.add(spec.key);
    }
    return touched;
  }

  private assemble(spec:DomainSpec,overrides?:Map<string,Record<string,unknown>|null>){
    const assembled=assembleState(spec,this.docsFor(spec,overrides));
    return assembled?JSON.stringify(assembled):null;
  }

  async prime(){
    const paths=[...this.readablePaths().keys(),PLATFORM_META_DOCUMENT];
    const snapshots=await getFirestoreSnapshots(paths);
    for(const snapshot of snapshots){
      if((snapshot as {denied?:boolean}).denied){this.denied.add(snapshot.path);console.warn(`[momentum] Security Rules denied ${snapshot.path}; firestore.rules and lib/firestore-domains.ts disagree.`);continue;}
      if(snapshot.path===PLATFORM_META_DOCUMENT){this.metaVersions=this.versionsFrom(snapshot.data);continue;}
      this.docs.set(snapshot.path,{data:snapshot.data,updateTime:snapshot.updateTime});
    }
    await this.hydrateChunkShards();
    for(const spec of DOMAIN_SPECS)this.cache.set(spec.key,this.assemble(spec));
    // Recover locally journaled changes without letting an old browser snapshot roll shared records backward.
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
    }
    setStatus({mode:"firestore",pending:this.dirty.size,flushing:false,lastSyncedAt:new Date().toISOString(),lastError:undefined,conflicts:0,deniedDocuments:[...this.denied]});
    if(typeof window!=="undefined"){
      this.pollTimer=window.setInterval(()=>void this.poll(),this.pollIntervalMs);
      window.addEventListener("focus",this.handleFocus);
      document.addEventListener("visibilitychange",this.handleFocus);
      window.addEventListener("pagehide",this.handlePageHide);
    }
    if(this.dirty.size)this.scheduleFlush(50);
  }

  private versionsFrom(data:Record<string,unknown>|null){
    const versions=isRecord(data?.versions)?data!.versions:{};
    const output:Record<string,string>={};
    for(const [key,value] of Object.entries(versions))if(typeof value==="string")output[key]=value;
    return output;
  }

  private handleFocus=()=>{if(typeof document==="undefined"||document.visibilityState==="visible")void this.poll();};
  private handlePageHide=()=>{if(this.dirty.size)void this.flush();};

  /** Directory changed (new hire, role change): fetch any newly readable shards and republish affected engines. */
  async updateScope(scope:PersistenceScope){
    this.scope=scope;
    const missing=[...this.readablePaths().keys()].filter((path)=>!this.docs.has(path)&&!this.denied.has(path));
    if(missing.length===0)return;
    const snapshots=await getFirestoreSnapshots(missing);
    const touched=new Set<string>();
    for(const snapshot of snapshots){
      if((snapshot as {denied?:boolean}).denied){this.denied.add(snapshot.path);continue;}
      this.docs.set(snapshot.path,{data:snapshot.data,updateTime:snapshot.updateTime});
      const parsed=parseDocPath(snapshot.path);
      const spec=parsed?DOMAIN_SPECS.find((item)=>item.id===parsed.domainId):undefined;
      if(spec&&snapshot.data)touched.add(spec.key);
    }
    for(const key of await this.hydrateChunkShards())touched.add(key);
    for(const key of touched){
      if(this.dirty.has(key))continue;
      const next=this.assemble(DOMAIN_BY_KEY.get(key)!);
      if(next!==this.cache.get(key)){this.cache.set(key,next);emitKey(key);}
    }
  }

  getItem(key:string){return this.cache.get(key)??null;}

  async refreshKeys(requested:readonly string[]):Promise<{ok:boolean;message?:string}>{
    if(this.disposed)return{ok:false,message:"Sign in again to refresh cloud records."};
    if(this.flushing)return{ok:false,message:"Changes are still saving. Retry after cloud sync."};
    const keys=[...new Set(requested)].filter((key)=>DOMAIN_BY_KEY.has(key));
    if(!keys.length)return{ok:true};
    const pending=()=>keys.some((key)=>this.dirty.has(key)||this.activeFlushKeys.has(key)||
      this.blockedKeys.has(key)||Boolean(local()?.getItem(pendingJournalKey(this.scope.uid,key))));
    if(pending())return{ok:false,message:"Unsaved cloud changes exist. Resolve the sync warning before refreshing."};
    try{
      const target=new Set(keys);
      const paths=new Map<string,DomainSpec>();
      for(const [path,spec] of this.readablePaths())if(target.has(spec.key))paths.set(path,spec);
      // Include previously discovered user-shard chunks, not only static manifests.
      for(const path of this.docs.keys()){
        const parsed=parseDocPath(path);
        const spec=parsed?DOMAIN_SPECS.find((entry)=>entry.id===parsed.domainId):undefined;
        if(spec&&target.has(spec.key))paths.set(path,spec);
      }
      const snapshots=await getFirestoreSnapshots([...paths.keys()]);
      if(snapshots.some((snapshot)=>(snapshot as {denied?:boolean}).denied)){
        for(const snapshot of snapshots)if((snapshot as {denied?:boolean}).denied)this.denied.add(snapshot.path);
        setStatus({deniedDocuments:[...this.denied]});
        return{ok:false,message:"One or more cloud records were blocked by permissions. Ask Operations to review access."};
      }
      // Writes may begin while the request is in flight. Keep them ahead of stale cloud data.
      if(pending())return{ok:false,message:"New unsaved edits arrived during refresh. Save them and sync again."};
      for(const snapshot of snapshots)this.docs.set(snapshot.path,{data:snapshot.data,updateTime:snapshot.updateTime});
      await this.hydrateChunkShards();
      if(pending())return{ok:false,message:"New unsaved edits arrived during refresh. Save them and sync again."};
      for(const key of keys){
        const next=this.assemble(DOMAIN_BY_KEY.get(key)!);
        if(next!==this.cache.get(key)){this.cache.set(key,next);emitKey(key);}
      }
      setStatus({lastSyncedAt:new Date().toISOString(),lastError:undefined,deniedDocuments:[...this.denied]});
      return{ok:true};
    }catch(error){
      const message=error instanceof Error?error.message:"Cloud refresh failed.";
      setStatus({lastError:message});
      return{ok:false,message};
    }
  }

  async flushAndConfirm(key:string,timeoutMs:number){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      const blocked=this.blockedKeys.get(key);
      if(blocked)return{ok:false,message:blocked};
      if(this.dirty.has(key)&&!this.activeFlushKeys.has(key))await this.flush([key],true);
      const journal=local()?.getItem(pendingJournalKey(this.scope.uid,key));
      if(!this.dirty.has(key)&&!journal)return{ok:true};
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
    this.dirty.delete(key);
    this.dirty.add(key);
    setStatus({pending:this.dirty.size});
    this.scheduleFlush(350);
  }

  removeItem(key:string){this.cache.set(key,null);}

  async flushLatest(){
    const keys=[...this.dirty];
    const latest=keys[keys.length-1];
    if(latest)await this.flush([latest]);
  }

  private scheduleFlush(delay:number){
    if(this.disposed||typeof window==="undefined")return;
    if(this.timer)window.clearTimeout(this.timer);
    this.timer=window.setTimeout(()=>void this.flushLatest(),delay);
  }

  private buildWrites(keys:string[]){
    const writes:FirestoreWrite[]=[];const pathKey=new Map<string,string>();const nextDocs=new Map<string,Record<string,unknown>>();
    for(const key of keys){
      const spec=DOMAIN_BY_KEY.get(key);const raw=this.cache.get(key);
      if(!spec||raw==null)continue;
      let parsed:unknown;try{parsed=JSON.parse(raw);}catch{continue;}
      const shards=shardState(spec,parsed);
      const planned=new Map<string,boolean>();

      // Dynamic chunk documents come first so failure isolation can never publish a manifest that points at
      // a missing chunk. Static documents/manifests follow.
      for(const path of shards.keys())if(documentWritable(path,this.scope)&&!this.denied.has(path))planned.set(path,true);
      for(const doc of domainDocuments(spec,this.scope))if(doc.writable&&!this.denied.has(doc.path)&&!planned.has(doc.path))planned.set(doc.path,true);

      for(const path of planned.keys()){
        const proposed=shards.get(path)??emptyDocumentForPath(spec,path);
        const base=this.docs.get(path);
        // Existing business records survive a locally omitted/temporarily unrecognized record.
        // Bounded derived queues are intentionally replaceable so old items can actually be pruned.
        const next=base?.data?(documentReplacesOnWrite(path)?proposed:mergeDocument(base.data,proposed,base.data,path)):proposed;
        if(!base?.data&&emptyDocument(next))continue;
        if(base?.data&&stable(base.data)===stable(next))continue;
        writes.push({kind:"set",path,data:next,updateTime:base?.updateTime,create:!base?.data});
        pathKey.set(path,key);nextDocs.set(path,next);
      }
    }
    return{writes,pathKey,nextDocs};
  }

  async flush(onlyKeys?:string[],allowConcurrent=false):Promise<void>{
    if(this.disposed||this.dirty.size===0)return;
    if(this.flushing&&!allowConcurrent)return;
    const requested=onlyKeys?.length?[...new Set(onlyKeys)].filter((key)=>this.dirty.has(key)):[...this.dirty];
    const keys=requested.filter((key)=>!this.activeFlushKeys.has(key));
    if(keys.length===0)return;
    for(const key of keys)this.activeFlushKeys.add(key);
    this.flushing=true;setStatus({flushing:true});
    for(const key of keys)this.dirty.delete(key);
    try{
      for(let attempt=0;attempt<4;attempt++){
        const {writes,pathKey,nextDocs}=this.buildWrites(keys);
        if(writes.length===0){for(const key of keys)if(!this.blockedKeys.has(key))local()?.removeItem(pendingJournalKey(this.scope.uid,key));break;}
        const stamp=`${new Date().toISOString()}#${Math.random().toString(36).slice(2,8)}`;
        const versionEntries=writes.map((write)=>metaVersionKey(write.path));
        const metaWrite:FirestoreWrite={kind:"merge",path:PLATFORM_META_DOCUMENT,data:{versions:Object.fromEntries(versionEntries.map((entry)=>[entry,stamp]))},fieldPaths:versionEntries.map((entry)=>`versions.${entry}`)};
        const result=await commitFirestoreWrites([...writes,metaWrite]);
        if(result.ok){
          for(const write of writes){this.docs.set(write.path,{data:nextDocs.get(write.path)??null,updateTime:result.updateTimes[write.path]});}
          for(const entry of versionEntries)this.metaVersions[entry]=stamp;
          this.retryDelay=0;
          for(const key of keys)local()?.removeItem(pendingJournalKey(this.scope.uid,key));
          setStatus({lastSyncedAt:new Date().toISOString(),lastError:undefined});
          break;
        }
        if(isFirestoreConflict(result)){
          setStatus({conflicts:status.conflicts+1});
          await this.reconcile(writes.map((write)=>write.path),pathKey,nextDocs);
          continue;
        }
        if(isFirestorePermissionDenied(result)){
          await this.isolateDenied(writes,pathKey,nextDocs);
          break;
        }
        // A size/validation failure in one noncritical document must never block an order, account,
        // inventory movement, or any other unrelated record in the same flush. Isolate the writes and
        // commit every healthy document independently.
        await this.isolateWriteFailures(writes,pathKey,nextDocs);
        break;
      }
    }catch(error){
      for(const key of keys)this.dirty.add(key);
      this.retryDelay=Math.min(this.retryDelay?this.retryDelay*2:2_000,60_000);
      setStatus({lastError:error instanceof Error?error.message:"Firestore sync failed."});
      this.scheduleFlush(this.retryDelay);
    }finally{
      for(const key of keys)this.activeFlushKeys.delete(key);
      this.flushing=this.activeFlushKeys.size>0;
      setStatus({flushing:this.flushing,pending:this.dirty.size,deniedDocuments:[...this.denied]});
      if(this.dirty.size&&!this.retryDelay)this.scheduleFlush(200);
    }
  }

  /** A non-conflict batch failed. Commit healthy documents independently so one bad shard cannot poison unrelated records. */
  private async isolateWriteFailures(writes:FirestoreWrite[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){
    const failedKeys=new Set<string>();
    const touchedKeys=new Set<string>();
    const messages:string[]=[];
    let anySuccess=false;
    const ordered=[...writes].sort((left,right)=>{
      const leftKey=pathKey.get(left.path);const rightKey=pathKey.get(right.path);
      const leftSpec=leftKey?DOMAIN_BY_KEY.get(leftKey):undefined;const rightSpec=rightKey?DOMAIN_BY_KEY.get(rightKey):undefined;
      return Number(Boolean(leftSpec&&isChunkManifestPath(leftSpec,left.path)))-Number(Boolean(rightSpec&&isChunkManifestPath(rightSpec,right.path)));
    });
    for(const write of ordered){
      const key=pathKey.get(write.path);if(key)touchedKeys.add(key);
      const spec=key?DOMAIN_BY_KEY.get(key):undefined;
      if(key&&spec&&isChunkManifestPath(spec,write.path)&&failedKeys.has(key)){messages.push(`${write.path}: manifest deferred until every audit chunk is cloud-confirmed.`);continue;}
      const stamp=`${new Date().toISOString()}#${Math.random().toString(36).slice(2,8)}`;
      const versionEntry=metaVersionKey(write.path);
      const metaWrite:FirestoreWrite={kind:"merge",path:PLATFORM_META_DOCUMENT,data:{versions:{[versionEntry]:stamp}},fieldPaths:[`versions.${versionEntry}`]};
      const result=await commitFirestoreWrites([write,metaWrite]);
      if(result.ok){
        this.docs.set(write.path,{data:nextDocs.get(write.path)??null,updateTime:result.updateTimes[write.path]});
        this.metaVersions[versionEntry]=stamp;anySuccess=true;continue;
      }
      if(key)failedKeys.add(key);
      if(isFirestorePermissionDenied(result)){
        this.denied.add(write.path);
        if(key)this.blockedKeys.set(key,`${write.path}: Security Rules rejected the write. The change remains safely queued and is not cloud-confirmed.`);
        messages.push(`${write.path}: Security Rules rejected the write.`);continue;
      }
      if(isFirestoreConflict(result)){if(key)failedKeys.add(key);setStatus({conflicts:status.conflicts+1});messages.push(`${write.path}: concurrent update; retrying.`);continue;}
      messages.push(`${write.path}: ${result.message||`Firestore write failed (${result.status}).`}`);
    }
    for(const key of touchedKeys){
      if(failedKeys.has(key)){if(!this.blockedKeys.has(key))this.dirty.add(key);continue;}
      local()?.removeItem(pendingJournalKey(this.scope.uid,key));
    }
    this.retryDelay=failedKeys.size?Math.min(this.retryDelay?this.retryDelay*2:2_000,60_000):0;
    setStatus({lastSyncedAt:anySuccess?new Date().toISOString():status.lastSyncedAt,lastError:messages.length?`Some changes are still safely queued: ${messages.slice(0,2).join(" | ")}`:undefined});
    if(this.dirty.size)this.scheduleFlush(this.retryDelay||200);
  }

  /** A batch failed on rules. Retry one document at a time so the offending shard is identified and parked. */
  private async isolateDenied(writes:FirestoreWrite[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){
    const successfulKeys=new Set<string>();
    const blockedKeys=new Set<string>();
    const ordered=[...writes].sort((left,right)=>{
      const leftKey=pathKey.get(left.path);const rightKey=pathKey.get(right.path);
      const leftSpec=leftKey?DOMAIN_BY_KEY.get(leftKey):undefined;const rightSpec=rightKey?DOMAIN_BY_KEY.get(rightKey):undefined;
      return Number(Boolean(leftSpec&&isChunkManifestPath(leftSpec,left.path)))-Number(Boolean(rightSpec&&isChunkManifestPath(rightSpec,right.path)));
    });
    for(const write of ordered){
      const key=pathKey.get(write.path);
      const spec=key?DOMAIN_BY_KEY.get(key):undefined;
      if(key&&spec&&isChunkManifestPath(spec,write.path)&&blockedKeys.has(key))continue;
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

  /** Re-read conflicting documents, three-way merge with the pending local shard, and republish the merged state. */
  private async reconcile(paths:string[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){
    const snapshots=await getFirestoreSnapshots(paths);
    const overrides=new Map<string,Map<string,Record<string,unknown>|null>>();
    for(const snapshot of snapshots){
      const base=this.docs.get(snapshot.path);
      const localDoc=nextDocs.get(snapshot.path);
      const key=pathKey.get(snapshot.path);
      const chunkConflict=key?isBoundedUserChunkPath(DOMAIN_BY_KEY.get(key)!,snapshot.path):false;
      const merged=localDoc?(chunkConflict?mergeDocument(base?.data,localDoc,snapshot.data,snapshot.path):documentReplacesOnWrite(snapshot.path)?localDoc:mergeDocument(base?.data,localDoc,snapshot.data,snapshot.path)):snapshot.data;
      this.docs.set(snapshot.path,{data:snapshot.data,updateTime:snapshot.updateTime});
      if(!key)continue;
      const map=overrides.get(key)??new Map<string,Record<string,unknown>|null>();
      map.set(snapshot.path,merged);overrides.set(key,map);
    }
    for(const [key,map] of overrides){
      const spec=DOMAIN_BY_KEY.get(key)!;
      this.cache.set(key,this.assemble(spec,map));
      emitKey(key);
    }
  }

  async poll(){
    if(this.disposed||this.flushing||this.polling)return;
    this.polling=true;
    try{
      const meta=await getFirestoreSnapshot(PLATFORM_META_DOCUMENT);
      const versions=this.versionsFrom(meta.data);
      const changed=Object.entries(versions).filter(([key,value])=>this.metaVersions[key]!==value).map(([key])=>key);
      if(changed.length===0)return;
      // Do not acknowledge a version before its records have been loaded successfully.
      // Otherwise a transient fetch failure silently loses the update until a later version arrives.
      if(changed.includes(EMPLOYEE_DIRECTORY_META_KEY))this.onDirectoryChange();
      const readable=this.readablePaths();
      const byMeta=new Map<string,string>();for(const path of readable.keys())byMeta.set(metaVersionKey(path),path);
      for(const path of this.docs.keys())if(parseDocPath(path))byMeta.set(metaVersionKey(path),path);
      const paths=changed.map((key)=>byMeta.get(key)).filter((path):path is string=>Boolean(path)&&!this.denied.has(path!));
      if(paths.length===0){for(const key of changed)this.metaVersions[key]=versions[key];return;}
      const snapshots=await getFirestoreSnapshots(paths);
      const touched=new Map<string,Map<string,Record<string,unknown>|null>>();
      for(const snapshot of snapshots){
        const parsedPath=parseDocPath(snapshot.path);
        const spec=readable.get(snapshot.path)??(parsedPath?DOMAIN_SPECS.find((item)=>item.id===parsedPath.domainId):undefined);if(!spec)continue;
        const base=this.docs.get(snapshot.path);
        // Firestore REST decoding creates a new object on every read. Update time is the stable identity.
        if(base?.updateTime&&base.updateTime===snapshot.updateTime)continue;
        let override:Record<string,unknown>|null=snapshot.data;
        if(this.dirty.has(spec.key)){
          const raw=this.cache.get(spec.key);
          if(raw!=null){try{const localShard=shardState(spec,JSON.parse(raw)).get(snapshot.path);if(localShard)override=isBoundedUserChunkPath(spec,snapshot.path)?mergeDocument(base?.data,localShard,snapshot.data,snapshot.path):documentReplacesOnWrite(snapshot.path)?localShard:mergeDocument(base?.data,localShard,snapshot.data,snapshot.path);}catch{/* keep remote */}}
        }
        this.docs.set(snapshot.path,{data:snapshot.data,updateTime:snapshot.updateTime});
        const map=touched.get(spec.key)??new Map<string,Record<string,unknown>|null>();
        map.set(snapshot.path,override);touched.set(spec.key,map);
      }
      for(const key of await this.hydrateChunkShards())if(!touched.has(key))touched.set(key,new Map());
      for(const [key,map] of touched){
        const spec=DOMAIN_BY_KEY.get(key)!;
        const next=this.assemble(spec,map);
        if(next!==this.cache.get(key)){this.cache.set(key,next);emitKey(key);}
      }
      for(const key of changed)this.metaVersions[key]=versions[key];
      setStatus({lastSyncedAt:new Date().toISOString()});
    }catch(error){
      if(error instanceof FirestoreRequestError&&error.status===401){setStatus({lastError:"Firebase session expired. Sign in again."});return;}
      setStatus({lastError:error instanceof Error?error.message:"Firestore poll failed."});
    }finally{
      this.polling=false;
    }
  }

  dispose(){
    this.disposed=true;
    if(typeof window!=="undefined"){
      if(this.timer)window.clearTimeout(this.timer);
      if(this.pollTimer)window.clearInterval(this.pollTimer);
      window.removeEventListener("focus",this.handleFocus);
      document.removeEventListener("visibilitychange",this.handleFocus);
      window.removeEventListener("pagehide",this.handlePageHide);
    }
  }
}

/** Attach the Firestore backend. Resolves once every readable document is cached, so engines can hydrate synchronously. */
export async function attachFirestorePersistence(options:BackendOptions){
  detachFirestorePersistence();
  const next=new FirestoreBackend(options);
  await next.prime();
  backend=next;
  for(const key of DOMAIN_BY_KEY.keys())emitKey(key);
  return next;
}

export async function detachFirestorePersistence(){
  const current=backend;
  backend=null;
  if(current){await current.flush().catch(()=>undefined);current.dispose();}
  setStatus({mode:"local",pending:0,flushing:false,conflicts:0,deniedDocuments:[],lastError:undefined});
}

export async function updateFirestoreScope(scope:PersistenceScope){await backend?.updateScope(scope);}
