import type {PayBasis,WorkerClassification} from "./hcm-engine";
/** Selection routes required paperwork but cannot prove legal worker classification. */
export type WorkerType="Not selected"|"Employee"|"Contractor";
export function classificationForWorkerType(type:WorkerType,payBasis:PayBasis):WorkerClassification{
 if(type==="Not selected")return "Not configured";
 if(type==="Contractor")return "Contractor";
 if(payBasis==="Hourly")return "Hourly";
 if(payBasis==="Salary per pay period")return "Salary";
 return "Not configured";
}
