/* eslint-disable max-len, comma-spacing, key-spacing, keyword-spacing, curly, brace-style, space-before-blocks, arrow-parens, indent */
export type LeaveDecisionInput={
 employeeUid:string;leaveId:string;status:"Approved"|"Returned";
 note:string;submittedAt:string;
};
export type LeaveDecisionValidation=
 {ok:true;value:LeaveDecisionInput}|{ok:false;message:string};
const record=(v:unknown):v is Record<string,unknown>=>
 Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const segment=(v:unknown):v is string=>
 typeof v==="string"&&/^[A-Za-z0-9_-]{3,130}$/.test(v);
const date=(v:unknown):v is string=>
 typeof v==="string"&&Number.isFinite(Date.parse(v))&&
 /^20\d{2}-\d\d-\d\dT/.test(v);
/**
 * A browser may never submit reviewer identity, payment adjustments or payroll
 * effective dates. Status and narrative are subject to source authorization.
 * @param {unknown} value Untrusted decision draft.
 * @return {LeaveDecisionValidation} Safe structured decision.
 */
export function validateLeaveDecision(value:unknown):LeaveDecisionValidation{
 if(!record(value)||Object.keys(value).some(key=>
   !["employeeUid","leaveId","status","note","submittedAt"].includes(key)))
   return{ok:false,message:"Leave decision contains unauthorized fields."};
 if(!segment(value.employeeUid)||!segment(value.leaveId)||
   !["Approved","Returned"].includes(String(value.status))||
   !date(value.submittedAt)||typeof value.note!=="string"||
   value.note.trim().length<5||value.note.trim().length>1000)
   return{ok:false,message:"Choose a valid request, decision and note of 5 to 1000 characters."};
 return{ok:true,value:{
   employeeUid:value.employeeUid,leaveId:value.leaveId,
   status:value.status as "Approved"|"Returned",
   note:value.note.trim(),submittedAt:value.submittedAt,
 }};
}
export type DecisionAuthority={
 uid:string;role:string;state:string;managedTeams?:string[];
};
export type EmployeeAuthority={
 uid:string;role:string;state:string;team?:string;managerId?:string;
};
/**
 * @param {DecisionAuthority} reviewer Verified live account.
 * @param {EmployeeAuthority} employee Verified target.
 * @return {boolean} True if an active separate manager can decide.
 */
export function mayDecideLeave(reviewer:DecisionAuthority,employee:EmployeeAuthority):boolean{
 if(!reviewer.uid||!employee.uid||reviewer.uid===employee.uid||
   reviewer.state!=="Active"||employee.state!=="Active"||
   employee.role==="Customer")return false;
 if(reviewer.role==="Administrator")return true;
 return reviewer.role==="Sales Manager"&&
   (employee.managerId===reviewer.uid||
    Boolean(employee.team&&reviewer.managedTeams?.includes(employee.team)));
}
export type PtoBalanceEntry={userId:string;policyId:string;date:string;hours:number;type:string;requestId?:string};
/**
 * Refuse any non-finite or ambiguous PTO ledger before approving leave.
 * @param {PtoBalanceEntry[]} entries Current employee ledger.
 * @param {string} userId Target.
 * @param {string} policyId Approved policy.
 * @param {string} startDate Source leave start.
 * @param {number} requestedHours Hours to reserve.
 * @param {string} requestId Source leave request.
 * @return {boolean} True only if sufficient funds and no prior use.
 */
export function eligiblePtoUsage(entries:PtoBalanceEntry[],userId:string,
 policyId:string,startDate:string,requestedHours:number,requestId:string):boolean{
 if(!userId||!policyId||!requestId||
   !Number.isFinite(requestedHours)||requestedHours<=0||
   entries.some(e=>e.requestId===requestId&&e.type==="Used"))return false;
 const records=entries.filter(e=>e.userId===userId&&e.policyId===policyId);
 if(records.some(e=>!Number.isFinite(e.hours)||!e.date||
   !/^\d{4}-\d\d-\d\d$/.test(e.date)))return false;
 const balance=records.filter(e=>e.date<=startDate).reduce((sum,e)=>sum+e.hours,0);
 return Number.isFinite(balance)&&balance+0.000001>=requestedHours;
}
