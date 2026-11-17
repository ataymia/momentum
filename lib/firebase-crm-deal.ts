import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {getFirestoreSnapshot} from "./firebase-firestore-rest";
import type {Opportunity,OpportunityStage} from "./crm-engine";
export type DealIntent={
 action:"Create"|"Update";locationId:string;dealId:string;expectedRevision:number;
 details:{name:string;stage:OpportunityStage;estimatedCases?:number;
 expectedCloseDate:string;nextAction:string;nextActionDate:string;lossReason:string};
};
export type DealReceipt={dealId:string;revision:number;updatedAt:string;replayed:boolean;
 readbackVerified:boolean};
export async function saveConnectedCrmDeal(
 session:FirebaseAuthSession,intent:DealIntent,requestId:string,
):Promise<DealReceipt>{
 const response=await fetch(firebaseFunctionUrl("saveCrmDeal"),{
  method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},
  body:JSON.stringify({intent,requestId}),
 }).catch(()=>null);
 if(!response)throw new Error("CRM opportunity endpoint unreachable. Verify the source before retrying.");
 const result=await response.json().catch(()=>null) as {
  ok?:boolean;message?:string;dealId?:string;revision?:number;updatedAt?:string;replayed?:boolean;
 }|null;
 if(!response.ok||result?.ok!==true||!result.dealId||
  typeof result.revision!=="number"||!Number.isSafeInteger(result.revision)||!result.updatedAt)
  throw new Error(result?.message||"Opportunity change was not confirmed.");
 let readbackVerified=false;
 try{
  const snap=await getFirestoreSnapshot<{items?:Array<
   Pick<Opportunity,"id"|"locationId">&{revision?:number}
  >}>("domains/crm/fields/opportunities");
  readbackVerified=Boolean(snap.exists&&snap.data?.items?.some(row=>
   row.id===result.dealId&&row.revision===result.revision&&row.locationId===intent.locationId));
 }catch{ /* A backend receipt without source readback stays unconfirmed. */ }
 return{dealId:result.dealId,revision:result.revision,updatedAt:result.updatedAt,
  replayed:Boolean(result.replayed),readbackVerified};
}
