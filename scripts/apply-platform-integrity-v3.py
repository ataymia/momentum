from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]

# Apply the already-reviewed integrity core first.
runpy.run_path(str(ROOT / "scripts" / "apply-platform-integrity-core-v2.py"), run_name="__main__")


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH FAILED: expected one match in {path}, found {count}: {old[:160]!r}")
    target.write_text(text.replace(old, new, 1))
    print(f"patched {path}")


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    target = ROOT / path
    text = target.read_text()
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"PATCH FAILED: start marker missing in {path}: {start[:120]!r}")
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f"PATCH FAILED: end marker missing in {path}: {end[:120]!r}")
    target.write_text(text[:a] + replacement.rstrip() + "\n\n" + text[b:])
    print(f"patched {path}")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n")
    print(f"wrote {path}")


# ---------------------------------------------------------------------------
# 1. Persistence invariant: omission is never deletion.
# A normalizer, stale browser, or temporarily incomplete shard may not erase an
# existing array record or root field. Core operational data is append/update;
# explicit lifecycle statuses handle corrections instead of silent deletion.
# ---------------------------------------------------------------------------
replace_between(
    "lib/persistence.ts",
    "function mergeItems(",
    "function mergeRoot(",
    '''function mergeItems(base:unknown[],localItems:unknown[],remote:unknown[]):unknown[]{
  const baseMap=new Map(base.map((item)=>[recordIdentity(item),item]));
  const result=new Map(remote.map((item)=>[recordIdentity(item),item]));
  for(const item of localItems){
    const key=recordIdentity(item);const baseItem=baseMap.get(key);
    // New records and actual local edits win. An omitted record never means delete.
    if(baseItem===undefined||stable(item)!==stable(baseItem)||!result.has(key))result.set(key,item);
  }
  return [...result.values()];
}''',
)
replace_once(
    "lib/persistence.ts",
    '''  for(const key of new Set([...Object.keys(remote),...Object.keys(localData)])){
    const localValue=localData[key];const baseValue=base?.[key];const remoteValue=remote[key];''',
    '''  for(const key of new Set([...Object.keys(remote),...Object.keys(localData)])){
    if(!(key in localData)&&key in remote){output[key]=remote[key];continue;}
    const localValue=localData[key];const baseValue=base?.[key];const remoteValue=remote[key];''',
)
replace_once(
    "lib/persistence.ts",
    '''        const next=shards.get(doc.path)??(parsedPath.field===ROOT_FIELD?{data:{}}:{items:[]});
        const base=this.docs.get(doc.path);''',
    '''        const proposed=shards.get(doc.path)??(parsedPath.field===ROOT_FIELD?{data:{}}:{items:[]});
        const base=this.docs.get(doc.path);
        // Existing Firestore records survive a locally omitted/temporarily unrecognized record.
        const next=base?.data?mergeDocument(base.data,proposed,base.data):proposed;''',
)

# ---------------------------------------------------------------------------
# 2. Multi-SKU orders. Keep legacy aggregate fields for backwards-compatible
# reports and accounting while adding authoritative line items.
# ---------------------------------------------------------------------------
replace_once(
    "lib/types.ts",
    '''export type PaymentStatus = "Not invoiced" | "Open" | "Partially paid" | "Paid";

export type Order = {''',
    '''export type PaymentStatus = "Not invoiced" | "Open" | "Partially paid" | "Paid";

export type OrderLine = {
  id: string;
  product: string;
  cases: number;
  pricePerCase: number;
  amount: number;
  inventoryAvailableAtOrder?: number;
  sourcePlacementId?: string;
  lowStockApprovalRequired?: boolean;
};

export type Order = {''',
)
replace_once(
    "lib/types.ts",
    '''  lowStockApprovalRequired?: boolean;
};''',
    '''  lowStockApprovalRequired?: boolean;
  /** Authoritative SKU breakdown. Legacy single-SKU orders may omit this and are treated as one line. */
  lines?: OrderLine[];
};''',
)

write("lib/order-lines.ts", '''import { canonicalProductDescription, skuForProductName } from "./product-catalog";
import type { InventoryLot, Order, OrderLine } from "./types";

const validPositiveInteger=(value:unknown)=>Number.isInteger(value)&&Number(value)>0;
const validMoney=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>0;
export const productKey=(value:string)=>canonicalProductDescription(value).trim().toLowerCase();
export const productsEquivalent=(left:string,right:string)=>productKey(left)===productKey(right);
export const canonicalOrderProduct=(value:string)=>canonicalProductDescription(value);

export function normalizeStoredOrderLines(value:unknown):OrderLine[]|undefined{
  if(!Array.isArray(value))return undefined;
  const seen=new Set<string>();const lines:OrderLine[]=[];
  for(const raw of value){
    if(!raw||typeof raw!=="object")continue;
    const item=raw as Partial<OrderLine>;const product=typeof item.product==="string"?canonicalOrderProduct(item.product):"";
    if(!item.id||seen.has(item.id)||!product||!validPositiveInteger(item.cases)||!validMoney(item.pricePerCase))continue;
    const amount=Number(item.cases)*Number(item.pricePerCase);
    if(!Number.isFinite(item.amount)||Math.abs(Number(item.amount)-amount)>0.01)continue;
    seen.add(item.id);lines.push({id:item.id,product,cases:Number(item.cases),pricePerCase:Number(item.pricePerCase),amount,inventoryAvailableAtOrder:typeof item.inventoryAvailableAtOrder==="number"&&Number.isFinite(item.inventoryAvailableAtOrder)&&item.inventoryAvailableAtOrder>=0?item.inventoryAvailableAtOrder:undefined,sourcePlacementId:typeof item.sourcePlacementId==="string"&&item.sourcePlacementId.trim()?item.sourcePlacementId.trim():undefined,lowStockApprovalRequired:item.lowStockApprovalRequired===true||undefined});
  }
  return lines.length?lines:undefined;
}

export function orderLinesFor(order:Order):OrderLine[]{
  const stored=normalizeStoredOrderLines(order.lines);if(stored?.length)return stored;
  return [{id:`${order.id}-line-1`,product:canonicalOrderProduct(order.product??"Golden Eagle"),cases:order.cases,pricePerCase:order.pricePerCase,amount:order.amount,inventoryAvailableAtOrder:order.inventoryAvailableAtOrder,sourcePlacementId:order.sourcePlacementId,lowStockApprovalRequired:order.lowStockApprovalRequired}];
}
export function orderAcceptsProduct(order:Order,product:string){return orderLinesFor(order).some((line)=>productsEquivalent(line.product,product));}
export function orderCasesForProduct(order:Order,product:string){return orderLinesFor(order).filter((line)=>productsEquivalent(line.product,product)).reduce((sum,line)=>sum+line.cases,0);}
export function orderProductLabel(order:Order){const lines=orderLinesFor(order);return lines.length===1?lines[0].product:`${lines.length} products`;}
export function matchingInventoryLots(lots:InventoryLot[],product:string){return lots.filter((lot)=>productsEquivalent(lot.product,product));}
export function catalogSkuKnown(value:string){return Boolean(skuForProductName(value));}
''')

# Preserve line items through both workspace normalizers.
replace_once("lib/workspace-normalization.ts", 'import { normalizeUsername } from "./username";', 'import { normalizeUsername } from "./username";\nimport { normalizeStoredOrderLines } from "./order-lines";')
replace_once(
    "lib/workspace-normalization.ts",
    '''    const creditedRepId = optionalText(value.creditedRepId); const sourcePlacementId = optionalText(value.sourcePlacementId);
    if (creditedRepId && users.find((user) => user.id === creditedRepId)?.role !== "Sales Representative") return [];
    return [{ id, number: text(value.number), accountId, cases, pricePerCase: price, amount, status: safeStatus as Order["status"], placedAt: text(value.placedAt), ownerId, paidAt: optionalText(value.paidAt), firstSettledAt: optionalText(value.firstSettledAt), priceBasis: text(value.priceBasis), paymentStatus: safePaymentStatus as Order["paymentStatus"], product: optionalText(value.product), creditedRepId, sourcePlacementId, inventoryAvailableAtOrder: finite(value.inventoryAvailableAtOrder) ? Number(value.inventoryAvailableAtOrder) : undefined, lowStockApprovalRequired: typeof value.lowStockApprovalRequired === "boolean" ? value.lowStockApprovalRequired : undefined }];''',
    '''    const creditedRepId = optionalText(value.creditedRepId); const sourcePlacementId = optionalText(value.sourcePlacementId);
    if (creditedRepId && users.find((user) => user.id === creditedRepId)?.role !== "Sales Representative") return [];
    const lines=normalizeStoredOrderLines(value.lines);
    if(lines&&(lines.reduce((sum,line)=>sum+line.cases,0)!==cases||Math.abs(lines.reduce((sum,line)=>sum+line.amount,0)-amount)>0.01))return [];
    return [{ id, number: text(value.number), accountId, cases, pricePerCase: price, amount, status: safeStatus as Order["status"], placedAt: text(value.placedAt), ownerId, paidAt: optionalText(value.paidAt), firstSettledAt: optionalText(value.firstSettledAt), priceBasis: text(value.priceBasis), paymentStatus: safePaymentStatus as Order["paymentStatus"], product: optionalText(value.product), creditedRepId, sourcePlacementId, inventoryAvailableAtOrder: finite(value.inventoryAvailableAtOrder) ? Number(value.inventoryAvailableAtOrder) : undefined, lowStockApprovalRequired: typeof value.lowStockApprovalRequired === "boolean" ? value.lowStockApprovalRequired : undefined, lines }];''',
)
replace_once("lib/commercial-state.ts", 'import type { Account, Activity, Appointment, Approval, InventoryLot, Order, PricingTier, SalesTerritory, WorkspaceData } from "./types";', 'import type { Account, Activity, Appointment, Approval, CustomerAccount, InventoryLot, Order, PricingTier, SalesTerritory, WorkspaceData } from "./types";\nimport { normalizeStoredOrderLines } from "./order-lines";')
replace_once(
    "lib/commercial-state.ts",
    '''    const sourcePlacementId = optionalText(raw.sourcePlacementId);
    const settlementEvidence = optionalText(raw.firstSettledAt) || optionalText(raw.paidAt);''',
    '''    const sourcePlacementId = optionalText(raw.sourcePlacementId);
    const lines=normalizeStoredOrderLines(raw.lines);
    if(lines&&(lines.reduce((sum,line)=>sum+line.cases,0)!==cases||Math.abs(lines.reduce((sum,line)=>sum+line.amount,0)-amount)>0.01))return [];
    const settlementEvidence = optionalText(raw.firstSettledAt) || optionalText(raw.paidAt);''',
)
replace_once(
    "lib/commercial-state.ts",
    '''lowStockApprovalRequired: typeof raw.lowStockApprovalRequired === "boolean" ? raw.lowStockApprovalRequired : undefined }];''',
    '''lowStockApprovalRequired: typeof raw.lowStockApprovalRequired === "boolean" ? raw.lowStockApprovalRequired : undefined, lines }];''',
)

