import type { PersistenceScope } from "./firebase-access";
import type { Role } from "./types";

export type RoleRule="activeEmployee"|"hasAccess"|Role[];

export type DomainFieldSpec={
  userIdField?:string;
  selfWrite?:boolean;
  managerWrite?:boolean;
  managerRead?:boolean;
  /** Sales Representatives may read/write this field only for directly assigned Brand Ambassadors. */
  salesRepSupervise?:boolean;
  read?:RoleRule;
  write?:RoleRule;
  /** Derived/bounded fields may intentionally replace their prior persisted collection. */
  replaceOnWrite?:boolean;
};

export type DomainSpec={key:string;id:string;read:RoleRule;write:RoleRule;fields:Record<string,DomainFieldSpec>;omit?:string[]};

const ADMIN:Role[]=["Administrator"];
const ADMIN_MANAGER:Role[]=["Administrator","Sales Manager"];
const SALES:Role[]=["Administrator","Sales Manager","Sales Representative"];
const OPERATIONS:Role[]=["Administrator","Operations","Warehouse"];
/**
 * Every active employee role except Brand Ambassador.
 *
 * A Brand Ambassador is an event worker, not a member of the commercial platform: no CRM, accounts, orders,
 * inventory, marketing, or performance data. Filtering that out in the UI is not enough, so the domains that
 * carry those records are denied at the rules layer instead of gated on `activeEmployee`.
 */
const OPERATIONAL:Role[]=["Administrator","Sales Manager","Sales Representative","Operations","Warehouse"];
const DELIVERY_READ:Role[]=["Administrator","Operations","Warehouse","Delivery Driver"];
const DELIVERY_WRITE:Role[]=["Administrator","Operations","Delivery Driver"];
const DELIVERY_LEDGER_WRITE:Role[]=["Administrator","Operations","Warehouse","Delivery Driver"];

const perUser=(userIdField="userId",extra:Partial<DomainFieldSpec>={}):DomainFieldSpec=>({userIdField,selfWrite:true,managerWrite:true,...extra});
const adminOwned=(userIdField="userId"):DomainFieldSpec=>({userIdField,selfWrite:false,managerWrite:false,managerRead:false});
const restricted=(read:RoleRule,write:RoleRule):DomainFieldSpec=>({read,write});

