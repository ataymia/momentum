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
  /**
   * Per-user arrays that can grow beyond one Firestore document are persisted behind a small manifest and
   * bounded chunk documents. The manifest stays at the historical field path so old clients/data can migrate
   * without inventing a second source of truth.
   */
  chunkBytes?:number;
};

export type DomainSpec={key:string;id:string;read:RoleRule;write:RoleRule;fields:Record<string,DomainFieldSpec>;omit?:string[]};

const ADMIN:Role[]=["Administrator"];
const ADMIN_MANAGER:Role[]=["Administrator","Sales Manager"];
const SALES:Role[]=["Administrator","Sales Manager","Sales Representative"];
const OPERATIONS:Role[]=["Administrator","Operations","Warehouse"];
/**
 * Commercial/operational roles used by CRM, inventory, field tracking, and other business domains.
 * Brand Ambassadors and Delivery Drivers stay outside those broad domains unless a specific domain grants
 * narrower access. Employee performance reporting is separately gated by activeEmployee.
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
  {key:"momentum-performance-v1",id:"performance",read:"activeEmployee",write:ADMIN_MANAGER,fields:{goals:perUser(),reports:perUser(),notes:perUser("authorId"),weeklyDrafts:perUser()}},
  {key:"momentum-commerce-v1",id:"commerce",read:["Administrator","Sales Manager","Sales Representative","Operations","Delivery Driver"],write:ADMIN,fields:{invoices:{},payments:{},allocations:{},credits:{},refunds:{},notes:{}}},
  {key:"momentum-inventory-ledger-v1",id:"inventoryLedger",read:OPERATIONAL,write:OPERATIONS,fields:{nodes:{read:[...OPERATIONAL,"Delivery Driver"]},movements:{read:[...OPERATIONAL,"Delivery Driver"],write:DELIVERY_LEDGER_WRITE},reservations:{read:[...OPERATIONAL,"Delivery Driver"],write:DELIVERY_LEDGER_WRITE},counts:{read:[...OPERATIONAL,"Delivery Driver"]}}},
  {key:"momentum-delivery-v1",id:"delivery",read:DELIVERY_READ,write:DELIVERY_WRITE,fields:{tasks:{}}},
  {key:"momentum-finance-v3",id:"finance",read:ADMIN,write:ADMIN,fields:{expenses:perUser("requesterId")}},
  {key:"momentum-accounting-v1",id:"accounting",read:ADMIN,write:ADMIN,fields:{accounts:{},rules:{},journals:{},reconciliations:{}}},
  {key:"momentum-marketing-v3",id:"marketing",read:OPERATIONAL,write:ADMIN_MANAGER,fields:{requests:perUser("requesterId"),deliveryNotices:{read:[...OPERATIONAL,"Delivery Driver"],write:ADMIN_MANAGER},campaigns:{},spend:{},assets:{},materials:{},materialMovements:{},touches:{},attributions:{},partnerships:{}}},
  {key:"momentum-payroll-v5",id:"payroll",read:ADMIN,write:ADMIN,fields:{payGroups:{},employerTaxRules:{},benefitTaxRules:{},runs:{},liabilities:{},employees:adminOwned(),withholdingProfiles:adminOwned(),disbursements:adminOwned()}},
  {key:"momentum-field-tracking-v1",id:"fieldTracking",read:OPERATIONAL,write:ADMIN_MANAGER,fields:{geofences:{},sessions:perUser("userId",{managerRead:false,managerWrite:false}),samples:perUser("userId",{managerRead:false,managerWrite:false}),appointmentEvents:perUser("userId",{managerRead:false,managerWrite:false}),exceptions:perUser("userId",{managerRead:false,managerWrite:false}),departureAlerts:perUser("userId",{managerRead:false,managerWrite:false})}},
  {key:"momentum-audit-v1",id:"audit",read:ADMIN,write:ADMIN,fields:{events:perUser("actorId",{managerWrite:false,managerRead:false,chunkBytes:350_000})}},
  {key:"momentum-notification-rules-v1",id:"notificationRules",read:"activeEmployee",write:ADMIN,fields:{preferences:perUser(),deliveries:{...restricted("activeEmployee","activeEmployee"),replaceOnWrite:true}}},
  {key:"momentum-period-locks-v1",id:"periodLocks",read:"activeEmployee",write:ADMIN,fields:{locks:{}}},
];

export const DOMAIN_BY_KEY=new Map(DOMAIN_SPECS.map((spec)=>[spec.key,spec]));
export const ROOT_FIELD="_root";
export const SHARED_ROOT="domains";
export const USER_ROOT="userDomains";
export const USER_SHARD_MANIFEST_VERSION=1;
const USER_CHUNK_MARKER="__chunk_";
const USER_CHUNK_PATTERN=/^(.*)__chunk_(\d{6})$/;
export const isDomainStorageKey=(key:string)=>DOMAIN_BY_KEY.has(key);

const serializedBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const userChunkField=(field:string,index:number)=>`${field}${USER_CHUNK_MARKER}${String(index).padStart(6,"0")}`;

export function resolveUserPhysicalField(spec:DomainSpec,physicalField:string){
  const direct=spec.fields[physicalField];
  if(direct?.userIdField)return{field:physicalField,fieldSpec:direct,isChunk:false};
  const match=physicalField.match(USER_CHUNK_PATTERN);
  if(!match)return null;
  const field=match[1];
  const fieldSpec=spec.fields[field];
  if(!fieldSpec?.userIdField||!fieldSpec.chunkBytes)return null;
  return{field,fieldSpec,isChunk:true};
}

export function chunkManifestShardPaths(spec:DomainSpec,manifestPath:string,data:Record<string,unknown>|null){
  const parsed=parseDocPath(manifestPath);
  if(!parsed?.uid||!data)return[];
  const resolved=resolveUserPhysicalField(spec,parsed.field);
  if(!resolved||resolved.isChunk||!resolved.fieldSpec.chunkBytes||data.shardManifestVersion!==USER_SHARD_MANIFEST_VERSION||!Array.isArray(data.shards))return[];
  const paths:string[]=[];
  for(const candidate of data.shards){
    if(typeof candidate!=="string")continue;
    const physical=resolveUserPhysicalField(spec,candidate);
    if(!physical?.isChunk||physical.field!==resolved.field)continue;
    paths.push(userDocPath(parsed.uid,spec.id,candidate));
  }
  return[...new Set(paths)];
}

export function isChunkManifestPath(spec:DomainSpec,path:string){
  const parsed=parseDocPath(path);
  if(!parsed?.uid||parsed.domainId!==spec.id)return false;
  const resolved=resolveUserPhysicalField(spec,parsed.field);
  return Boolean(resolved&&!resolved.isChunk&&resolved.fieldSpec.chunkBytes);
}

export function emptyDocumentForPath(spec:DomainSpec,path:string):Record<string,unknown>{
  const parsed=parseDocPath(path);
  if(parsed?.uid&&parsed.domainId===spec.id){
    const resolved=resolveUserPhysicalField(spec,parsed.field);
    if(resolved&&!resolved.isChunk&&resolved.fieldSpec.chunkBytes)return{shardManifestVersion:USER_SHARD_MANIFEST_VERSION,shards:[],itemCount:0};
  }
  return parsed?.field===ROOT_FIELD?{data:{}}:{items:[]};
}

function orderedChunkItems(items:unknown[]){
  return [...items].sort((left,right)=>{
    const l=isRecord(left)?left:undefined;const r=isRecord(right)?right:undefined;
    const lt=typeof l?.at==="string"?l.at:typeof l?.createdAt==="string"?l.createdAt:"";
    const rt=typeof r?.at==="string"?r.at:typeof r?.createdAt==="string"?r.createdAt:"";
    return lt.localeCompare(rt)||recordIdentity(left).localeCompare(recordIdentity(right));
  });
}

function chunkItems(items:unknown[],maxBytes:number){
  const chunks:unknown[][]=[];let current:unknown[]=[];
  for(const item of orderedChunkItems(items)){
    const candidate=[...current,item];
    if(current.length&&serializedBytes({items:candidate})>maxBytes){chunks.push(current);current=[item];}
    else current=candidate;
  }
  if(current.length)chunks.push(current);
  return chunks;
}

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
    for(const uid of readableUids){
      if(uid!==scope.uid&&scope.role!=="Administrator"&&!scope.managedUserIds.has(uid)&&!(fieldSpec.salesRepSupervise&&scope.supervisedBrandAmbassadorIds.has(uid)))continue;
      if(uid!==scope.uid&&scope.role!=="Administrator"&&scope.managedUserIds.has(uid)&&fieldSpec.managerRead===false)continue;
      // Chunked fields expose only their small manifest as a static read. The manifest names the bounded
      // chunk documents, which persistence.ts hydrates in a second direct-read pass.
      documents.push({path:userDocPath(uid,spec.id,field),writable:userShardWritable(spec,fieldSpec,uid,scope)});
    }
  }
  return documents;
}

export function userShardWritable(_spec:DomainSpec,fieldSpec:DomainFieldSpec,uid:string,scope:PersistenceScope){if(scope.role==="Customer")return false;if(scope.role==="Administrator")return true;if(uid===scope.uid)return fieldSpec.selfWrite!==false;if(fieldSpec.salesRepSupervise&&scope.role==="Sales Representative"&&scope.supervisedBrandAmbassadorIds.has(uid))return scope.accountState==="Active";if(scope.managedUserIds.has(uid))return fieldSpec.managerWrite!==false&&scope.accountState==="Active";return false;}
export function documentWritable(path:string,scope:PersistenceScope){const parsed=parseDocPath(path);if(!parsed)return false;const spec=DOMAIN_SPECS.find((item)=>item.id===parsed.domainId);if(!spec)return false;if(parsed.uid){const resolved=resolveUserPhysicalField(spec,parsed.field);return Boolean(resolved?.fieldSpec.userIdField)&&userShardWritable(spec,resolved!.fieldSpec,parsed.uid,scope);}const fieldSpec=parsed.field===ROOT_FIELD?undefined:spec.fields[parsed.field];return roleAllows(fieldSpec?.write??spec.write,scope);}
export function documentReplacesOnWrite(path:string){const parsed=parseDocPath(path);if(!parsed||parsed.uid||parsed.field===ROOT_FIELD)return false;const spec=DOMAIN_SPECS.find((item)=>item.id===parsed.domainId);return spec?.fields[parsed.field]?.replaceOnWrite===true;}
const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
export function shardState(spec:DomainSpec,state:unknown):Map<string,Record<string,unknown>>{
  const output=new Map<string,Record<string,unknown>>();if(!isRecord(state))return output;const root:Record<string,unknown>={};
  for(const [key,value] of Object.entries(state)){
    if(spec.omit?.includes(key))continue;const fieldSpec=spec.fields[key];
    if(!Array.isArray(value)||!fieldSpec){root[key]=value;continue;}
    if(!fieldSpec.userIdField){output.set(sharedDocPath(spec.id,key),{items:value});continue;}
    const shared:unknown[]=[];const byUser=new Map<string,unknown[]>();
    for(const item of value){const owner=isRecord(item)?item[fieldSpec.userIdField]:undefined;if(typeof owner==="string"&&owner){const list=byUser.get(owner)??[];list.push(item);byUser.set(owner,list);}else shared.push(item);}
    output.set(sharedDocPath(spec.id,key),{items:shared});
    for(const [uid,items] of byUser){
      if(fieldSpec.chunkBytes){
        const chunks=chunkItems(items,fieldSpec.chunkBytes);const shards:string[]=[];
        chunks.forEach((chunk,index)=>{const physical=userChunkField(key,index);shards.push(physical);output.set(userDocPath(uid,spec.id,physical),{items:chunk});});
        // Keep the historical field path as a tiny manifest. Existing one-document data therefore migrates
        // atomically to chunk documents instead of needing an out-of-band console migration.
        output.set(userDocPath(uid,spec.id,key),{shardManifestVersion:USER_SHARD_MANIFEST_VERSION,shards,itemCount:items.length});
      }else output.set(userDocPath(uid,spec.id,key),{items});
    }
  }
  output.set(sharedDocPath(spec.id,ROOT_FIELD),{data:root});return output;
}
export function assembleState(spec:DomainSpec,documents:Map<string,Record<string,unknown>|null>):Record<string,unknown>|null{
  let found=false;const rootDoc=documents.get(sharedDocPath(spec.id,ROOT_FIELD));const state:Record<string,unknown>=isRecord(rootDoc?.data)?{...rootDoc!.data}:{};if(rootDoc)found=true;
  for(const [field,fieldSpec] of Object.entries(spec.fields)){
    const items:unknown[]=[];const shared=documents.get(sharedDocPath(spec.id,field));if(shared){found=true;if(Array.isArray(shared.items))items.push(...shared.items);}
    if(fieldSpec.userIdField&&fieldSpec.chunkBytes){
      const manifestPaths=[...documents.keys()].filter((path)=>{const parsed=parseDocPath(path);return parsed?.uid&&parsed.domainId===spec.id&&parsed.field===field;}).sort();
      for(const manifestPath of manifestPaths){
        const manifest=documents.get(manifestPath);if(!manifest)continue;found=true;
        // Legacy documents are still readable during migration.
        if(Array.isArray(manifest.items)){items.push(...manifest.items);continue;}
        for(const shardPath of chunkManifestShardPaths(spec,manifestPath,manifest)){
          const shard=documents.get(shardPath);if(shard){found=true;if(Array.isArray(shard.items))items.push(...shard.items);}
        }
      }
      const unique=new Map<string,unknown>();for(const item of items)unique.set(recordIdentity(item),item);state[field]=[...unique.values()];continue;
    }
    const userPaths=[...documents.keys()].filter((path)=>{const parsed=parseDocPath(path);return parsed?.uid&&parsed.domainId===spec.id&&parsed.field===field;}).sort();
    for(const path of userPaths){const doc=documents.get(path);if(doc){found=true;if(Array.isArray(doc.items))items.push(...doc.items);}}
    state[field]=items;
  }
  return found?state:null;
}
export function recordIdentity(item:unknown):string{if(!isRecord(item))return JSON.stringify(item);for(const key of ["id","userId","policyId","actorId"])if(typeof item[key]==="string")return`${key}:${item[key]}`;return JSON.stringify(item);}
export const metaVersionKey=(docPath:string)=>docPath.replace(/[^A-Za-z0-9]+/g,"_");
export const EMPLOYEE_DIRECTORY_META_KEY=metaVersionKey("employeeDirectory");
