"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { PLATFORM_META_DOCUMENT, type PersistenceScope } from "./firebase-access";
import { FirestoreRequestError, commitFirestoreWrites, getFirestoreSnapshot, getFirestoreSnapshots, isFirestoreConflict, isFirestorePermissionDenied, type FirestoreWrite } from "./firebase-firestore-rest";
import { DOMAIN_BY_KEY, DOMAIN_SPECS, EMPLOYEE_DIRECTORY_META_KEY, ROOT_FIELD, assembleState, domainDocuments, isDomainStorageKey, metaVersionKey, parseDocPath, recordIdentity, shardState, type DomainSpec } from "./firestore-domains";

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

function mergeItems(base:unknown[],localItems:unknown[],remote:unknown[]):unknown[]{
  const baseMap=new Map(base.map((item)=>[recordIdentity(item),item]));
  const localMap=new Map(localItems.map((item)=>[recordIdentity(item),item]));
  const remoteMap=new Map(remote.map((item)=>[recordIdentity(item),item]));
  const result:unknown[]=[];
  for(const item of remote){const key=recordIdentity(item);if(!baseMap.has(key)&&!localMap.has(key))result.push(item);}
  for(const item of localItems){
    const key=recordIdentity(item);const baseItem=baseMap.get(key);const remoteItem=remoteMap.get(key);
    if(baseItem===undefined){result.push(item);continue;}
    if(stable(item)!==stable(baseItem)){result.push(item);continue;}
    if(remoteItem!==undefined)result.push(remoteItem);
  }
  return result;
}

function mergeRoot(base:Record<string,unknown>|undefined,localData:Record<string,unknown>,remote:Record<string,unknown>,depth=0):Record<string,unknown>{
  const output:Record<string,unknown>={};
  for(const key of new Set([...Object.keys(remote),...Object.keys(localData)])){
    const localValue=localData[key];const baseValue=base?.[key];const remoteValue=remote[key];
    if(depth<1&&isRecord(localValue)&&isRecord(remoteValue)){output[key]=mergeRoot(isRecord(baseValue)?baseValue:undefined,localValue,remoteValue,depth+1);continue;}
    if(stable(localValue)!==stable(baseValue))output[key]=localValue;
    else output[key]=key in remote?remoteValue:localValue;
  }
  return output;
}

export function mergeDocument(base:Record<string,unknown>|null|undefined,localDoc:Record<string,unknown>,remote:Record<string,unknown>|null):Record<string,unknown>{
  if(!remote)return localDoc;
  if(Array.isArray(localDoc.items)||Array.isArray(remote.items))return{items:mergeItems(Array.isArray(base?.items)?base!.items as unknown[]:[],Array.isArray(localDoc.items)?localDoc.items:[],Array.isArray(remote.items)?remote.items:[])};
  if(isRecord(localDoc.data)||isRecord(remote.data))return{data:mergeRoot(isRecord(base?.data)?base!.data:undefined,isRecord(localDoc.data)?localDoc.data:{},isRecord(remote.data)?remote.data:{})};
  return localDoc;
}

const emptyDocument=(doc:Record<string,unknown>)=>(Array.isArray(doc.items)&&doc.items.length===0)||(isRecord(doc.data)&&Object.keys(doc.data).length===0);

class FirestoreBackend{
  private cache=new Map<string,string|null>();
  private docs=new Map<string,DocState>();
  private dirty=new Set<string>();
  private denied=new Set<string>();
  private metaVersions:Record<string,string>={};
  private timer:number|undefined;
  private pollTimer:number|undefined;
  private flushing=false;
  private retryDelay=0;
  private disposed=false;
  scope:PersistenceScope;
  private readonly onDirectoryChange:()=>void;
  private readonly pollIntervalMs:number;