export const DOMAIN_SPECS:DomainSpec[]=[
  {key:"momentum-demo-workspace-v5",id:"workspace",read:OPERATIONAL,write:OPERATIONAL,omit:["users"],fields:{customers:{},accounts:{read:[...OPERATIONAL,"Delivery Driver"]},activities:{},appointments:{},orders:{read:[...OPERATIONAL,"Delivery Driver"],write:[...OPERATIONAL,"Delivery Driver"]},placements:{},inventory:{read:[...OPERATIONAL,"Delivery Driver"]},approvals:{},notifications:{},bulletins:{},territories:{},timeEntries:perUser("userId",{read:"hasAccess",write:"activeEmployee"}),timecards:perUser("userId",{read:"hasAccess",write:"activeEmployee"})}},
  {key:"momentum-commercial-controls-v1",id:"commercial",read:OPERATIONAL,write:OPERATIONAL,fields:{orders:{read:[...OPERATIONAL,"Delivery Driver"],write:[...OPERATIONAL,"Delivery Driver"]},appointments:{},approvals:{},activities:{},inventoryLots:{read:[...OPERATIONAL,"Delivery Driver"]},territories:{}}},
  {key:"momentum-crm-v1",id:"crm",read:SALES,write:SALES,fields:{contacts:{},interactions:{},opportunities:{},responsibilityHistory:{}}},
  /**
   * Territory management. Configuration and assignments are manager-owned; exception requests are sharded
   * per requesting employee so a representative can file their own without being able to touch anybody
   * else's, and a manager can decide the ones belonging to the people they supervise.
   */
  {key:"momentum-territory-v2",id:"territory",read:OPERATIONAL,write:ADMIN_MANAGER,fields:{
    territories:{},assignments:{},history:{},
    exceptions:{userIdField:"userId",selfWrite:true,managerWrite:true},
  }},
  {
    key:"momentum-hcm-v4",id:"hcm",read:"hasAccess",write:ADMIN_MANAGER,
    fields:{
      employees:{},policies:{},courses:{},shifts:{},reviewCycles:{},benefitPlans:{},ptoPolicies:{},
      requisitions:restricted(ADMIN_MANAGER,ADMIN),candidates:restricted(ADMIN_MANAGER,ADMIN),interviews:restricted(ADMIN_MANAGER,ADMIN),offers:restricted(ADMIN_MANAGER,ADMIN),lifecycleCases:restricted(ADMIN_MANAGER,ADMIN),
      audit:{...perUser("actorId",{managerRead:false,managerWrite:false}),read:ADMIN,write:ADMIN},
      privateProfiles:perUser(),profileChangeRequests:perUser(),acknowledgments:perUser(),leaveRequests:perUser(),availability:perUser(),shiftRequests:perUser(),
      dependents:perUser(),benefitEnrollments:perUser(),benefitEvents:perUser(),training:perUser(),goals:perUser(),reviews:perUser(),workflows:perUser(),tasks:perUser("ownerId"),documents:perUser(),
      employmentChanges:perUser("userId",{selfWrite:false}),ptoAssignments:perUser("userId",{selfWrite:false}),ptoLedger:perUser("userId",{selfWrite:false}),
      compensation:adminOwned(),compensationChanges:perUser("userId",{selfWrite:false}),
    },
  },
  {key:"momentum-identity-provisioning-v1",id:"identity",read:ADMIN,write:ADMIN,fields:{drafts:{},records:perUser("userId",{selfWrite:true,managerWrite:false,managerRead:false})}},
  {key:"momentum-brand-ambassador-v1",id:"brandAmbassador",read:"hasAccess",write:ADMIN,fields:{assignments:perUser("ambassadorId",{selfWrite:false,managerWrite:false,managerRead:false,salesRepSupervise:true,read:ADMIN,write:ADMIN})}},
  {key:"momentum-training-library-v1",id:"trainingLibrary",read:"hasAccess",write:ADMIN,fields:{materials:{},audiences:{}}},
  {key:"momentum-document-templates-v1",id:"documentTemplates",read:"hasAccess",write:ADMIN,fields:{templates:{},packets:perUser()}},
  {key:"momentum-performance-v1",id:"performance",read:OPERATIONAL,write:ADMIN_MANAGER,fields:{goals:perUser(),reports:perUser(),notes:perUser("authorId")}},
  {key:"momentum-commerce-v1",id:"commerce",read:["Administrator","Sales Manager","Sales Representative","Operations"],write:ADMIN,fields:{invoices:{},payments:{},allocations:{},credits:{},refunds:{},notes:{}}},
  {key:"momentum-inventory-ledger-v1",id:"inventoryLedger",read:OPERATIONAL,write:OPERATIONS,fields:{nodes:{read:[...OPERATIONAL,"Delivery Driver"]},movements:{read:[...OPERATIONAL,"Delivery Driver"],write:DELIVERY_LEDGER_WRITE},reservations:{read:[...OPERATIONAL,"Delivery Driver"],write:DELIVERY_LEDGER_WRITE},counts:{read:[...OPERATIONAL,"Delivery Driver"]}}},
  {key:"momentum-delivery-v1",id:"delivery",read:DELIVERY_READ,write:DELIVERY_WRITE,fields:{tasks:{}}},
  {key:"momentum-finance-v3",id:"finance",read:ADMIN,write:ADMIN,fields:{expenses:perUser("requesterId")}},
  {key:"momentum-accounting-v1",id:"accounting",read:ADMIN,write:ADMIN,fields:{accounts:{},rules:{},journals:{},reconciliations:{}}},
  {key:"momentum-marketing-v3",id:"marketing",read:OPERATIONAL,write:ADMIN_MANAGER,fields:{requests:perUser("requesterId"),campaigns:{},spend:{},assets:{},materials:{},materialMovements:{},touches:{},attributions:{},partnerships:{}}},
  {key:"momentum-payroll-v5",id:"payroll",read:ADMIN,write:ADMIN,fields:{payGroups:{},employerTaxRules:{},benefitTaxRules:{},runs:{},liabilities:{},employees:adminOwned(),withholdingProfiles:adminOwned(),disbursements:adminOwned()}},
  {key:"momentum-field-tracking-v1",id:"fieldTracking",read:OPERATIONAL,write:ADMIN_MANAGER,fields:{geofences:{},sessions:perUser(),samples:perUser(),appointmentEvents:perUser(),exceptions:perUser(),departureAlerts:perUser()}},
  {key:"momentum-audit-v1",id:"audit",read:ADMIN,write:ADMIN,fields:{events:perUser("actorId",{managerWrite:false,managerRead:false})}},
  {key:"momentum-notification-rules-v1",id:"notificationRules",read:"activeEmployee",write:ADMIN,fields:{preferences:perUser(),deliveries:{...restricted("activeEmployee","activeEmployee"),replaceOnWrite:true}}},
  {key:"momentum-period-locks-v1",id:"periodLocks",read:"activeEmployee",write:ADMIN,fields:{locks:{}}},
];

