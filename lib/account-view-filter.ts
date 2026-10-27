import type {Account} from "./types";

// View-only classification. Never overwrite a business stage or infer a paid reorder.
const establishedStages=new Set<Account["stage"]>(["Opening order","Placed","Reordered","At risk"]);

export function isOpenCommercialAccount(
  account:Pick<Account,"id"|"stage">,
  placedOrderAccountIds:ReadonlySet<string>,
):boolean{
  return placedOrderAccountIds.has(account.id)||establishedStages.has(account.stage);
}
