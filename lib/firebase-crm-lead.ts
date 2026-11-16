import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {getFirestoreSnapshot} from "./firebase-firestore-rest";

export type ConnectedLeadIntent=
  |{action:"Qualify";accountId:string;expectedStage:string;nextStage:"Qualified"|"Sampled";reason:string}
  |{action:"Transfer";accountId:string;expectedOwnerId:string;targetUid:string;reason:string};
export type ConnectedLeadReceipt={
  eventId:string;accountId:string;action:"Qualify"|"Transfer";
  recordedAt:string;replayed:boolean;readbackVerified:boolean;
};
/** A server receipt is not the same as an authenticated CRM source readback. */
export async function changeConnectedCrmLead(
  session:FirebaseAuthSession,intent:ConnectedLeadIntent,requestId:string,
):Promise<ConnectedLeadReceipt>{
  let response:Response;
  try{
    response=await fetch(firebaseFunctionUrl("changeCrmLead"),{
      method:"POST",headers:{
        "content-type":"application/json",authorization:"Bearer "+session.idToken,
      },body:JSON.stringify({intent,requestId}),
    });
  }catch{
    throw new Error("CRM connection unavailable. Check lead history before retrying the same request.");
  }
  const receipt=await response.json().catch(()=>null) as
    |{ok:true;eventId:string;accountId:string;recordedAt:string;replayed:boolean;action:"Qualify"|"Transfer"}
    |{ok:false;message?:string}|null;
  if(!receipt)throw new Error("CRM returned no readable receipt. Check records before retrying.");
  if(!receipt.ok)throw new Error(receipt.message||"CRM rejected this lead change.");
  if(!receipt.eventId||!receipt.recordedAt||receipt.accountId!==intent.accountId||
    receipt.action!==intent.action)
    throw new Error("CRM receipt incomplete. Reconcile before retrying.");
  let readbackVerified=false;
  try{
    const snapshot=await getFirestoreSnapshot<{
      items?:Array<{id:string;stage:string;ownerId:string}>;
    }>("domains/workspace/fields/accounts");
    const account=snapshot.data?.items?.find(row=>row.id===intent.accountId);
    readbackVerified=Boolean(snapshot.exists&&account&&(
      intent.action==="Qualify"?account.stage===intent.nextStage:
      account.ownerId===intent.targetUid
    ));
  }catch{
    // No optimistic success when authenticated readback is unavailable.
  }
  return{
    eventId:receipt.eventId,accountId:receipt.accountId,
    recordedAt:receipt.recordedAt,action:receipt.action,
    replayed:receipt.replayed,readbackVerified,
  };
}
