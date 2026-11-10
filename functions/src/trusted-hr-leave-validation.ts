/* eslint-disable comma-spacing, key-spacing, keyword-spacing, curly, brace-style, space-before-blocks, max-len, indent, arrow-parens, valid-jsdoc */
/** Only the server owns submitted/approval states, user ID and timestamps. */
export type TrustedLeaveInput={
 startDate:string;endDate:string;requestedHours:number;reason:string;
};
export type ValidLeave={ok:true;value:TrustedLeaveInput}|{ok:false;message:string};
const safeRecord=(value:unknown):value is Record<string,unknown>=>
 Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const date=(value:string)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00.000Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
};
/** @param {unknown} input Untrusted form payload. @return {ValidLeave} Validated leaves only. */
export function validateTrustedLeaveRequest(input:unknown):ValidLeave{
 if(!safeRecord(input))return{ok:false,message:"Time-off request details are required."};
 const permitted=new Set(["startDate","endDate","requestedHours","reason"]);
 if(Object.keys(input).some(key=>!permitted.has(key)))
   return{ok:false,message:"Time-off request contains unauthorized fields."};
 const {startDate,endDate,requestedHours,reason}=input;
 if(typeof startDate!=="string"||typeof endDate!=="string"||
    !date(startDate)||!date(endDate)||endDate<startDate)
   return{ok:false,message:"Select valid start and end dates."};
 const spanDays=Math.round((Date.parse(endDate+"T00:00:00Z")-Date.parse(startDate+"T00:00:00Z"))/86400000)+1;
 if(spanDays>366)return{ok:false,message:"Use a date range of one year or less."};
 if(typeof requestedHours!=="number"||!Number.isFinite(requestedHours)||
    requestedHours<0.25||requestedHours>spanDays*24||Math.round(requestedHours*4)!==requestedHours*4)
   return{ok:false,message:"Requested hours must be positive quarter-hours within the date range."};
 if(typeof reason!=="string"||reason.trim().length<3||reason.trim().length>1500)
   return{ok:false,message:"Provide a reason of 3 to 1500 characters."};
 return{ok:true,value:{startDate,endDate,requestedHours,reason:reason.trim()}};
}
/** @param {unknown} id Client request ID. @return {boolean} Safe idempotency key. */
export function validLeaveRequestId(id:unknown):id is string{
 return typeof id==="string"&&/^[A-Za-z0-9_-]{16,80}$/.test(id);
}