# ---------------------------------------------------------------------------
# 3. Customer commercial setup stays inside the existing commercial domain.
# No new Firestore domain, rule, function, index, or migration is introduced.
# ---------------------------------------------------------------------------
replace_once(
    "lib/commercial-state.ts",
    '''export type CommercialAccountPatch = Partial<Pick<Account, "premiseType" | "businessType" | "categoryReviewDate" | "pricingTier" | "pricingUpdatedAt" | "pricingUpdatedBy" | "ownerId" | "accountManagerId" | "responsibilityStartedAt" | "lastActivity" | "nextAction" | "nextActionDate" | "stage" | "closerId" | "lifetimeCases" | "reorderCount" | "postalCode">>;
export type CommercialState = { version: 1; accountPatches: Record<string, CommercialAccountPatch>; orders: Order[]; appointments: Appointment[]; approvals: Approval[]; activities: Activity[]; inventoryLots: InventoryLot[]; territories: SalesTerritory[] };''',
    '''export type CommercialAccountPatch = Partial<Pick<Account, "premiseType" | "businessType" | "categoryReviewDate" | "pricingTier" | "pricingUpdatedAt" | "pricingUpdatedBy" | "ownerId" | "accountManagerId" | "responsibilityStartedAt" | "lastActivity" | "nextAction" | "nextActionDate" | "stage" | "closerId" | "lifetimeCases" | "reorderCount" | "postalCode" | "programPricingLabel" | "programPricePerCase" | "programPricingEffectiveDate" | "programPricingExpirationDate" | "programPricingStatus" | "programPricingOwnerId" | "lastMeaningfulBusinessAt">>;
export type CommercialCustomerPatch = Partial<Pick<CustomerAccount,"name"|"billingContactName"|"billingEmail"|"billingPhone"|"ein"|"accountsPayableContactName"|"accountsPayablePhone"|"accountsPayableEmail"|"az5000Number"|"taxExemptionStatus"|"creditStatus"|"paymentTerms"|"customPaymentTerms"|"onboardingPackageStatus"|"onboardingPackagePreparedAt"|"onboardingPackagePreparedBy"|"onboardingProviderStatus"|"notes">>;
export type CommercialState = { version: 1; accountPatches: Record<string, CommercialAccountPatch>; customerPatches: Record<string,CommercialCustomerPatch>; orders: Order[]; appointments: Appointment[]; approvals: Approval[]; activities: Activity[]; inventoryLots: InventoryLot[]; territories: SalesTerritory[] };''',
)
replace_once(
    "lib/commercial-state.ts",
    '''  return { version: 1, accountPatches, orders: [], appointments: [], approvals: [], activities: [], inventoryLots: [], territories: normalizeTerritories(data.territories??[],data.users) };''',
    '''  return { version: 1, accountPatches, customerPatches:{}, orders: [], appointments: [], approvals: [], activities: [], inventoryLots: [], territories: normalizeTerritories(data.territories??[],data.users) };''',
)
replace_once(
    "lib/commercial-state.ts",
    '''  const rawOrders = Array.isArray(input.orders) ? input.orders : [];''',
    '''  const customerIds=new Set((data.customers??[]).map((customer)=>customer.id));
  const paymentTerms=new Set(["COD","Net 30","Custom"]);const creditStatuses=new Set(["COD","Credit Requested","Credit Under Review","Net 30 Approved","Credit Declined","Personal Guaranty Required"]);const taxStatuses=new Set(["Not exempt","Requested","Received","Verified","Missing"]);const onboardingStatuses=new Set(["Not started","Prepared","Awaiting provider","Sent externally","Complete"]);const providerStatuses=new Set(["Provider not selected","Ready to connect","Connected"]);
  const customerPatches:Record<string,CommercialCustomerPatch>={};
  if(object(input.customerPatches))for(const[customerId,raw]of Object.entries(input.customerPatches)){
    if(!customerIds.has(customerId)||!object(raw))continue;const patch:CommercialCustomerPatch={};
    for(const field of ["name","billingContactName","billingEmail","billingPhone","ein","accountsPayableContactName","accountsPayablePhone","accountsPayableEmail","az5000Number","customPaymentTerms","notes"] as const){const value=optionalText(raw[field]);if(value)patch[field]=value as never;}
    const payment=optionalText(raw.paymentTerms);if(payment&&paymentTerms.has(payment))patch.paymentTerms=payment as CommercialCustomerPatch["paymentTerms"];
    const credit=optionalText(raw.creditStatus);if(credit&&creditStatuses.has(credit))patch.creditStatus=credit as CommercialCustomerPatch["creditStatus"];
    const tax=optionalText(raw.taxExemptionStatus);if(tax&&taxStatuses.has(tax))patch.taxExemptionStatus=tax as CommercialCustomerPatch["taxExemptionStatus"];
    const onboarding=optionalText(raw.onboardingPackageStatus);if(onboarding&&onboardingStatuses.has(onboarding))patch.onboardingPackageStatus=onboarding as CommercialCustomerPatch["onboardingPackageStatus"];
    const provider=optionalText(raw.onboardingProviderStatus);if(provider&&providerStatuses.has(provider))patch.onboardingProviderStatus=provider as CommercialCustomerPatch["onboardingProviderStatus"];
    if(validInstant(raw.onboardingPackagePreparedAt))patch.onboardingPackagePreparedAt=text(raw.onboardingPackagePreparedAt);const preparedBy=optionalText(raw.onboardingPackagePreparedBy);if(preparedBy)patch.onboardingPackagePreparedBy=preparedBy;
    customerPatches[customerId]=patch;
  }

  const rawOrders = Array.isArray(input.orders) ? input.orders : [];''',
)
replace_once(
    "lib/commercial-state.ts",
    '''  return { version: 1, accountPatches, orders, appointments, approvals, activities, inventoryLots, territories };''',
    '''  return { version: 1, accountPatches, customerPatches, orders, appointments, approvals, activities, inventoryLots, territories };''',
)

# Extend enhanced workspace data/mutations.
replace_once("lib/workspace-context.tsx", 'import { paidAccountRollupAfterPayment } from "./workspace-controls";', 'import { paidAccountRollupAfterPayment } from "./workspace-controls";\nimport { canonicalProductDescription } from "./product-catalog";\nimport { productsEquivalent } from "./order-lines";')
replace_once(
    "lib/workspace-context.tsx",
    '''type CommercialAccountPatch = Partial<Pick<Account, "premiseType" | "businessType" | "categoryReviewDate" | "pricingTier" | "pricingUpdatedAt" | "pricingUpdatedBy" | "ownerId" | "accountManagerId" | "responsibilityStartedAt" | "lastActivity" | "nextAction" | "nextActionDate" | "stage" | "closerId" | "lifetimeCases" | "reorderCount" | "postalCode" | "latitude" | "longitude" | "geocodePrecision" | "geocodeProvider" | "geocodedAt" | "geocodeFingerprint" | "geocodeStatus" | "territoryId" | "strategic">>;''',
    '''type CommercialAccountPatch = Partial<Pick<Account, "premiseType" | "businessType" | "categoryReviewDate" | "pricingTier" | "pricingUpdatedAt" | "pricingUpdatedBy" | "ownerId" | "accountManagerId" | "responsibilityStartedAt" | "lastActivity" | "nextAction" | "nextActionDate" | "stage" | "closerId" | "lifetimeCases" | "reorderCount" | "postalCode" | "latitude" | "longitude" | "geocodePrecision" | "geocodeProvider" | "geocodedAt" | "geocodeFingerprint" | "geocodeStatus" | "territoryId" | "strategic" | "programPricingLabel" | "programPricePerCase" | "programPricingEffectiveDate" | "programPricingExpirationDate" | "programPricingStatus" | "programPricingOwnerId" | "lastMeaningfulBusinessAt">>;
type CommercialCustomerPatch = Partial<Pick<CustomerAccount,"name"|"billingContactName"|"billingEmail"|"billingPhone"|"ein"|"accountsPayableContactName"|"accountsPayablePhone"|"accountsPayableEmail"|"az5000Number"|"taxExemptionStatus"|"creditStatus"|"paymentTerms"|"customPaymentTerms"|"onboardingPackageStatus"|"onboardingPackagePreparedAt"|"onboardingPackagePreparedBy"|"onboardingProviderStatus"|"notes">>;''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''  accountPatches: Record<string, CommercialAccountPatch>;
  orders: Order[];''',
    '''  accountPatches: Record<string, CommercialAccountPatch>;
  customerPatches: Record<string,CommercialCustomerPatch>;
  orders: Order[];''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''  return { version: 1, accountPatches, orders: [], appointments: [], approvals: [], activities: [], inventoryLots: [], territories: data.territories??[] };''',
    '''  return { version: 1, accountPatches, customerPatches:{}, orders: [], appointments: [], approvals: [], activities: [], inventoryLots: [], territories: data.territories??[] };''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    const accounts = base.data.accounts.map((account) => ({ ...account, ...(commercial.accountPatches[account.id] ?? {}) }));''',
    '''    const customers=(base.data.customers??[]).map((customer)=>({...customer,...(commercial.customerPatches[customer.id]??{}),paymentTerms:(commercial.customerPatches[customer.id]?.paymentTerms??customer.paymentTerms??"COD")}));
    const accounts = base.data.accounts.map((account) => ({ ...account, ...(commercial.accountPatches[account.id] ?? {}) }));''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''      users,
      inventory,
      accounts,''',
    '''      users,
      customers,
      inventory,
      accounts,''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''type EnhancedOrderInput = { accountId: string; cases: number; pricePerCase?: number; product?: string; inventoryAvailableAtOrder?: number; sourcePlacementId?: string };''',
    '''type EnhancedOrderLineInput={product:string;cases:number;inventoryAvailableAtOrder?:number;sourcePlacementId?:string};
type EnhancedOrderInput = { accountId: string; cases?: number; pricePerCase?: number; product?: string; inventoryAvailableAtOrder?: number; sourcePlacementId?: string; lines?:EnhancedOrderLineInput[] };''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''  updateAccountCommercial: (accountId: string, patch: CommercialAccountInput) => boolean;''',
    '''  updateAccountCommercial: (accountId: string, patch: CommercialAccountInput & Partial<Pick<Account,"programPricingLabel"|"programPricePerCase"|"programPricingEffectiveDate"|"programPricingExpirationDate"|"programPricingStatus">>) => boolean;
  updateCustomerCommercial:(customerId:string,patch:CommercialCustomerPatch)=>boolean;
  claimUnassignedProspect:(accountId:string)=>boolean;
  releaseProspectOwnership:(accountId:string,reason:string)=>boolean;''',
)

