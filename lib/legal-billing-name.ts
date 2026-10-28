import type {CustomerAccount} from "./types";

/** Legal-name-only billing. Nicknames and trading names are never invoice identities. */
export function legalBillingName(customer:Pick<CustomerAccount,"legalBusinessName">|null|undefined):string|null{
  return customer?.legalBusinessName?.trim()||null;
}
