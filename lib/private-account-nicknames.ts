import {deleteFirestoreDocument,getFirestoreDocument,setFirestoreDocument} from "./firebase-firestore-rest";

export type PrivateNickname={accountId:string;nickname:string};
const cache=new Map<string,Map<string,string>>();
const pending=new Map<string,Promise<Map<string,string>>>();
const safeId=(value:string)=>/^[A-Za-z0-9_-]{1,160}$/.test(value);

export function clearPrivateNicknameCache():void{cache.clear();pending.clear();}
export function privateNicknamePath(uid:string,accountId:string):string{
  if(!safeId(uid)||!safeId(accountId))throw new Error("Invalid account nickname reference.");
  return `privateAccountNicknames/${uid}/accounts/${accountId}`;
}

/** Only the signed-in employee's private Firestore path is read.
 * The cache is scoped to the employee, never written to shared CRM data.
 */
export async function loadPrivateAccountNicknames(uid:string,accountIds:readonly string[]):Promise<Map<string,string>>{
  if(cache.has(uid))return new Map(cache.get(uid));
  if(pending.has(uid))return new Map(await pending.get(uid)!);
  const promise=(async()=>{
    const result=new Map<string,string>();
    // Read only the visible accounts to avoid a global full-data preload.
    const identifiers=[...new Set(accountIds)].filter(safeId);
    const batchSize=5;
    for(let i=0;i<identifiers.length;i+=batchSize){
      const batch=identifiers.slice(i,i+batchSize);
      await Promise.all(batch.map(async accountId=>{
        const doc=await getFirestoreDocument<PrivateNickname>(privateNicknamePath(uid,accountId));
        if(doc?.accountId===accountId&&typeof doc.nickname==="string"&&doc.nickname.trim())
          result.set(accountId,doc.nickname.trim());
      }));
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
  if(nickname)await setFirestoreDocument(key,{accountId,nickname});
  else await deleteFirestoreDocument(key);
  const owned=cache.get(uid)??new Map<string,string>();
  if(nickname)owned.set(accountId,nickname);else owned.delete(accountId);
  cache.set(uid,owned);
  return nickname;
}