# Reconcile customerPatch defaults when reading older state.
replace_once(
    "lib/workspace-context.tsx",
    '''    return normalizeCommercialState(parsed, data, today());''',
    '''    return normalizeCommercialState(parsed, data, today());''',
)

# Whole create-order function is replaced so one request can contain any positive case count across many SKUs.
replace_between(
    "lib/workspace-context.tsx",
    "  const createOrder = (",
    "  const decideApproval =",
    '''  const createOrder = (input: EnhancedOrderInput) => {
    const {accountId}=input;
    if (!currentUser || !["Administrator", "Sales Manager", "Sales Representative", "Customer"].includes(currentUser.role)) return null;
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account || !accountIsVisible(data, currentUser, account)) return null;
    if(currentUser.role==="Sales Representative"&&!documentTerritoryDeviation(account,currentUser.id,"placing an order"))return null;
    const pricing=evaluatePartnerPricing(data,accountId);const price=pricing.currentPricePerCase;
    if(!Number.isFinite(price)||!price||price<=0)return null;
    const supplied=input.lines?.length?input.lines:[{product:input.product?.trim()||data.inventory[0]?.product||"Golden Eagle",cases:input.cases??0,inventoryAvailableAtOrder:input.inventoryAvailableAtOrder,sourcePlacementId:input.sourcePlacementId}];
    const grouped=new Map<string,EnhancedOrderLineInput>();
    for(const candidate of supplied){
      const product=canonicalProductDescription(candidate.product);const cases=Number(candidate.cases);
      if(!product||!Number.isInteger(cases)||cases<1)return null;
      const key=product.toLowerCase();const existing=grouped.get(key);
      grouped.set(key,{product,cases:(existing?.cases??0)+cases,inventoryAvailableAtOrder:Math.min(existing?.inventoryAvailableAtOrder??Number.POSITIVE_INFINITY,typeof candidate.inventoryAvailableAtOrder==="number"&&Number.isFinite(candidate.inventoryAvailableAtOrder)&&candidate.inventoryAvailableAtOrder>=0?candidate.inventoryAvailableAtOrder:0),sourcePlacementId:candidate.sourcePlacementId??existing?.sourcePlacementId});
    }
    const lineInputs=[...grouped.values()];if(!lineInputs.length)return null;
    const id=uid("ord");const number=`GE-${Date.now().toString().slice(-9)}`;const creditedRepId=currentUser.role==="Sales Representative"?currentUser.id:undefined;
    const priceBasis=pricing.effectiveTier?`Tier ${pricing.effectiveTier} · ${pricing.status}`:pricing.status;
    const lines=lineInputs.map((line,index)=>{
      const sourcePlacement=line.sourcePlacementId?data.placements.find((placement)=>placement.id===line.sourcePlacementId&&placement.accountId===accountId&&productsEquivalent(placement.product,line.product)):undefined;
      const available=Number.isFinite(line.inventoryAvailableAtOrder)?Number(line.inventoryAvailableAtOrder):0;
      return{id:`${id}-line-${index+1}`,product:line.product,cases:line.cases,pricePerCase:price,amount:line.cases*price,inventoryAvailableAtOrder:available,sourcePlacementId:sourcePlacement?.id,lowStockApprovalRequired:available<50};
    });
    const cases=lines.reduce((sum,line)=>sum+line.cases,0);const amount=lines.reduce((sum,line)=>sum+line.amount,0);const lowStock=lines.some((line)=>line.lowStockApprovalRequired);const available=Math.min(...lines.map((line)=>line.inventoryAvailableAtOrder??0));
    const product=lines.length===1?lines[0].product:"Multiple products";
    const order:Order={id,number,accountId,cases,pricePerCase:price,amount,status:"Awaiting approval",placedAt:today(),ownerId:currentUser.id,creditedRepId,sourcePlacementId:lines.length===1?lines[0].sourcePlacementId:undefined,product,inventoryAvailableAtOrder:available,lowStockApprovalRequired:lowStock,priceBasis,paymentStatus:"Not invoiced",lines};
    const lineSummary=lines.map((line)=>`${line.cases} ${line.product}`).join(" · ");
    const approval:Approval={id:uid("apr"),type:lowStock?"Low stock sale":"Order",title:lowStock?`Low-stock approval · ${number}`:`Review order ${number}`,detail:`${lineSummary} · ${cases} total cases · ${account.locationName??account.name}`,requestedBy:currentUser.name,requesterId:currentUser.id,recordId:id,team:currentUser.role==="Customer"?"Sales":currentUser.team,submittedAt:now(),dueAt:new Date(Date.now()+86400000).toISOString(),priority:lowStock?"Urgent":"High",status:"Pending"};
    setCommercial((state)=>({...state,orders:[order,...state.orders],approvals:[approval,...state.approvals],accountPatches:{...state.accountPatches,[accountId]:{...(state.accountPatches[accountId]??{}),stage:"Opening order",lastActivity:`Order request ${number} submitted`}},activities:[{id:uid("act-order"),accountId,type:"order",title:lowStock?"Low-stock order submitted":"Order submitted",detail:`${number} · ${lineSummary} · ${cases} total cases · ${price.toFixed(2)}/case.`,at:now(),userId:currentUser.id},...state.activities]}));
    window.setTimeout(()=>void momentumStorage.flush(),0);
    return id;
  };''',
)

# Customer setup + prospect claim/release + program pricing mutations.
replace_once(
    "lib/workspace-context.tsx",
    '''  const saveTerritory=(input:TerritoryInput):TerritoryMutationResult=>{''',
    '''  const updateCustomerCommercial=(customerId:string,patch:CommercialCustomerPatch)=>{
    if(!currentUser||!["Administrator","Sales Manager"].includes(currentUser.role))return false;
    const customer=(data.customers??[]).find((item)=>item.id===customerId);if(!customer)return false;
    if(patch.paymentTerms==="Net 30"&&patch.creditStatus!=="Net 30 Approved"&&customer.creditStatus!=="Net 30 Approved")return false;
    if(patch.paymentTerms==="Custom"&&!patch.customPaymentTerms?.trim())return false;
    const clean={...patch,...(patch.paymentTerms?{}:{paymentTerms:customer.paymentTerms??"COD"})};
    setCommercial((state)=>({...state,customerPatches:{...state.customerPatches,[customerId]:{...(state.customerPatches[customerId]??{}),...clean}},activities:[{id:uid("act-customer-commercial"),type:"note",title:"Customer commercial setup updated",detail:`${customer.name} commercial setup updated by ${currentUser.name}.`,at:now(),userId:currentUser.id},...state.activities]}));return true;
  };

  const claimUnassignedProspect=(accountId:string)=>{
    if(!currentUser||currentUser.role!=="Sales Representative")return false;const account=data.accounts.find((item)=>item.id===accountId);
    if(!account||account.stage!=="Prospect"||account.ownerId)return false;
    setCommercial((state)=>({...state,accountPatches:{...state.accountPatches,[accountId]:{...(state.accountPatches[accountId]??{}),ownerId:currentUser.id,accountManagerId:currentUser.id,responsibilityStartedAt:now(),lastActivity:`Prospect claimed by ${currentUser.name}`}},activities:[{id:uid("act-claim"),accountId,type:"note",title:"Unassigned prospect claimed",detail:`${currentUser.name} claimed the existing prospect record. No duplicate was created.`,at:now(),userId:currentUser.id},...state.activities]}));return true;
  };
  const releaseProspectOwnership=(accountId:string,reason:string)=>{
    if(!currentUser||reason.trim().length<3)return false;const account=data.accounts.find((item)=>item.id===accountId);
    if(!account||account.stage!=="Prospect"||!account.ownerId)return false;
    const allowed=currentUser.role==="Administrator"||currentUser.role==="Sales Manager"||account.ownerId===currentUser.id;if(!allowed)return false;
    setCommercial((state)=>({...state,accountPatches:{...state.accountPatches,[accountId]:{...(state.accountPatches[accountId]??{}),ownerId:"",accountManagerId:"",responsibilityStartedAt:now(),lastActivity:`Prospect released: ${reason.trim()}`}},activities:[{id:uid("act-release"),accountId,type:"note",title:"Prospect returned to unassigned pool",detail:reason.trim(),at:now(),userId:currentUser.id},...state.activities]}));return true;
  };

  const saveTerritory=(input:TerritoryInput):TerritoryMutationResult=>{''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    const cleanPatch: CommercialAccountInput = { ...patch, ...(patch.businessType !== undefined ? { businessType: patch.businessType.trim() } : {}), ...(postalCode?{postalCode}:{}) };''',
    '''    const programChanged="programPricePerCase" in patch||"programPricingEffectiveDate" in patch||"programPricingExpirationDate" in patch||"programPricingStatus" in patch||"programPricingLabel" in patch;
    if(programChanged&&currentUser.role==="Sales Representative")return false;
    if(patch.programPricePerCase!==undefined&&(!Number.isFinite(patch.programPricePerCase)||patch.programPricePerCase<=0))return false;
    if(patch.programPricingEffectiveDate&&!isValidCalendarDateKey(patch.programPricingEffectiveDate))return false;
    if(patch.programPricingExpirationDate&&!isValidCalendarDateKey(patch.programPricingExpirationDate))return false;
    if(patch.programPricingEffectiveDate&&patch.programPricingExpirationDate&&patch.programPricingExpirationDate<patch.programPricingEffectiveDate)return false;
    const cleanPatch = { ...patch, ...(patch.businessType !== undefined ? { businessType: patch.businessType.trim() } : {}), ...(postalCode?{postalCode}:{}) } as CommercialAccountPatch;''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''          ...(pricingChanged ? { pricingUpdatedAt: now(), pricingUpdatedBy: currentUser.id } : {}),''',
    '''          ...(pricingChanged ? { pricingUpdatedAt: now(), pricingUpdatedBy: currentUser.id } : {}),
          ...(programChanged?{programPricingOwnerId:currentUser.id}:{})''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''const value: EnhancedWorkspace = { ...base, data, scope, currentUser, login, logout, toggleClock, switchUser, createAccount, createOrder, createAppointment, advanceAppointment, completeAppointment, reassignAppointment, moveAppointment, updatePlacement, correctTimeEntry, decideApproval, setOrderStatus, reconcileOrderPayment, updateAccountCommercial, patchAccountLocation, transferAccountResponsibility, saveTerritory, importInventoryLots, resetDemo };''',
    '''const value: EnhancedWorkspace = { ...base, data, scope, currentUser, login, logout, toggleClock, switchUser, createAccount, createOrder, createAppointment, advanceAppointment, completeAppointment, reassignAppointment, moveAppointment, updatePlacement, correctTimeEntry, decideApproval, setOrderStatus, reconcileOrderPayment, updateAccountCommercial, updateCustomerCommercial, claimUnassignedProspect, releaseProspectOwnership, patchAccountLocation, transferAccountResponsibility, saveTerritory, importInventoryLots, resetDemo };''',
)