export const DOMAIN_BY_KEY=new Map(DOMAIN_SPECS.map((spec)=>[spec.key,spec]));
export const ROOT_FIELD="_root";
export const SHARED_ROOT="domains";
export const USER_ROOT="userDomains";
export const isDomainStorageKey=(key:string)=>DOMAIN_BY_KEY.has(key);

export function roleAllows(rule:RoleRule,scope:PersistenceScope){if(scope.role==="Customer")return false;if(rule==="hasAccess")return true;if(rule==="activeEmployee")return scope.accountState==="Active";return scope.accountState==="Active"&&rule.includes(scope.role);}
export const sharedDocPath=(domainId:string,field:string)=>`${SHARED_ROOT}/${domainId}/fields/${field}`;
export const userDocPath=(uid:string,domainId:string,field:string)=>`${USER_ROOT}/${uid}/${domainId}/${field}`;
export type ParsedDocPath={domainId:string;field:string;uid?:string};
export function parseDocPath(path:string):ParsedDocPath|null{const parts=path.split("/");if(parts.length===4&&parts[0]===SHARED_ROOT&&parts[2]==="fields")return{domainId:parts[1],field:parts[3]};if(parts.length===4&&parts[0]===USER_ROOT)return{uid:parts[1],domainId:parts[2],field:parts[3]};return null;}
export type DomainDocument={path:string;writable:boolean};

export function domainDocuments(spec:DomainSpec,scope:PersistenceScope):DomainDocument[]{
  const documents:DomainDocument[]=[];const sharedReadable=roleAllows(spec.read,scope);const sharedWritable=roleAllows(spec.write,scope);
  if(sharedReadable)documents.push({path:sharedDocPath(spec.id,ROOT_FIELD),writable:sharedWritable});
  for(const [field,fieldSpec] of Object.entries(spec.fields)){
    const read=fieldSpec.read?roleAllows(fieldSpec.read,scope):sharedReadable;const write=fieldSpec.write?roleAllows(fieldSpec.write,scope):sharedWritable;
    if(read)documents.push({path:sharedDocPath(spec.id,field),writable:write});if(!fieldSpec.userIdField)continue;
    const readableUids=new Set(scope.readableUserIds);if(fieldSpec.salesRepSupervise&&scope.role==="Sales Representative")for(const uid of scope.supervisedBrandAmbassadorIds)readableUids.add(uid);
    for(const uid of readableUids){if(uid!==scope.uid&&scope.role!=="Administrator"&&!scope.managedUserIds.has(uid)&&!(fieldSpec.salesRepSupervise&&scope.supervisedBrandAmbassadorIds.has(uid)))continue;if(uid!==scope.uid&&scope.role!=="Administrator"&&scope.managedUserIds.has(uid)&&fieldSpec.managerRead===false)continue;documents.push({path:userDocPath(uid,spec.id,field),writable:userShardWritable(spec,fieldSpec,uid,scope)});}
  }
  return documents;
}

