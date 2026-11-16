import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {getFirestoreSnapshot} from "./firebase-firestore-rest";
import type {LeadCreatePayload} from "./crm-lead-create";

export type ConnectedCrmAccountReceipt={
  accountId:string;createdAt:string;replayed:boolean;readbackVerified:boolean;
};

/** Connected creation has no local success fallback. */
export async function createConnectedCrmAccount(
  session:FirebaseAuthSession,account:LeadCreatePayload,requestId:string,
):Promise<ConnectedCrmAccountReceipt>{
  let response:Response;
  try{
    response=await fetch(firebaseFunctionUrl("createCrmAccount"),{
      method:"POST",headers:{
        "content-type":"application/json",
        authorization:"Bearer "+session.idToken,
      },body:JSON.stringify({account,requestId}),
    });
  }catch{
    throw new Error("CRM connection failed. Check records before retrying the same request.");
  }
  const receipt=await response.json().catch(()=>null) as
    ({ok:true;accountId:string;createdAt:string;replayed:boolean})|
    {ok:false;message?:string}|null;
  if(!receipt)throw new Error("CRM returned no readable receipt. Check records before retrying.");
  if(!receipt.ok)throw new Error(receipt.message||"CRM rejected the account request.");
  if(!receipt.accountId||!receipt.createdAt)
    throw new Error("CRM returned an incomplete receipt. Check records before retrying.");
  let readbackVerified=false;
  try{
    const snapshot=await getFirestoreSnapshot<{
      items?:Array<{id?:string;createdByUid?:string}>;
    }>("domains/workspace/fields/accounts");
    readbackVerified=Boolean(snapshot.exists&&snapshot.data?.items?.some(
      row=>row.id===receipt.accountId,
    ));
  }catch{
    // Server receipt alone is not proof of authenticated client readback.
  }
  return{
    accountId:receipt.accountId,createdAt:receipt.createdAt,
    replayed:Boolean(receipt.replayed),readbackVerified,
  };
}