# Sales representatives can see the unassigned Prospect pool and claim an existing record.
replace_once(
    "lib/access.ts",
    '''  if (user.role === "Sales Representative") return Boolean(account.ownerId) && account.ownerId === user.id;''',
    '''  if (user.role === "Sales Representative") return account.ownerId === user.id || (!account.ownerId && account.stage === "Prospect");''',
)
# Reps request events; management assigns BAs.
replace_between(
    "lib/access.ts",
    "export const canSuperviseBrandAmbassador =",
    "export const canAssignScheduleUser =",
    '''export const canSuperviseBrandAmbassador = (data: WorkspaceData, actor: WorkspaceUser | null | undefined, targetUserId: string) => {
  if (!actor) return false;
  const target = data.users.find((user) => user.id === targetUserId && user.role === "Brand Ambassador");
  return Boolean(target && actor.role === "Administrator");
};''',
)

# Auto-release Prospect ownership from actual CRM visit evidence.
replace_once("lib/crm-context.tsx", 'import { useWorkspace } from "./workspace-context";', 'import { useWorkspace } from "./workspace-context";\nimport { prospectOwnershipReleaseReason } from "./sales-field-engine";')
replace_once(
    "lib/crm-context.tsx",
    '''  const { data, scope, currentUser } = useWorkspace();''',
    '''  const { data, scope, currentUser, releaseProspectOwnership } = useWorkspace();''',
)
replace_once(
    "lib/crm-context.tsx",
    '''  useRemoteStorageSync(CRM_STORAGE_KEY, () => setCrm(read()));''',
    '''  useRemoteStorageSync(CRM_STORAGE_KEY, () => setCrm(read()));
  useEffect(()=>{
    if(!currentUser)return;for(const account of data.accounts){const reason=prospectOwnershipReleaseReason(account,state.interactions);if(reason)releaseProspectOwnership(account.id,reason);}
  },[currentUser,data.accounts,state.interactions,releaseProspectOwnership]);''',
)

# ---------------------------------------------------------------------------
# 4. Inventory understands canonical SKU aliases and multi-line order limits.
# ---------------------------------------------------------------------------
replace_once("lib/inventory-ledger.ts", 'import type { InventoryLot, Order, WorkspaceData } from "./types";', 'import type { InventoryLot, Order, WorkspaceData } from "./types";\nimport { orderAcceptsProduct, orderCasesForProduct, productsEquivalent } from "./order-lines";')
replace_once("lib/inventory-ledger.ts", 'if(order&&order.product&&order.product!==lot.product)return false;', 'if(order&&!orderAcceptsProduct(order,lot.product))return false;')
replace_once(
    "lib/inventory-ledger.ts",
    '''export function productAvailableSellableCases(state:InventoryLedgerState,data:WorkspaceData,product:string){return data.inventory.filter((lot)=>lot.product===product&&lot.status!=="Quality hold").reduce((sum,lot)=>sum+warehouseAvailable(state,lot.id),0);}''',
    '''export function productAvailableSellableCases(state:InventoryLedgerState,data:WorkspaceData,product:string){return data.inventory.filter((lot)=>productsEquivalent(lot.product,product)&&lot.status!=="Quality hold").reduce((sum,lot)=>sum+warehouseAvailable(state,lot.id),0);}''',
)
replace_between(
    "lib/inventory-ledger.ts",
    "export function reservationCanCreate(",
    "export function movementCanPost(",
    '''export function activeReservedForOrderProduct(state:InventoryLedgerState,data:WorkspaceData,orderId:string,product:string){
  const lotIds=new Set(data.inventory.filter((lot)=>productsEquivalent(lot.product,product)).map((lot)=>lot.id));
  return state.reservations.filter((reservation)=>reservation.orderId===orderId&&reservation.status==="Active"&&lotIds.has(reservation.lotId)).reduce((sum,item)=>sum+item.quantity,0);
}
export function reservationCanCreate(state:InventoryLedgerState,data:WorkspaceData,orderId:string,lotId:string,quantity:number){
  if(!positiveFiniteQuantity(quantity))return false;
  const order=data.orders.find((item)=>item.id===orderId);const lot=data.inventory.find((item)=>item.id===lotId);
  if(!order||!lot||!["Approved","Allocated"].includes(order.status)||!positiveFiniteQuantity(order.cases)||lot.status==="Quality hold")return false;
  const allowedForProduct=orderCasesForProduct(order,lot.product);if(allowedForProduct<=0)return false;
  if(activeReservedForOrderProduct(state,data,orderId,lot.product)+quantity>allowedForProduct)return false;
  if(quantity>warehouseAvailable(state,lotId))return false;
  return true;
}''',
)
replace_once("lib/inventory-ledger-context-v2.tsx", 'import { useWorkspace } from "./workspace-context";', 'import { useWorkspace } from "./workspace-context";\nimport { orderAcceptsProduct } from "./order-lines";')
replace_once("lib/inventory-ledger-context-v2.tsx", 'if(order&&order.product&&order.product!==lot.product)return null;', 'if(order&&!orderAcceptsProduct(order,lot.product))return null;')

# Canonical inventory quick-add names, including Strawberry. No historical PO balances are seeded.
replace_once("components/pages/inventory.tsx", 'import { holdNodeId, nodeLotBalance, warehouseAvailable } from "../../lib/inventory-ledger";', 'import { holdNodeId, nodeLotBalance, warehouseAvailable } from "../../lib/inventory-ledger";\nimport { GOLDEN_EAGLE_SKUS } from "../../lib/product-catalog";')
replace_once("components/pages/inventory.tsx", 'const quickProducts=["Tropical","Sugar Free","Original","Red","Blue"] as const;', 'const quickProducts=GOLDEN_EAGLE_SKUS.filter((sku)=>sku.active).map((sku)=>sku.description);')

# ---------------------------------------------------------------------------
# 5. COD/default invoice terms based on approved customer setup.
# ---------------------------------------------------------------------------
replace_once(
    "lib/commerce-engine.ts",
    '''export function createCommerceSeed(data:WorkspaceData):CommerceState{
  const invoices:Invoice[]=data.orders.filter((order)=>eligibleForInvoice(order.status)||order.paymentStatus!=="Not invoiced").filter((order)=>finiteNonNegative(order.amount)).map((order)=>{const createdAt=now();return{id:`invoice-${order.id}`,number:invoiceNumber(order.number),orderId:order.id,accountId:order.accountId,issuedAt:createdAt,terms:"Prepaid",total:order.amount,status:order.paymentStatus==="Paid"?"Paid":order.paymentStatus==="Partially paid"?"Partially paid":"Open",createdAt};});''',
    '''export function createCommerceSeed(data:WorkspaceData):CommerceState{
  const invoices:Invoice[]=data.orders.filter((order)=>eligibleForInvoice(order.status)||order.paymentStatus!=="Not invoiced").filter((order)=>finiteNonNegative(order.amount)).map((order)=>{const createdAt=now();const account=data.accounts.find((item)=>item.id===order.accountId);const customer=(data.customers??[]).find((item)=>item.id===account?.customerId);const approvedNet30=customer?.creditStatus==="Net 30 Approved"&&customer.paymentTerms==="Net 30";const terms:InvoiceTerms=approvedNet30?"Net 30":customer?.paymentTerms==="Custom"&&customer.customPaymentTerms?.trim()?"Custom":"COD";return{id:`invoice-${order.id}`,number:invoiceNumber(order.number),orderId:order.id,accountId:order.accountId,issuedAt:createdAt,terms,total:order.amount,status:order.paymentStatus==="Paid"?"Paid":order.paymentStatus==="Partially paid"?"Partially paid":"Open",createdAt};});''',
)