  constructor(options:BackendOptions){
    this.scope=options.scope;
    this.onDirectoryChange=options.onDirectoryChange;
    this.pollIntervalMs=options.pollIntervalMs??20_000;
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
    for(const spec of DOMAIN_SPECS)this.cache.set(spec.key,this.assemble(spec));
    setStatus({mode:"firestore",pending:0,flushing:false,lastSyncedAt:new Date().toISOString(),lastError:undefined,conflicts:0,deniedDocuments:[...this.denied]});
    if(typeof window!=="undefined"){
      this.pollTimer=window.setInterval(()=>void this.poll(),this.pollIntervalMs);
      window.addEventListener("focus",this.handleFocus);
      document.addEventListener("visibilitychange",this.handleFocus);
      window.addEventListener("pagehide",this.handlePageHide);
    }
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
    for(const key of touched){
      if(this.dirty.has(key))continue;
      const next=this.assemble(DOMAIN_BY_KEY.get(key)!);
      if(next!==this.cache.get(key)){this.cache.set(key,next);emitKey(key);}
    }
  }

  getItem(key:string){return this.cache.get(key)??null;}

  setItem(key:string,value:string){
    if(this.cache.get(key)===value)return;
    this.cache.set(key,value);
    this.dirty.add(key);
    setStatus({pending:this.dirty.size});
    this.scheduleFlush(350);
  }

  removeItem(key:string){this.cache.set(key,null);}

  private scheduleFlush(delay:number){
    if(this.disposed||typeof window==="undefined")return;
    if(this.timer)window.clearTimeout(this.timer);
    this.timer=window.setTimeout(()=>void this.flush(),delay);
  }

  private buildWrites(keys:string[]){
    const writes:FirestoreWrite[]=[];const pathKey=new Map<string,string>();const nextDocs=new Map<string,Record<string,unknown>>();
    for(const key of keys){
      const spec=DOMAIN_BY_KEY.get(key);const raw=this.cache.get(key);
      if(!spec||raw==null)continue;
      let parsed:unknown;try{parsed=JSON.parse(raw);}catch{continue;}
      const shards=shardState(spec,parsed);
      for(const doc of domainDocuments(spec,this.scope)){
        if(!doc.writable||this.denied.has(doc.path))continue;
        const parsedPath=parseDocPath(doc.path)!;
        const next=shards.get(doc.path)??(parsedPath.field===ROOT_FIELD?{data:{}}:{items:[]});
        const base=this.docs.get(doc.path);
        if(!base?.data&&emptyDocument(next))continue;
        if(base?.data&&stable(base.data)===stable(next))continue;
        writes.push({kind:"set",path:doc.path,data:next,updateTime:base?.updateTime,create:!base?.data});
        pathKey.set(doc.path,key);nextDocs.set(doc.path,next);
      }
    }
    return{writes,pathKey,nextDocs};
  }

