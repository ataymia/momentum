import {normalizePayrollState,type PayrollState} from "./payroll-engine";

/**
 * A client-side workspace cannot prove a connected payroll snapshot is current.
 * Until the server-authoritative correction transaction is available, the
 * Administrator correction feature is exercised only on isolated local demo data.
 */
export type TimecardCorrectionEnvironment={
  runtimeMode:"demo"|"production";storageMode:"local"|"firestore";
  connectedSession:boolean;payrollSnapshot:string|null;
};
export type TimecardCorrectionGuard={ok:true;payroll:PayrollState}|{ok:false;error:string};

export function verifyTimecardCorrectionEnvironment(input:TimecardCorrectionEnvironment):TimecardCorrectionGuard{
  if(input.connectedSession||input.runtimeMode!=="demo"||input.storageMode!=="local")
    return{ok:false,error:"Connected timecard corrections require an authorized server transaction and payroll source lock. Use an isolated local demo until this workflow is approved for production."};
  if(!input.payrollSnapshot)
    return{ok:false,error:"Payroll state is not loaded. Open the payroll workspace in local demo before correcting timecards."};
  try{
    const parsed:unknown=JSON.parse(input.payrollSnapshot);
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||
       !Array.isArray((parsed as Record<string,unknown>).runs))
      return{ok:false,error:"Payroll snapshot has an invalid structure; do not edit source timecards."};
    const payroll=normalizePayrollState(parsed);
    const submitted=(parsed as Record<string,unknown>).runs as unknown[];
    if(payroll.runs.length!==submitted.length)
      return{ok:false,error:"Some historical payroll runs failed validation. Resolve payroll storage before making timecard corrections."};
    return{ok:true,payroll};
  }catch{
    return{ok:false,error:"Unable to read payroll source locks. Timecard changes are blocked."};
  }
}
