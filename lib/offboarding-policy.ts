import type {Account, WorkspaceData} from "./types";

/**
 * Bulk offboarding changes CURRENT responsibility only. Original account
 * creation, sales attribution, orders, payments and history are immutable.
 */
export type AccountOverlay=Record<string,unknown>;
export type OffboardReleasePlan={
  accountIds:string[];
  patches:Record<string,AccountOverlay>;
  unchangedAccounts:number;
};

const overlay=(value:unknown):AccountOverlay=>
  value&&typeof value==="object"&&!Array.isArray(value)?
    value as AccountOverlay:{};

export function effectiveAccountOwner(
  account:Pick<Account,"id"|"ownerId">,
  patches:Record<string,AccountOverlay>,
):string{
  const existing=patches[account.id];
  return typeof existing?.ownerId==="string"?existing.ownerId:account.ownerId;
}

/**
 * Preview all accounts owned by a departing employee and their minimum
 * commercial overlay changes. A released customer stays at its current
 * stage, with previous orders, closers and origination credit unchanged.
 */
export function planAccountRelease(
  accounts:Pick<Account,"id"|"ownerId">[],
  patches:Record<string,AccountOverlay>,
  departingUid:string,
  stamp:string,
):OffboardReleasePlan{
  if(!departingUid.trim()||!Number.isFinite(Date.parse(stamp))){
    throw new Error("Valid employee ID and release timestamp required.");
  }
  const next={...patches};
  const ids:string[]=[];
  for(const account of accounts){
    if(effectiveAccountOwner(account,patches)!==departingUid)continue;
    ids.push(account.id);
    next[account.id]={
      ...overlay(patches[account.id]),
      ownerId:"",
      accountManagerId:"",
      responsibilityStartedAt:stamp,
      lastActivity:"Account released after employee separation",
    };
  }
  return {
    accountIds:ids,
    patches:next,
    unchangedAccounts:accounts.length-ids.length,
  };
}

export type UnassignedAccountQueueItem={
  accountId:string;
  accountName:string;
  stage:Account["stage"];
  /** Existing customers require manual reassignment instead of self-claim. */
  claimMode:"Self-claim prospect"|"Manager assignment";
};

export function unassignedAccountQueue(
  accounts:WorkspaceData["accounts"],
):UnassignedAccountQueueItem[]{
  return accounts
    .filter((account)=>!account.ownerId)
    .map((account)=>({
      accountId:account.id,
      accountName:account.name,
      stage:account.stage,
      claimMode:account.stage==="Prospect"?
        "Self-claim prospect" as const:"Manager assignment" as const,
    }));
}