# ---------------------------------------------------------------------------
# 6. Order entry UI v3: unlimited positive whole cases and add-many-SKU cart.
# ---------------------------------------------------------------------------
write("components/pages/orders-v3.tsx", '''"use client";
import { AlertCircle, Box, CheckCircle2, ChevronRight, CircleDollarSign, Copy, FileText, PackageSearch, Plus, Store, Trash2, Truck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { canAdvanceFulfillment, canCreateOrder, isCustomer } from "../../lib/access";
import { activeReservedForOrder, orderCanAdvanceInventory, orderDeliveryQuantity, orderOutboundQuantity, productInventoryStatus } from "../../lib/inventory-ledger";
import { useInventoryLedger } from "../../lib/inventory-ledger-context";
import { orderLinesFor } from "../../lib/order-lines";
import { GOLDEN_EAGLE_SKUS } from "../../lib/product-catalog";
import { evaluatePartnerPricing } from "../../lib/pricing-engine";
import type { OrderStatus } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, PageHeader, Section, StatusPill, formatMoney } from "../ui";
const lifecycle:OrderStatus[]=["Draft","Awaiting approval","Approved","Allocated","Out for delivery","Delivered","Paid"];
const fulfillmentNext:Partial<Record<OrderStatus,"Allocated"|"Out for delivery"|"Delivered">>={Approved:"Allocated",Allocated:"Out for delivery","Out for delivery":"Delivered"};
const tone=(status:OrderStatus)=>["Paid","Delivered"].includes(status)?"success" as const:status==="Awaiting approval"?"warning" as const:status==="Draft"?"neutral" as const:"info" as const;
type DraftLine={id:string;product:string;cases:number};const skuOptions=GOLDEN_EAGLE_SKUS.filter((sku)=>sku.active);
const newLine=(product=skuOptions[0]?.description??"Golden Eagle",cases=10):DraftLine=>({id:`draft-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,product,cases});
export function OrdersPage(){
 const{data,scope,currentUser,createOrder,navigate}=useWorkspace();const{ledger,advanceOrderFulfillment}=useInventoryLedger();
 const focusId=typeof window!=="undefined"?sessionStorage.getItem("momentum-focus-record"):null;const focused=scope.orders.find((o)=>o.id===focusId);const focusedAccount=scope.accounts.find((a)=>a.id===focusId);
 const[query,setQuery]=useState("");const[selectedId,setSelectedId]=useState(focused?.id??scope.orders[0]?.id??"");const[open,setOpen]=useState(false);const[error,setError]=useState("");
 const[accountId,setAccountId]=useState(focusedAccount?.id??scope.accounts[0]?.id??"");const[lines,setLines]=useState<DraftLine[]>([newLine()]);const customerMode=isCustomer(currentUser);const canFulfill=canAdvanceFulfillment(currentUser);
 useEffect(()=>{if(focusId)sessionStorage.removeItem("momentum-focus-record")},[focusId]);
 const orders=useMemo(()=>{const q=query.trim().toLowerCase();return scope.orders.filter((o)=>{const a=scope.accounts.find((x)=>x.id===o.accountId);return!q||`${o.number} ${a?.name??""} ${orderLinesFor(o).map((l)=>l.product).join(" ")} ${o.status}`.toLowerCase().includes(q)})},[query,scope.orders,scope.accounts]);
 const selected=scope.orders.find((o)=>o.id===selectedId)??orders[0];const selectedLines=selected?orderLinesFor(selected):[];const currentIndex=selected?lifecycle.indexOf(selected.status):-1;const nextStatus=selected?fulfillmentNext[selected.status]??null:null;
 const reserved=selected?activeReservedForOrder(ledger,selected.id):0;const outbound=selected?orderOutboundQuantity(ledger,selected.id):0;const delivered=selected?orderDeliveryQuantity(ledger,selected.id):0;const inventoryReady=Boolean(selected&&nextStatus&&orderCanAdvanceInventory(ledger,selected,nextStatus));
 const pricing=accountId?evaluatePartnerPricing(data,accountId):null;const price=pricing?.currentPricePerCase;const requestCases=lines.reduce((s,l)=>s+(Number.isInteger(l.cases)&&l.cases>0?l.cases:0),0);
 const openDraft=(order?:typeof selected)=>{setAccountId(order?.accountId??focusedAccount?.id??scope.accounts[0]?.id??"");setLines(order?orderLinesFor(order).map((l)=>newLine(l.product,l.cases)):[newLine()]);setError("");setOpen(true)};
 const submit=(e:FormEvent)=>{e.preventDefault();if(!price){setError("Current account pricing must be configured before this order can be submitted.");return}if(!lines.length||lines.some((l)=>!Number.isInteger(l.cases)||l.cases<1)){setError("Every order line needs a whole-number case quantity of at least 1.");return}const id=createOrder({accountId,lines:lines.map((l)=>({...l,inventoryAvailableAtOrder:productInventoryStatus(ledger,data,l.product).available}))});if(!id){setError("Momentum rejected this request. Review the account, pricing, quantities, and permissions. Nothing was silently submitted.");return}setSelectedId(id);setOpen(false);setError("")};
 const advance=()=>{if(!selected||!nextStatus)return;if(!advanceOrderFulfillment(selected.id,nextStatus)){setError("Inventory evidence is incomplete for the next fulfillment step. Open Inventory to finish reservations or custody records.");return}setError("")};
 return <div className="page page--orders"><PageHeader title={customerMode?"My orders":"Orders"} actions={canCreateOrder(currentUser)?<Button variant="gold" icon={<Plus size={17}/>} onClick={()=>openDraft()}>{customerMode?"Place order":"Create order"}</Button>:undefined}/>
 <div className="order-stats"><div><span><FileText size={18}/></span><div><small>Orders in scope</small><strong>{scope.orders.length}</strong></div></div><div><span><CircleDollarSign size={18}/></span><div><small>Open amount</small><strong>{formatMoney(scope.orders.filter(o=>o.paymentStatus!=="Paid").reduce((s,o)=>s+o.amount,0))}</strong></div></div><div><span><Truck size={18}/></span><div><small>Delivered cases</small><strong>{scope.orders.filter(o=>["Delivered","Paid"].includes(o.status)).reduce((s,o)=>s+o.cases,0)}</strong></div></div><div><span><PackageSearch size={18}/></span><div><small>Canonical SKUs</small><strong>{skuOptions.length}</strong></div></div></div>
 <div className="orders-layout"><Section className="orders-list" title="Order register"><label className="table-search order-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search order, account, SKU, or status…"/></label><div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Cases</span><span>Amount</span><span>Status</span><span/></div><div className="order-table-body">{orders.map(o=>{const a=scope.accounts.find(x=>x.id===o.accountId);return <button className={`order-table ${selected?.id===o.id?"is-selected":""}`} key={o.id} onClick={()=>setSelectedId(o.id)}><span><strong>{o.number}</strong><small>{orderLinesFor(o).length===1?orderLinesFor(o)[0].product:`${orderLinesFor(o).length} SKUs`}</small></span><span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small></span><span>{o.cases}</span><span>{formatMoney(o.amount)}</span><span><StatusPill tone={tone(o.status)}>{o.status}</StatusPill></span><ChevronRight size={16}/></button>})}</div></Section>
 {selected&&<Section className="order-detail" title={selected.number} action={<StatusPill tone={tone(selected.status)}>{selected.status}</StatusPill>}><div className="order-detail__body"><div className="order-price-card"><div><span>Order total</span><strong>{formatMoney(selected.amount)}</strong><small>{selected.cases} total cases · {selectedLines.length} SKU{selectedLines.length===1?"":"s"}</small></div><span><FileText size={24}/></span></div><div className="order-detail-actions">{canCreateOrder(currentUser)&&<Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>openDraft(selected)}>Copy / reorder</Button>}</div><div className="company-request-list">{selectedLines.map(l=><article key={l.id}><span><Box size={16}/></span><div><small>Order line</small><strong>{l.cases} cases · {l.product}</strong><p>{formatMoney(l.pricePerCase)} / case · {formatMoney(l.amount)}</p></div></article>)}</div><div className="order-lifecycle">{lifecycle.map((s,i)=><div className={i<=currentIndex?"is-complete":""} key={s}><span>{i<currentIndex?<CheckCircle2 size={14}/>:i+1}</span><small>{s}</small></div>)}</div><dl className="order-facts"><div><dt>Reserved</dt><dd>{reserved}/{selected.cases}</dd></div><div><dt>Outbound custody</dt><dd>{outbound}/{selected.cases}</dd></div><div><dt>Delivered</dt><dd>{delivered}/{selected.cases}</dd></div><div><dt>Payment</dt><dd>{selected.paymentStatus}</dd></div></dl>
 {selected.status==="Awaiting approval"?<div className="order-approval-callout"><Store size={20}/><div><strong>One Administrator approval required</strong><p>Once either Administrator approves this order, that decision is authoritative for the shared order record.</p></div>{currentUser?.role==="Administrator"&&<Button size="sm" onClick={()=>navigate("work")}>Review</Button>}</div>:selected.status==="Draft"?<div className="order-approval-callout"><AlertCircle size={20}/><div><strong>Returned for edits</strong><p>The original record remains in history. Copy it to submit a corrected replacement.</p></div></div>:nextStatus&&canFulfill&&inventoryReady?<Button size="lg" onClick={advance}>Move to {nextStatus.toLowerCase()}</Button>:nextStatus&&canFulfill?<div className="order-approval-callout"><PackageSearch size={20}/><div><strong>Inventory evidence required</strong><p>Reserve the exact SKU mix and complete custody evidence before moving forward.</p></div><Button size="sm" variant="secondary" onClick={()=>navigate("inventory")}>Open inventory</Button></div>:null}{error&&<p className="form-error" role="alert">{error}</p>}</div></Section>}</div>
 <Modal open={open} title="Create order request" description="Add as many Golden Eagle SKUs as the customer needs. There is no 10-case maximum. One Administrator approval covers the complete order." onClose={()=>setOpen(false)} wide footer={<><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form="order-v3-form">Submit order</Button></>}><form id="order-v3-form" className="form-grid" onSubmit={submit}><Field label="Customer account" className="field--full"><select value={accountId} onChange={e=>setAccountId(e.target.value)}>{scope.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.locationName??a.location}</option>)}</select></Field>{lines.map((line,index)=><div className="field--full form-grid" key={line.id}><Field label={`Product ${index+1}`}><select value={line.product} onChange={e=>setLines(rows=>rows.map(r=>r.id===line.id?{...r,product:e.target.value}:r))}>{skuOptions.map(s=><option value={s.description} key={s.id}>{s.description}</option>)}</select></Field><Field label="Cases"><input type="number" min="1" step="1" required value={line.cases} onChange={e=>setLines(rows=>rows.map(r=>r.id===line.id?{...r,cases:Number(e.target.value)}:r))}/></Field><div className="field--full"><small>{productInventoryStatus(ledger,data,line.product).available} currently available sellable cases</small>{lines.length>1&&<Button type="button" size="sm" variant="ghost" icon={<Trash2 size={14}/>} onClick={()=>setLines(rows=>rows.filter(r=>r.id!==line.id))}>Remove line</Button>}</div></div>)}<div className="field--full"><Button type="button" variant="secondary" icon={<Plus size={15}/>} onClick={()=>setLines(rows=>[...rows,newLine()])}>Add another product</Button></div><div className="order-preview"><Box size={20}/><div><span>Request total</span><strong>{requestCases} cases · {price?formatMoney(requestCases*price):"Pricing setup required"}</strong></div></div>{error&&<p className="form-error field--full" role="alert">{error}</p>}</form></Modal></div>
}
''')
write("components/pages/orders.tsx", '''"use client";
export { OrdersPage } from "./orders-v3";
''')

