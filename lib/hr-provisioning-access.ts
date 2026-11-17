/** UI eligibility for existing HR provisioning. Backend authorization remains mandatory. */
type ProvisioningSession = {
  configured: boolean;
  status: string;
  session: {uid:string}|null;
  access: {uid:string;role:string;accountState:string}|null;
};
export function canOpenHrProvisioning(input:{
  actor:{id:string;role:string}|null|undefined;
  isDemo:boolean;
  storageMode:string;
  firebase?:ProvisioningSession|null;
}):boolean {
  const {actor,isDemo,storageMode,firebase}=input;
  if(actor?.role!=="Administrator")return false;
  if(isDemo)return storageMode==="local"&&!firebase;
  return storageMode==="firestore"&&firebase?.configured===true&&firebase.status==="ready"&&
    firebase.session?.uid===actor.id&&firebase.access?.uid===actor.id&&
    firebase.access.role==="Administrator"&&firebase.access.accountState==="Active";
}
