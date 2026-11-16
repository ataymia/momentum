/** Browser-side policy mirrors Firestore's no-direct-finance-write rule.
 * A production payment, refund, credit or invoice lifecycle requires trusted
 * server reconciliation, not an Administrator's browser state mutation.
 */
export function mayMutateCommerceInBrowser(input:{
 role:string|undefined;isDemo:boolean;storageMode:string;
}):boolean{
 return input.role==="Administrator"&&input.isDemo&&input.storageMode==="local";
}