# ---------------------------------------------------------------------------
# 7. Field workflow, map, account setup, products, timekeeping, resources.
# These are application pages over existing domains. Provider-dependent pieces
# clearly remain pending instead of pretending an external provider is wired.
# ---------------------------------------------------------------------------
write("components/pages/operations-tools.tsx", '''"use client";
import { BookOpen, Clock3, MapPin, PackageSearch, Plus, Store, UserCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { canClaimUnassignedProspect } from "../../lib/access";
import { useCrm } from "../../lib/crm-context";
import { mapsIntegrationStatus, projectAccounts } from "../../lib/maps-integration";
import { GOLDEN_EAGLE_SKUS, PRODUCT_CATALOG_INVENTORY_POLICY } from "../../lib/product-catalog";
import { latestProspectRating, prospectRatingColor, weeklyVisitSummary } from "../../lib/sales-field-engine";
import { useTrainingLibrary } from "../../lib/training-library-context";
import { useHcm } from "../../lib/hcm-context";
import { useWorkspace } from "../../lib/workspace-context";
import { arizonaDateKey } from "../../lib/date-time";
import { Button, Field, PageHeader, Section, StatusPill, hoursBetween } from "../ui";

export function QuickVisitPage(){const{data,scope,currentUser,claimUnassignedProspect}=useWorkspace();const{crm,addInteraction}=useCrm();const[accountId,setAccountId]=useState(scope.accounts[0]?.id??"");const[rating,setRating]=useState(5);const[unsuccessful,setUnsuccessful]=useState(false);const[note,setNote]=useState("Visited business location");const[sample,setSample]=useState({product:"",quantity:1});const[message,setMessage]=useState("");if(!currentUser)return null;const account=scope.accounts.find(a=>a.id===accountId);const submit=(e:FormEvent)=>{e.preventDefault();if(!account){setMessage("Select a business.");return}const id=addInteraction({locationId:account.id,type:"Visit",summary:note.trim()||"Physical business visit",physicalVisit:true,prospectRating:rating,visitUnsuccessful:unsuccessful});if(!id){setMessage("Visit was not saved. Review the business and fields before leaving this screen.");return}if(sample.product&&sample.quantity>0)addInteraction({locationId:account.id,type:"Sample",summary:`Sample left: ${sample.quantity} case(s) · ${sample.product}`,sampleProduct:sample.product,sampleQuantity:sample.quantity,sampleInventoryLinked:false});setMessage("Visit saved. This physical stop counts toward the weekly visit total.")};const summaries=data.users.filter(u=>u.role==="Sales Representative").map(u=>({u,s:weeklyVisitSummary(crm.interactions,u.id)}));return <div className="page"><PageHeader eyebrow="CRM & sales" title="Quick Visit" description="A physical stop is a visit. Log it fast, rate the prospect 1–10, and move on."/><Section title="Log physical visit"><form className="form-grid" onSubmit={submit}><Field label="Business"><select value={accountId} onChange={e=>setAccountId(e.target.value)}>{scope.accounts.map(a=><option key={a.id} value={a.id}>{a.locationName??a.name}{!a.ownerId?" · Unassigned":""}</option>)}</select></Field><Field label="Prospect score 1–10"><input type="number" min="1" max="10" step="1" value={rating} onChange={e=>setRating(Number(e.target.value))}/><span style={{display:"inline-block",width:"100%",height:8,borderRadius:99,background:prospectRatingColor(rating)}}/></Field><Field label="Visit note" className="field--full"><input value={note} onChange={e=>setNote(e.target.value)}/></Field><Field label="Unsuccessful visit"><select value={unsuccessful?"yes":"no"} onChange={e=>setUnsuccessful(e.target.value==="yes")}><option value="no">No</option><option value="yes">Yes</option></select></Field><Field label="Optional sample"><select value={sample.product} onChange={e=>setSample({...sample,product:e.target.value})}><option value="">No sample</option>{GOLDEN_EAGLE_SKUS.map(s=><option key={s.id} value={s.description}>{s.shortName}</option>)}</select></Field>{sample.product&&<Field label="Sample cases"><input type="number" min="1" step="1" value={sample.quantity} onChange={e=>setSample({...sample,quantity:Number(e.target.value)})}/></Field>}{message&&<p className="form-notice field--full">{message}</p>}<div className="field--full"><Button type="submit">Save visit</Button>{account&&canClaimUnassignedProspect(currentUser,account)&&<Button type="button" variant="secondary" icon={<UserCheck size={15}/>} onClick={()=>{if(claimUnassignedProspect(account.id))setMessage("Prospect claimed. Existing history was retained.")}}>Claim this unassigned prospect</Button>}</div></form></Section>{["Administrator","Sales Manager"].includes(currentUser.role)&&<Section title="Weekly field pace" description="Actual physical visits only. Target: 75–80 per full week."><div className="company-request-list">{summaries.map(({u,s})=><article key={u.id}><span><Store size={17}/></span><div><strong>{u.name}</strong><p>{s.completed} visits this week · {s.remainingToMinimum} to 75 · prior week {s.priorWeekCompleted}</p></div><StatusPill tone={s.completed>=75?"success":s.completed>=50?"warning":"neutral"}>{s.completed}/75</StatusPill></article>)}</div></Section>}</div>}

export function SalesMapPage(){const{scope,currentUser}=useWorkspace();const status=mapsIntegrationStatus();const points=projectAccounts(scope.accounts);return <div className="page"><PageHeader eyebrow="CRM & sales" title="Account & prospect map" description={currentUser?.role==="Administrator"?"Administrator view includes all accessible accounts and prospects.":"Your assigned accounts plus the unassigned prospect pool."}/><Section title="Map architecture" description="Business lookup and street-map tiles stay provider-neutral until a provider is selected."><div className="form-callout"><MapPin size={17}/><p>Map tiles: {status.mapTiles}. Business lookup: {status.businessLookup}. Known coordinates can still be plotted safely.</p></div><div style={{position:"relative",minHeight:360,border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>{points.map(p=>{const a=scope.accounts.find(x=>x.id===p.accountId)!;return <button key={p.accountId} title={a.locationName??a.name} style={{position:"absolute",left:`${p.x/10}%`,top:`${p.y/6.2}%`,transform:"translate(-50%,-50%)",border:0,background:"transparent"}}><MapPin size={22}/></button>})}{!points.length&&<div className="review-empty"><MapPin size={26}/><p>No geocoded locations yet. Provider wiring is pending.</p></div>}</div></Section></div>}

export function AccountSetupPage(){const{data,scope,currentUser,updateCustomerCommercial,updateAccountCommercial}=useWorkspace();const[accountId,setAccountId]=useState(scope.accounts[0]?.id??"");const account=scope.accounts.find(a=>a.id===accountId);const customer=(data.customers??[]).find(c=>c.id===account?.customerId);const[message,setMessage]=useState("");if(!currentUser||!["Administrator","Sales Manager"].includes(currentUser.role))return null;const saveCustomer=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!customer)return;const form=new FormData(e.currentTarget);const credit=String(form.get("creditStatus")||"COD") as typeof customer.creditStatus;const terms=String(form.get("paymentTerms")||"COD") as typeof customer.paymentTerms;const ok=updateCustomerCommercial(customer.id,{ein:String(form.get("ein")||""),az5000Number:String(form.get("az5000")||""),accountsPayableContactName:String(form.get("apName")||""),accountsPayableEmail:String(form.get("apEmail")||""),accountsPayablePhone:String(form.get("apPhone")||""),creditStatus:credit,paymentTerms:terms,onboardingPackageStatus:String(form.get("onboarding")||"Not started") as typeof customer.onboardingPackageStatus,onboardingProviderStatus:"Provider not selected"});setMessage(ok?"Customer setup saved.":"Setup was not saved. Net 30 requires an approved Net 30 credit status.")};const saveProgram=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!account)return;const form=new FormData(e.currentTarget);const ok=updateAccountCommercial(account.id,{programPricingLabel:String(form.get("label")||""),programPricePerCase:Number(form.get("price")||0),programPricingEffectiveDate:String(form.get("effective")||""),programPricingExpirationDate:String(form.get("expires")||""),programPricingStatus:String(form.get("status")||"Draft") as typeof account.programPricingStatus});setMessage(ok?"Program pricing saved.":"Program pricing was not saved. Review dates and price.")};const warning=account?.programPricingExpirationDate?Math.ceil((new Date(`${account.programPricingExpirationDate}T12:00:00`).getTime()-new Date(`${arizonaDateKey()}T12:00:00`).getTime())/86400000):undefined;return <div className="page"><PageHeader eyebrow="CRM & sales" title="New Account Setup" description="Commercial setup, tax/credit status and onboarding readiness. COD is the default. External credit/e-sign providers remain pending."/><Field label="Location"><select value={accountId} onChange={e=>setAccountId(e.target.value)}>{scope.accounts.map(a=><option key={a.id} value={a.id}>{a.locationName??a.name}</option>)}</select></Field>{customer&&<Section title="Company & billing"><form className="form-grid" onSubmit={saveCustomer}><Field label="Company"><input readOnly value={customer.name}/></Field><Field label="EIN"><input name="ein" defaultValue={customer.ein??""}/></Field><Field label="AZ-5000"><input name="az5000" defaultValue={customer.az5000Number??""}/></Field><Field label="A/P contact"><input name="apName" defaultValue={customer.accountsPayableContactName??""}/></Field><Field label="A/P email"><input name="apEmail" type="email" defaultValue={customer.accountsPayableEmail??""}/></Field><Field label="A/P phone"><input name="apPhone" defaultValue={customer.accountsPayablePhone??""}/></Field><Field label="Credit status"><select name="creditStatus" defaultValue={customer.creditStatus??"COD"}><option>COD</option><option>Credit Requested</option><option>Credit Under Review</option><option>Net 30 Approved</option><option>Credit Declined</option><option>Personal Guaranty Required</option></select></Field><Field label="Payment terms"><select name="paymentTerms" defaultValue={customer.paymentTerms??"COD"}><option>COD</option><option>Net 30</option><option>Custom</option></select></Field><Field label="Onboarding package"><select name="onboarding" defaultValue={customer.onboardingPackageStatus??"Not started"}><option>Not started</option><option>Prepared</option><option>Awaiting provider</option><option>Sent externally</option><option>Complete</option></select></Field><div className="field--full"><Button type="submit">Save setup</Button></div></form></Section>}{account&&<Section title="Program pricing" description="Effective/expiration dates are explicit. Momentum warns inside 30 days."><form className="form-grid" onSubmit={saveProgram}><Field label="Program"><input name="label" defaultValue={account.programPricingLabel??""}/></Field><Field label="Price / case"><input name="price" type="number" min="0.01" step="0.01" defaultValue={account.programPricePerCase??""}/></Field><Field label="Effective"><input name="effective" type="date" defaultValue={account.programPricingEffectiveDate??""}/></Field><Field label="Expires"><input name="expires" type="date" defaultValue={account.programPricingExpirationDate??""}/></Field><Field label="Status"><select name="status" defaultValue={account.programPricingStatus??"Draft"}><option>Draft</option><option>Scheduled</option><option>Active</option><option>Expired</option><option>Cancelled</option></select></Field>{warning!==undefined&&warning>=0&&warning<=30&&<div className="form-callout field--full"><p>Pricing expires in {warning} day{warning===1?"":"s"}. This is the 30-day warning window.</p></div>}<div className="field--full"><Button type="submit">Save program pricing</Button></div></form></Section>}{message&&<p className="form-notice">{message}</p>}</div>}

export function ProductsPage(){return <div className="page"><PageHeader eyebrow="Product master" title="Golden Eagle SKUs" description="Case-level wholesaler catalog. Case barcode fields are ready for verified barcode values. Can barcodes are intentionally out of scope."/><Section title="Active catalog" description={PRODUCT_CATALOG_INVENTORY_POLICY}><div className="company-request-list">{GOLDEN_EAGLE_SKUS.map(s=><article key={s.id}><span><PackageSearch size={17}/></span><div><strong>{s.description}</strong><p>{s.casePack} cans / case · Case barcode: {s.caseBarcode??"Pending verified barcode"}</p></div><StatusPill tone={s.caseBarcode?"success":"warning"}>{s.caseBarcode?"Scanner ready":"Barcode pending"}</StatusPill></article>)}</div></Section></div>}

export function TimekeepingPage(){const{data,currentUser,toggleClock,startMeal,endMeal}=useWorkspace();if(!currentUser)return null;const open=data.timeEntries.find(e=>e.userId===currentUser.id&&!e.clockOut);const entries=data.timeEntries.filter(e=>e.userId===currentUser.id).sort((a,b)=>b.date.localeCompare(a.date));const hours=entries.slice(0,7).reduce((s,e)=>s+hoursBetween(e.clockIn,e.clockOut,e.breakMinutes),0);return <div className="page"><PageHeader eyebrow="Timekeeping" title="Clock In & Time" description="Dedicated self-service timekeeping. One tap records the current Arizona time." actions={<Button variant={open?"secondary":"gold"} icon={<Clock3 size={17}/>} onClick={()=>toggleClock()}>{open?"Clock out":"Clock in"}</Button>}/><Section title="Current shift"><div className="company-rule-facts"><div><span>Status</span><strong>{open?`Clocked in · ${open.clockIn}`:"Off clock"}</strong></div><div><span>Recent recorded hours</span><strong>{hours.toFixed(2)}</strong></div></div>{open&&<div className="account-detail__actions">{!open.mealStart&&<Button size="sm" variant="secondary" onClick={startMeal}>Start meal</Button>}{open.mealStart&&!open.mealEnd&&<Button size="sm" variant="secondary" onClick={endMeal}>End meal</Button>}</div>}</Section><Section title="Recent time entries"><div className="company-request-list">{entries.slice(0,10).map(e=><article key={e.id}><span><Clock3 size={16}/></span><div><strong>{e.date}</strong><p>{e.clockIn} → {e.clockOut??"Open"} · {e.breakMinutes} break min</p></div></article>)}</div></Section></div>}

export function MaterialsPage(){const{hcm}=useHcm();const library=useTrainingLibrary();return <div className="page"><PageHeader eyebrow="Resources" title="Materials & Resources" description="Company training, approved resources, and operating references accessible within your role."/><Section title="Training materials"><div className="company-request-list">{library.state.materials.filter(m=>m.active).map(m=>{const course=hcm.courses.find(c=>c.id===m.courseId);return <article key={m.id}><span><BookOpen size={16}/></span><div><strong>{m.title}</strong><p>{course?.title??"Company resource"} · {m.kind}</p>{m.url&&<a href={m.url} target="_blank" rel="noreferrer">Open resource</a>}</div></article>})}{!library.state.materials.some(m=>m.active)&&<div className="review-empty"><BookOpen size={24}/><p>No published resources yet.</p></div>}</div></Section></div>}
''')

