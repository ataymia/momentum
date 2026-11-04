import {currentFirebaseSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {momentumStorage} from "./persistence";

/**
 * Connected timecard corrections are opt-in on both sides. The client flag
 * cannot override the server's independent disabled-by-default authority.
 */
export const connectedTimecardCorrectionEnabled=
  process.env.NEXT_PUBLIC_ENABLE_TIMECARD_CORRECTIONS==="true";

export type TrustedPunch={clockIn:string;clockOut:string;breakMinutes:number;mealStart?:string;mealEnd?:string};
export type TrustedTimecardRequest={
  requestId:string;
  action:"amend"|"add_shift"|"create_week";
  targetUid:string;
  reason:string;
  cardId?:string;entryId?:string;date?:string;weekDate?:string;
  expectedBefore?:{clockIn:string;clockOut?:string;breakMinutes:number;mealStart?:string;mealEnd?:string};
  punch?:TrustedPunch;
};
export type ConfirmedTimecardCorrection={
 requestId:string;cardId:string;serverRecordedAt:string;
 replayed:boolean;refreshed:boolean;refreshWarning?:string;
};
type FunctionResult={ok?:boolean;message?:string;requestId?:string;cardId?:string;
  status?:string;replayed?:boolean;serverRecordedAt?:string};
export const newTimecardCorrectionId=()=>"request-"+crypto.randomUUID();

export function validateTimecardCorrectionReceipt(
 intent:TrustedTimecardRequest,response:FunctionResult,
):{requestId:string;cardId:string;serverRecordedAt:string;replayed:boolean}{
 if(response.ok!==true||response.requestId!==intent.requestId||
    response.status!=="Recorded"||!response.cardId||
    !response.serverRecordedAt||Number.isNaN(Date.parse(response.serverRecordedAt))||
    typeof response.replayed!=="boolean")
   throw new Error("The correction service did not provide a matching durable receipt. Refresh before retrying.");
 if(intent.action!=="create_week"&&response.cardId!==intent.cardId)
   throw new Error("The correction service confirmed a different timecard. Check the audit before retrying.");
 return{requestId:response.requestId,cardId:response.cardId,
   serverRecordedAt:response.serverRecordedAt,replayed:response.replayed};
}

/** Never optimistically mutates timecard arrays. Server receipts are authoritative. */
export async function submitTrustedTimecardCorrection(
 intent:TrustedTimecardRequest,
):Promise<ConfirmedTimecardCorrection>{
 if(!connectedTimecardCorrectionEnabled||momentumStorage.mode()!=="firestore")
   throw new Error("Connected timecard corrections are not enabled for this workspace.");
 const session=await currentFirebaseSession();
 if(!session?.idToken||session.uid==="")
   throw new Error("Your Administrator session is unavailable. Sign in again.");
 let response:Response;
 try{
   response=await fetch(firebaseFunctionUrl("correctEmployeeTimecard"),{
     method:"POST",
     headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},
     body:JSON.stringify(intent),
   });
 }catch{
   throw new Error("The correction request could not reach the server. Keep the same request reference and verify the timecard before retrying.");
 }
 const body=await response.json().catch(()=>null) as FunctionResult|null;
 if(!response.ok||!body?.ok)
   throw new Error(body?.message||"Timecard correction was not confirmed. Reopen the record and check payroll locks.");
 const result=validateTimecardCorrectionReceipt(intent,body);
 const refreshed=await momentumStorage.refreshKeys(["momentum-demo-workspace-v5"]);
 return{...result,refreshed:refreshed.ok,
   refreshWarning:refreshed.ok?undefined:"Correction recorded on server, but this browser did not refresh: "+(refreshed.message??"Refresh the page.")};
}