export function userShardWritable(_spec:DomainSpec,fieldSpec:DomainFieldSpec,uid:string,scope:PersistenceScope){if(scope.role==="Customer")return false;if(scope.role==="Administrator")return true;if(uid===scope.uid)return fieldSpec.selfWrite!==false;if(fieldSpec.salesRepSupervise&&scope.role==="Sales Representative"&&scope.supervisedBrandAmbassadorIds.has(uid))return scope.accountState==="Active";if(scope.managedUserIds.has(uid))return fieldSpec.managerWrite!==false&&scope.accountState==="Active";return false;}
export function documentWritable(path:string,scope:PersistenceScope){const parsed=parseDocPath(path);if(!parsed)return false;const spec=DOMAIN_SPECS.find((item)=>item.id===parsed.domainId);if(!spec)return false;if(parsed.uid){const fieldSpec=spec.fields[parsed.field];return Boolean(fieldSpec?.userIdField)&&userShardWritable(spec,fieldSpec,parsed.uid,scope);}const fieldSpec=parsed.field===ROOT_FIELD?undefined:spec.fields[parsed.field];return roleAllows(fieldSpec?.write??spec.write,scope);}
export function documentReplacesOnWrite(path:string){const parsed=parseDocPath(path);if(!parsed||parsed.uid||parsed.field===ROOT_FIELD)return false;const spec=DOMAIN_SPECS.find((item)=>item.id===parsed.domainId);return spec?.fields[parsed.field]?.replaceOnWrite===true;}
const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
export function shardState(spec:DomainSpec,state:unknown):Map<string,Record<string,unknown>>{const output=new Map<string,Record<string,unknown>>();if(!isRecord(state))return output;const root:Record<string,unknown>={};for(const [key,value] of Object.entries(state)){if(spec.omit?.includes(key))continue;const fieldSpec=spec.fields[key];if(!Array.isArray(value)||!fieldSpec){root[key]=value;continue;}if(!fieldSpec.userIdField){output.set(sharedDocPath(spec.id,key),{items:value});continue;}const shared:unknown[]=[];const byUser=new Map<string,unknown[]>();for(const item of value){const owner=isRecord(item)?item[fieldSpec.userIdField]:undefined;if(typeof owner==="string"&&owner){const list=byUser.get(owner)??[];list.push(item);byUser.set(owner,list);}else shared.push(item);}output.set(sharedDocPath(spec.id,key),{items:shared});for(const [uid,items] of byUser)output.set(userDocPath(uid,spec.id,key),{items});}output.set(sharedDocPath(spec.id,ROOT_FIELD),{data:root});return output;}
export function assembleState(spec:DomainSpec,documents:Map<string,Record<string,unknown>|null>):Record<string,unknown>|null{let found=false;const rootDoc=documents.get(sharedDocPath(spec.id,ROOT_FIELD));const state:Record<string,unknown>=isRecord(rootDoc?.data)?{...rootDoc!.data}:{};if(rootDoc)found=true;for(const field of Object.keys(spec.fields)){const items:unknown[]=[];const shared=documents.get(sharedDocPath(spec.id,field));if(shared){found=true;if(Array.isArray(shared.items))items.push(...shared.items);}const userPaths=[...documents.keys()].filter((path)=>{const parsed=parseDocPath(path);return parsed?.uid&&parsed.domainId===spec.id&&parsed.field===field;}).sort();for(const path of userPaths){const doc=documents.get(path);if(doc){found=true;if(Array.isArray(doc.items))items.push(...doc.items);}}state[field]=items;}return found?state:null;}
export function recordIdentity(item:unknown):string{if(!isRecord(item))return JSON.stringify(item);for(const key of ["id","userId","policyId","actorId"])if(typeof item[key]==="string")return`${key}:${item[key]}`;return JSON.stringify(item);}
export const metaVersionKey=(docPath:string)=>docPath.replace(/[^A-Za-z0-9]+/g,"_");
export const EMPLOYEE_DIRECTORY_META_KEY=metaVersionKey("employeeDirectory");