# Wire pages into the shell and navigation.
replace_once("components/app-shell-v4.tsx", 'import { OrdersPage } from "./pages/orders";', 'import { OrdersPage } from "./pages/orders";\nimport { AccountSetupPage, MaterialsPage, ProductsPage, QuickVisitPage, SalesMapPage, TimekeepingPage } from "./pages/operations-tools";')
replace_once(
    "components/app-shell-v4.tsx",
    '''  accounts: [{key:"accounts",label:"Accounts"},{key:"accountHealth",label:"Account health"},{key:"crmTools",label:"CRM tools"}],''',
    '''  accounts: [{key:"accounts",label:"Accounts"},{key:"quickVisit",label:"Quick Visit"},{key:"salesMap",label:"Map"},{key:"accountSetup",label:"Account setup"},{key:"accountHealth",label:"Account health"},{key:"crmTools",label:"CRM tools"}],''',
)
replace_once(
    "components/app-shell-v4.tsx",
    '''  actions:"work", accountHealth:"accounts", crmTools:"accounts", orderCash:"orders", inventoryLedger:"inventory",''',
    '''  actions:"work", quickVisit:"accounts", salesMap:"accounts", accountSetup:"accounts", accountHealth:"accounts", crmTools:"accounts", orderCash:"orders", inventoryLedger:"inventory",''',
)
replace_once(
    "components/app-shell-v4.tsx",
    '''  actions:"Action center", accountHealth:"Account health", crmTools:"CRM tools", orderCash:"Invoices & payments",''',
    '''  actions:"Action center", quickVisit:"Quick Visit", salesMap:"Account map", accountSetup:"Account setup", accountHealth:"Account health", crmTools:"CRM tools", orderCash:"Invoices & payments", timekeeping:"Timekeeping", materials:"Materials & Resources", products:"Products",''',
)
replace_once("components/app-shell-v4.tsx", '    case "accounts": return <AccountsPage/>;', '    case "accounts": return <AccountsPage/>;\n    case "quickVisit": return <QuickVisitPage/>;\n    case "salesMap": return <SalesMapPage/>;\n    case "accountSetup": return <AccountSetupPage/>;')
replace_once("components/app-shell-v4.tsx", '    case "inventoryLedger": return <InventoryLedgerPage/>;', '    case "inventoryLedger": return <InventoryLedgerPage/>;\n    case "products": return <ProductsPage/>;')
replace_once("components/app-shell-v4.tsx", '    case "people": return <PeoplePage/>;', '    case "people": return <PeoplePage/>;\n    case "timekeeping": return <TimekeepingPage/>;\n    case "materials": return <MaterialsPage/>;')
# Top-level quick access for all roles that already have permissions.
replace_once("components/app-shell-v4.tsx", '  { key: "brandAmbassadors", label: "Brand Ambassadors", icon: PartyPopper },', '  { key: "brandAmbassadors", label: "Brand Ambassadors", icon: PartyPopper },\n  { key: "timekeeping", label: "Clock In / Timekeeping", icon: CalendarDays },\n  { key: "materials", label: "Materials / Resources", icon: FileText },')

