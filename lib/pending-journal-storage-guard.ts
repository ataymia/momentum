const PENDING_JOURNAL_PREFIX="momentum-firestore-pending-v1:";
const OVERFLOW_PREFIX="momentum-firestore-pending-overflow-v1:";
const AUDIT_JOURNAL_SUFFIX=":momentum-audit-v1";
const MAX_AUDIT_STATE_CHARS=180_000;
const MAX_AUDIT_EVENTS=750;

type PendingJournalV2={journalVersion:2;base:string|null;value:string};
type GuardedWindow=Window&{__momentumPendingJournalStorageGuardV1?:boolean};

const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const overflowKey=(key:string)=>`${OVERFLOW_PREFIX}${key}`;
const isPendingJournalKey=(key:string)=>key.startsWith(PENDING_JOURNAL_PREFIX);

function compactAuditState(raw:string,maxChars=MAX_AUDIT_STATE_CHARS){
  if(raw.length<=maxChars)return raw;
  try{
    const parsed=JSON.parse(raw) as unknown;
    if(!isRecord(parsed)||!Array.isArray(parsed.events))return raw;
    const kept:unknown[]=[];
    const seed={...parsed,events:kept};
    let size=JSON.stringify(seed).length;
    for(const event of parsed.events.slice(0,MAX_AUDIT_EVENTS)){
      let serialized="";
      try{serialized=JSON.stringify(event);}catch{continue;}
      if(serialized.length>maxChars/2)continue;
      if(size+serialized.length+1>maxChars)break;
      kept.push(event);size+=serialized.length+1;
    }
    return JSON.stringify({...parsed,events:kept});
  }catch{return raw;}
}

/**
 * Audit state is append-heavy and the pending journal stores both its merge base and its new value.
 * Compact only the crash-recovery copy. The in-memory state and Firestore write remain unchanged.
 */
export function compactPendingJournalValue(key:string,value:string){
  if(!key.endsWith(AUDIT_JOURNAL_SUFFIX))return value;
  try{
    const parsed=JSON.parse(value) as Partial<PendingJournalV2>;
    if(parsed?.journalVersion===2&&typeof parsed.value==="string"&&(typeof parsed.base==="string"||parsed.base===null)){
      return JSON.stringify({journalVersion:2,base:typeof parsed.base==="string"?compactAuditState(parsed.base):null,value:compactAuditState(parsed.value)} satisfies PendingJournalV2);
    }
  }catch{/* legacy raw audit state */}
  return compactAuditState(value);
}

function isQuotaExceeded(error:unknown){
  if(typeof DOMException!=="undefined"&&error instanceof DOMException)return error.name==="QuotaExceededError"||error.name==="NS_ERROR_DOM_QUOTA_REACHED";
  return Boolean(error&&typeof error==="object"&&"name" in error&&((error as {name?:unknown}).name==="QuotaExceededError"||(error as {name?:unknown}).name==="NS_ERROR_DOM_QUOTA_REACHED"));
}

/**
 * Firestore pending journals are durability helpers, not the source of truth. Browsers commonly cap
 * localStorage near 5-10 MB. A large audit journal used to throw QuotaExceededError synchronously and take
 * down the whole React tree before the pending Firestore flush could finish.
 *
 * This guard keeps the same localStorage API for persistence.ts, compacts only audit recovery payloads,
 * and falls back to sessionStorage for pending journals when localStorage is full. If both stores are full,
 * the write remains in the Firestore backend's in-memory dirty queue and is allowed to flush instead of
 * crashing the application.
 */
export function installPendingJournalStorageGuard(){
  if(typeof window==="undefined")return;
  const guarded=window as GuardedWindow;
  if(guarded.__momentumPendingJournalStorageGuardV1)return;
  let primary:Storage;let overflow:Storage;
  try{primary=window.localStorage;overflow=window.sessionStorage;}catch{return;}
  const prototype=Object.getPrototypeOf(primary) as Storage;
  const originalGet=prototype.getItem;
  const originalSet=prototype.setItem;
  const originalRemove=prototype.removeItem;
  guarded.__momentumPendingJournalStorageGuardV1=true;

  prototype.getItem=function(key:string){
    if(this!==primary||!isPendingJournalKey(key))return originalGet.call(this,key);
    const direct=originalGet.call(primary,key);
    return direct!==null?direct:originalGet.call(overflow,overflowKey(key));
  };

  prototype.setItem=function(key:string,value:string){
    if(this!==primary||!isPendingJournalKey(key)){originalSet.call(this,key,value);return;}
    const candidate=compactPendingJournalValue(key,value);
    try{
      originalSet.call(primary,key,candidate);
      originalRemove.call(overflow,overflowKey(key));
      return;
    }catch(error){
      if(!isQuotaExceeded(error))throw error;
    }
    try{
      originalSet.call(overflow,overflowKey(key),candidate);
      originalRemove.call(primary,key);
      console.warn(`[momentum] localStorage quota reached for ${key}; pending Firestore recovery moved to sessionStorage.`);
      return;
    }catch(error){
      if(!isQuotaExceeded(error))throw error;
    }
    originalRemove.call(primary,key);
    originalRemove.call(overflow,overflowKey(key));
    console.error(`[momentum] Browser storage is full for ${key}; recovery journal could not be persisted. Firestore flush remains queued in memory.`);
  };

  prototype.removeItem=function(key:string){
    if(this!==primary||!isPendingJournalKey(key)){originalRemove.call(this,key);return;}
    originalRemove.call(primary,key);
    originalRemove.call(overflow,overflowKey(key));
  };
}