  async flush():Promise<void>{
    if(this.flushing||this.disposed||this.dirty.size===0)return;
    this.flushing=true;setStatus({flushing:true});
    const keys=[...this.dirty];this.dirty.clear();
    try{
      for(let attempt=0;attempt<4;attempt++){
        const {writes,pathKey,nextDocs}=this.buildWrites(keys);
        if(writes.length===0)break;
        const stamp=`${new Date().toISOString()}#${Math.random().toString(36).slice(2,8)}`;
        const versionEntries=writes.map((write)=>metaVersionKey(write.path));
        const metaWrite:FirestoreWrite={kind:"merge",path:PLATFORM_META_DOCUMENT,data:{versions:Object.fromEntries(versionEntries.map((entry)=>[entry,stamp]))},fieldPaths:versionEntries.map((entry)=>`versions.${entry}`)};
        const result=await commitFirestoreWrites([...writes,metaWrite]);
        if(result.ok){
          for(const write of writes){this.docs.set(write.path,{data:nextDocs.get(write.path)??null,updateTime:result.updateTimes[write.path]});}
          for(const entry of versionEntries)this.metaVersions[entry]=stamp;
          this.retryDelay=0;
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
        throw new Error(result.message||`Firestore commit failed (${result.status}).`);
      }
    }catch(error){
      for(const key of keys)this.dirty.add(key);
      this.retryDelay=Math.min(this.retryDelay?this.retryDelay*2:2_000,60_000);
      setStatus({lastError:error instanceof Error?error.message:"Firestore sync failed."});
      this.scheduleFlush(this.retryDelay);
    }finally{
      this.flushing=false;
      setStatus({flushing:false,pending:this.dirty.size,deniedDocuments:[...this.denied]});
      if(this.dirty.size&&!this.retryDelay)this.scheduleFlush(200);
    }
  }

  /** A batch failed on rules. Retry one document at a time so the offending shard is identified and parked. */
  private async isolateDenied(writes:FirestoreWrite[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){
    for(const write of writes){
      const result=await commitFirestoreWrites([write]);
      if(result.ok){this.docs.set(write.path,{data:nextDocs.get(write.path)??null,updateTime:result.updateTimes[write.path]});continue;}
      if(isFirestorePermissionDenied(result)){
        this.denied.add(write.path);
        console.warn(`[momentum] Firestore denied write to ${write.path} for ${pathKey.get(write.path)}; the change stays local to this browser.`);
        continue;
      }
      if(isFirestoreConflict(result)){const key=pathKey.get(write.path);if(key)this.dirty.add(key);continue;}
      throw new Error(result.message);
    }
    setStatus({lastError:`Some changes were rejected by Security Rules (${this.denied.size} document${this.denied.size===1?"":"s"}).`});
  }

  /** Re-read conflicting documents, three-way merge with the pending local shard, and republish the merged state. */
  private async reconcile(paths:string[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){
    const snapshots=await getFirestoreSnapshots(paths);
    const overrides=new Map<string,Map<string,Record<string,unknown>|null>>();
    for(const snapshot of snapshots){
      const base=this.docs.get(snapshot.path);
      const localDoc=nextDocs.get(snapshot.path);
      const merged=localDoc?mergeDocument(base?.data,localDoc,snapshot.data):snapshot.data;
      this.docs.set(snapshot.path,{data:snapshot.data,updateTime:snapshot.updateTime});
      const key=pathKey.get(snapshot.path);
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
    if(this.disposed||this.flushing)return;
    try{
      const meta=await getFirestoreSnapshot(PLATFORM_META_DOCUMENT);
      const versions=this.versionsFrom(meta.data);
      const changed=Object.entries(versions).filter(([key,value])=>this.metaVersions[key]!==value).map(([key])=>key);
      if(changed.length===0)return;
      for(const key of changed)this.metaVersions[key]=versions[key];
      if(changed.includes(EMPLOYEE_DIRECTORY_META_KEY))this.onDirectoryChange();
      const readable=this.readablePaths();
      const byMeta=new Map<string,string>();for(const path of readable.keys())byMeta.set(metaVersionKey(path),path);
      const paths=changed.map((key)=>byMeta.get(key)).filter((path):path is string=>Boolean(path)&&!this.denied.has(path!));
      if(paths.length===0)return;
      const snapshots=await getFirestoreSnapshots(paths);
      const touched=new Map<string,Map<string,Record<string,unknown>|null>>();
      for(const snapshot of snapshots){
        const spec=readable.get(snapshot.path);if(!spec)continue;
        const base=this.docs.get(snapshot.path);
        if(base?.updateTime===snapshot.updateTime&&base?.data===snapshot.data)continue;
        let override:Record<string,unknown>|null=snapshot.data;
        if(this.dirty.has(spec.key)){
          const raw=this.cache.get(spec.key);
          if(raw!=null){try{const localShard=shardState(spec,JSON.parse(raw)).get(snapshot.path);if(localShard)override=mergeDocument(base?.data,localShard,snapshot.data);}catch{/* keep remote */}}
        }
        this.docs.set(snapshot.path,{data:snapshot.data,updateTime:snapshot.updateTime});
        const map=touched.get(spec.key)??new Map<string,Record<string,unknown>|null>();
        map.set(snapshot.path,override);touched.set(spec.key,map);
      }
      for(const [key,map] of touched){
        const spec=DOMAIN_BY_KEY.get(key)!;
        const next=this.assemble(spec,map);
        if(next!==this.cache.get(key)){this.cache.set(key,next);emitKey(key);}
      }
      setStatus({lastSyncedAt:new Date().toISOString()});
    }catch(error){
      if(error instanceof FirestoreRequestError&&error.status===401){setStatus({lastError:"Firebase session expired. Sign in again."});return;}
      setStatus({lastError:error instanceof Error?error.message:"Firestore poll failed."});
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