# Brand Ambassador requests: reps request, Admin assigns.
write("components/brand-ambassadors/event-request-panel.tsx", '''"use client";
import { FormEvent, useState } from "react";
import { useMarketing } from "../../lib/marketing-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Section } from "../ui";
export function EventRequestPanel(){const{currentUser}=useWorkspace();const{submitRequest}=useMarketing();const[title,setTitle]=useState("");const[detail,setDetail]=useState("");const[neededBy,setNeededBy]=useState("");const[message,setMessage]=useState("");if(currentUser?.role!=="Sales Representative")return null;const submit=(e:FormEvent)=>{e.preventDefault();const id=submitRequest({requesterId:currentUser.id,type:"Samples / event",title,detail,neededBy:neededBy||undefined});if(!id){setMessage("Event request was not submitted. Review the required fields.");return}setMessage("Event request submitted. Management will assign Brand Ambassadors based on availability.");setTitle("");setDetail("");setNeededBy("")};return <Section title="Request an event" description="Sales Representatives request the event. Management selects and assigns Brand Ambassadors."><form className="form-grid" onSubmit={submit}><Field label="Event / venue"><input required value={title} onChange={e=>setTitle(e.target.value)}/></Field><Field label="Needed by"><input type="date" value={neededBy} onChange={e=>setNeededBy(e.target.value)}/></Field><Field label="Details" className="field--full"><textarea required rows={4} value={detail} onChange={e=>setDetail(e.target.value)} placeholder="Date/time window, address, expected staffing, objective, setup notes"/></Field>{message&&<p className="form-notice field--full">{message}</p>}<Button type="submit">Submit event request</Button></form></Section>}
''')
replace_once("components/pages/brand-ambassadors.tsx", 'import { TrainingMaterialLink } from "../hcm/training-material-link";', 'import { TrainingMaterialLink } from "../hcm/training-material-link";\nimport { EventRequestPanel } from "../brand-ambassadors/event-request-panel";')
replace_once("components/pages/brand-ambassadors.tsx", '  const canSchedule = currentUser?.role === "Administrator" || currentUser?.role === "Sales Representative";', '  const canSchedule = currentUser?.role === "Administrator";')
replace_once("components/pages/brand-ambassadors.tsx", '    {canSchedule&&<Section title="Schedule an event"', '    {currentUser?.role==="Sales Representative"&&<EventRequestPanel/>}\n    {canSchedule&&<Section title="Schedule an event"')

# ---------------------------------------------------------------------------
# 8. Employee directory work phone and Administrator editing through the
# existing employeeDirectory write path. Security rules already permit Admin.
# ---------------------------------------------------------------------------
replace_once("lib/firebase-session-context.tsx", 'export type UserAccessPatch=Partial<Pick<UserAccessRecord,"role"|"team"|"managerId"|"managedTeams">>&{title?:string};', 'export type UserAccessPatch=Partial<Pick<UserAccessRecord,"role"|"team"|"managerId"|"managedTeams">>&{title?:string;phone?:string};')
replace_once("lib/firebase-session-context.tsx", '    if(patch.title)directoryPatch.title=patch.title;', '    if(patch.title)directoryPatch.title=patch.title;\n    if("phone" in patch)directoryPatch.phone=patch.phone?.trim()||null;')
replace_once("components/hcm/employee-directory.tsx", 'import { BarChart3, BriefcaseBusiness, Building2, CalendarClock, Clock3, Mail, MapPin, Search, ShieldCheck, UserRound, UsersRound } from "lucide-react";', 'import { BarChart3, BriefcaseBusiness, Building2, CalendarClock, Clock3, Mail, MapPin, Phone, Search, ShieldCheck, UserRound, UsersRound } from "lucide-react";\nimport { useFirebaseSessionOptional } from "../../lib/firebase-session-context";')
replace_once("components/hcm/employee-directory.tsx", '  const { data, currentUser, navigate } = useWorkspace();', '  const { data, currentUser, navigate } = useWorkspace();\n  const firebase=useFirebaseSessionOptional();')
replace_once("components/hcm/employee-directory.tsx", '  const [selectedId, setSelectedId] = useState(focusedEmployee?.id ?? currentUser?.id ?? "");', '  const [selectedId, setSelectedId] = useState(focusedEmployee?.id ?? currentUser?.id ?? "");\n  const [editPhone,setEditPhone]=useState("");const [editTitle,setEditTitle]=useState("");const [editMessage,setEditMessage]=useState("");')
replace_once("components/hcm/employee-directory.tsx", '          <article><Mail size={17}/><div><small>Work email</small><strong>{selected.email}</strong></div></article>', '          <article><Mail size={17}/><div><small>Work email</small><strong>{selected.email}</strong></div></article>\n          <article><Phone size={17}/><div><small>Work phone</small><strong>{selected.phone??"Not configured"}</strong></div></article>')
replace_once("components/hcm/employee-directory.tsx", '        {managementDetail && <>', '        {currentUser.role==="Administrator"&&firebase&&<Section title="Edit directory profile" description="Updates the shared employee directory, not payroll or private HR."><div className="form-grid"><Field label="Title"><input value={editTitle} placeholder={selected.title} onChange={e=>setEditTitle(e.target.value)}/></Field><Field label="Work phone"><input value={editPhone} placeholder={selected.phone??"602-555-0000"} onChange={e=>setEditPhone(e.target.value)}/></Field><div className="field--full"><Button size="sm" onClick={async()=>{const result=await firebase.updateUserAccess(selected.id,{...(editTitle.trim()?{title:editTitle.trim()}:{}),phone:editPhone.trim()});setEditMessage(result.ok?"Directory profile updated.":result.message??"Update failed.")}}>Save directory profile</Button>{editMessage&&<p>{editMessage}</p>}</div></div></Section>}\n\n        {managementDetail && <>')
replace_once("components/hcm/employee-directory.tsx", 'import { Avatar, Button, Section, StatusPill, formatDate, hoursBetween } from "../ui";', 'import { Avatar, Button, Field, Section, StatusPill, formatDate, hoursBetween } from "../ui";')

# Notification cleanup: remove every generated delivery whose source audit event is routine, not only the most recent 500.
replace_once(
    "lib/notification-context-v2.tsx",
    '''      const auditWindow = audit.events.slice(0, 500);
      const sourceEvents = auditWindow.filter(auditEventCreatesNotification);
      const eventById = new Map(sourceEvents.map((event) => [event.id, event]));
      const auditEventIds = new Set(auditWindow.map((event) => event.id));''',
    '''      const auditWindow = audit.events;
      const sourceEvents = auditWindow.filter(auditEventCreatesNotification).slice(0,500);
      const eventById = new Map(sourceEvents.map((event) => [event.id, event]));
      const auditEventIds = new Set(auditWindow.map((event) => event.id));''',
)

# Tests for multi-line + no-loss merge + COD defaults.
write("tests/platform-workflows-v3.test.ts", '''import assert from "node:assert/strict";import test from "node:test";
import { mergeDocument } from "../lib/persistence";import { orderCasesForProduct, orderLinesFor } from "../lib/order-lines";import { createCommerceSeed } from "../lib/commerce-engine";import type { Order,WorkspaceData } from "../lib/types";
const multi:Order={id:"o",number:"GE-X",accountId:"a",cases:17,pricePerCase:24,amount:408,status:"Approved",placedAt:"2026-09-23",ownerId:"u",priceBasis:"Tier A",paymentStatus:"Not invoiced",product:"Multiple products",lines:[{id:"l1",product:"0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",cases:12,pricePerCase:24,amount:288},{id:"l2",product:"0.25L (8.4oz) Golden Eagle SugarFree (24pack)",cases:5,pricePerCase:24,amount:120}]};
test("multi-SKU order keeps exact product quantities",()=>{assert.equal(orderLinesFor(multi).length,2);assert.equal(orderCasesForProduct(multi,"Original"),12);assert.equal(orderCasesForProduct(multi,"Sugar Free"),5)});
test("persistence omission cannot delete existing array record",()=>{const base={items:[{id:"one",v:1},{id:"two",v:1}]};const local={items:[{id:"one",v:2}]};const merged=mergeDocument(base,local,base) as {items:{id:string;v:number}[]};assert.deepEqual(merged.items.map(x=>x.id).sort(),["one","two"]);assert.equal(merged.items.find(x=>x.id==="one")?.v,2)});
test("small-business invoices default to COD",()=>{const data:WorkspaceData={users:[],customers:[{id:"c",name:"Customer",accountType:"Independent",createdAt:"2026-09-23T00:00:00.000Z",paymentTerms:"COD"}],accounts:[{id:"a",customerId:"c",name:"Shop",location:"Phoenix",channel:"Retail",stage:"Opening order",ownerId:"u",contactName:"x",contactRole:"owner",phone:"1",email:"x@y.com",lastActivity:"",nextAction:"",nextActionDate:"2026-09-23",health:"New",lifetimeCases:0,reorderCount:0,notes:""}],activities:[],appointments:[],orders:[multi],placements:[],inventory:[],approvals:[],timeEntries:[],timecards:[],notifications:[],bulletins:[],territories:[]};assert.equal(createCommerceSeed(data).invoices[0]?.terms,"COD")});
''')
replace_once("package.json", 'tests/delivery-driver.test.ts tests/platform-integrity.test.ts', 'tests/delivery-driver.test.ts tests/platform-integrity.test.ts tests/platform-workflows-v3.test.ts')

print("PASS: platform integrity/workflows v3 patch applied")
