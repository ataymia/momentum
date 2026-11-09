/** Server-side schema for a self-attested physical CRM field visit.
 * No actor ID, timestamps, revenue, order, credit, custody or settlement
 * state may be supplied by the browser. All such fields are server owned.
 */
export type TrustedVisitInput = {
  businessName:string;
  accountId?:string;
  physicallyVisited:true;
  unsuccessful:boolean;
  score:number;
  summary:string;
  nextAction?:string;
  nextActionDate?:string;
  sampleProduct?:string;
  sampleQuantity?:number;
};

export type ValidVisit =
  {ok:true;value:TrustedVisitInput}|
  {ok:false;message:string};

const record=(value:unknown):value is Record<string,unknown>=>
  Boolean(value && typeof value==="object" && !Array.isArray(value));
const str=(value:unknown)=>typeof value==="string"?value.trim():"";
const permitted=new Set([
  "businessName","accountId","physicallyVisited","unsuccessful",
  "score","summary","nextAction","nextActionDate",
  "sampleProduct","sampleQuantity",
]);

function validDay(input:string):boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input))return false;
  const time=new Date(input+"T00:00:00.000Z");
  return Number.isFinite(time.getTime()) &&
    time.toISOString().slice(0,10)===input;
}

export function validateTrustedCrmVisit(input:unknown):ValidVisit {
  if (!record(input))return{ok:false,message:"Visit details are required."};
  if (Object.keys(input).some(key=>!permitted.has(key))) {
    return{ok:false,message:"Visit payload contains unauthorized fields."};
  }
  const businessName=str(input.businessName);
  const accountId=str(input.accountId)||undefined;
  const summary=str(input.summary);
  const nextAction=str(input.nextAction)||undefined;
  const nextActionDate=str(input.nextActionDate)||undefined;
  const sampleProduct=str(input.sampleProduct)||undefined;
  const score=input.score;
  const sampleQuantity=input.sampleQuantity;

  if (!businessName || businessName.length>160) {
    return{ok:false,message:"Enter a business name up to 160 characters."};
  }
  if (accountId && (accountId.length>120 ||
      !/^[a-zA-Z0-9:_-]+$/.test(accountId))) {
    return{ok:false,message:"Invalid customer location reference."};
  }
  if (input.physicallyVisited!==true || typeof input.unsuccessful!=="boolean") {
    return{ok:false,message:"Confirm the physical visit and its outcome."};
  }
  if (typeof score!=="number" || !Number.isInteger(score) ||
      score<1 || score>10) {
    return{ok:false,message:"Prospect score must be a whole number 1–10."};
  }
  if (!summary || summary.length>1800) {
    return{ok:false,message:"Describe the visit in up to 1800 characters."};
  }
  if (nextAction && nextAction.length>300) {
    return{ok:false,message:"Next action must be under 300 characters."};
  }
  if (nextActionDate && !validDay(nextActionDate)) {
    return{ok:false,message:"Follow-up date is invalid."};
  }
  if (sampleProduct && sampleProduct.length>160) {
    return{ok:false,message:"Sample product name is too long."};
  }
  if (sampleProduct && (typeof sampleQuantity!=="number" ||
      !Number.isInteger(sampleQuantity) ||
      sampleQuantity<1 || sampleQuantity>1000)) {
    return{ok:false,message:"Sample cans must be a whole number 1–1000."};
  }
  if (!sampleProduct && sampleQuantity!==undefined) {
    return{ok:false,message:"Sample quantity needs a product."};
  }
  return{ok:true,value:{
    businessName,accountId,physicallyVisited:true,
    unsuccessful:input.unsuccessful as boolean,score:score as number,
    summary,nextAction,nextActionDate,sampleProduct,
    sampleQuantity:sampleProduct?sampleQuantity as number:undefined,
  }};
}

export function syntheticVisitLocationId(name:string):string {
  const normalized=name.trim().toLowerCase().replace(/\s+/g," ");
  let hash=2166136261;
  for (let i=0;i<normalized.length;i++) {
    hash^=normalized.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  const slug=normalized.replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"").slice(0,64)||"business";
  return "quick-visit:"+slug+"-"+(hash>>>0).toString(36);
}

export function validCrmVisitRequestId(id:unknown):id is string {
  return typeof id==="string"&&/^[A-Za-z0-9_-]{16,80}$/.test(id);
}
