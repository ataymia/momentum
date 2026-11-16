import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {getFirestoreSnapshot} from "./firebase-firestore-rest";
import type {CrmContact} from "./crm-engine";

type EditableDetails=Pick<CrmContact,"name"|"role"|"decisionRole"|"active">&
 {email:string;phone:string};
export type ConnectedContactIntent={
 action:"Create"|"Update";locationId:string;contactId:string;
 expectedRevision:number;contact:EditableDetails;
};
export type ConnectedContactReceipt={
 contactId:string;revision:number;updatedAt:string;replayed:boolean;
 readbackVerified:boolean;
};

/** Await trusted backend receipt AND canonical Firestore readback. */
export async function saveConnectedCrmContact(
 session:FirebaseAuthSession,intent:ConnectedContactIntent,requestId:string,
):Promise<ConnectedContactReceipt>{
 const response=await fetch(firebaseFunctionUrl("saveCrmContact"),{
  method:"POST",headers:{"content-type":"application/json",
   authorization:"Bearer "+session.idToken},
  body:JSON.stringify({intent,requestId}),
 }).catch(()=>null);
 if(!response)throw new Error("CRM connection unavailable. Check records before retrying.");
 const result=await response.json().catch(()=>null) as
  {ok?:boolean;message?:string;contactId?:string;revision?:number;
   updatedAt?:string;replayed?:boolean}|null;
 if(!response.ok||result?.ok!==true||!result.contactId||
   !Number.isSafeInteger(result.revision)||!result.updatedAt)
  throw new Error(result?.message||"Contact change was not confirmed by the server.");
 let readbackVerified=false;
 try{
  const snapshot=await getFirestoreSnapshot<{items?:Array<{
   id?:string;revision?:number;locationId?:string;
  }>}>( "domains/crm/fields/contacts");
  readbackVerified=Boolean(snapshot.exists&&snapshot.data?.items?.some(row=>
   row.id===result.contactId&&row.revision===result.revision&&
   row.locationId===intent.locationId));
 }catch{
  // Server receipt without a readable current source is not a confirmed save.
 }
 return{contactId:result.contactId,revision:result.revision!,
  updatedAt:result.updatedAt,replayed:Boolean(result.replayed),readbackVerified};
}
