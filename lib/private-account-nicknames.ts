import {deleteFirestoreDocument,listFirestoreCollection,setFirestoreDocument} from "./firebase-firestore-rest";
import {currentRuntimeMode} from "./runtime-mode-store";

export type PrivateNickname={accountId:string;nickname:string};
const cache=new Map<string,Map<string,string>>();
const pending=new Map<string,Promise<Map<string,string>>>();
const safeId=(value:string)=>/^[A-Za-z0-9_-]{1,160}$/.test(value);
const demoKey=(uid:string)=>`momentum-demo-private-account-nicknames:${uid}`;

export function clearPrivateNicknameCache():void{cache.clear();pending.clear();}
export function privateNicknamePath(uid:string,accountId:string):string{
  if(!safeId(uid)||!safeId(accountId))throw new Error("Invalid account nickname reference.");
  return `privateAccountNicknames/${uid}/accounts/${accountId}`;
}

/** Only the signed-in employee's private Firestore path is read.
 * The cache is scoped to the employee, never written to shared CRM data.
 */
export async function loadPrivateAccountNicknames(uid:string,accountIds:readonly string[]):Promise<Map<string,string>>{
  if(currentRuntimeMode()==="demo"){
    try{
      const value=JSON.parse(window.localStorage.getItem(demoKey(uid))||"{}") as Record<string,string>;
      return new Map(Object.entries(value).filter(([id,name])=>safeId(id)&&accountIds.includes(id)&&typeof name==="string"));
    }catch{return new Map();}
  }
  if(cache.has(uid))return new Map(cache.get(uid));
  if(pending.has(uid))return new Map(await pending.get(uid)!);
  const promise=(async()=>{
    const result=new Map<string,string>();
    // One scoped collection read; never one request per account (hundreds of accounts
    // would otherwise reintroduce the mobile lag we just removed).
    if(!safeId(uid))throw new Error("Invalid employee nickname reference.");
    const visible=new Set(accountIds);
    const docs=await listFirestoreCollection<PrivateNickname>(`privateAccountNicknames/${uid}/accounts`);
    for(const doc of docs){
      if(safeId(doc.accountId)&&visible.has(doc.accountId)&&typeof doc.nickname==="string"&&doc.nickname.trim())
        result.set(doc.accountId,doc.nickname.trim());
    }
    cache.set(uid,result);
    return result;
  })();
  pending.set(uid,promise);
  try{return new Map(await promise);}finally{pending.delete(uid);}
}

export async function savePrivateAccountNickname(uid:string,accountId:string,value:string):Promise<string>{
  const nickname=value.trim();
  if(nickname.length>80)throw new Error("Nickname must be 80 characters or fewer.");
  const key=privateNicknamePath(uid,accountId);
  if(currentRuntimeMode()==="demo"){
    const saved=JSON.parse(window.localStorage.getItem(demoKey(uid))||"{}") as Record<string,string>;
    if(nickname)saved[accountId]=nickname;else delete saved[accountId];
    window.localStorage.setItem(demoKey(uid),JSON.stringify(saved));
  }else{
    if(nickname)await setFirestoreDocument(key,{accountId,nickname});
    else await deleteFirestoreDocument(key);
  }
  const owned=cache.get(uid)??new Map<string,string>();
  if(nickname)owned.set(accountId,nickname);else owned.delete(accountId);
  cache.set(uid,owned);
  return nickname;
}
