import { firebaseWebConfig } from "./firebase-config";

export type FirebaseAuthSession={
  uid:string;
  email:string;
  idToken:string;
  refreshToken:string;
  expiresAt:number;
};

type SignInResponse={localId:string;email?:string;idToken:string;refreshToken:string;expiresIn:string};
type RefreshResponse={user_id:string;id_token:string;refresh_token:string;expires_in:string};
type UpdateResponse={localId:string;email?:string;idToken:string;refreshToken:string;expiresIn:string};

const SESSION_KEY="momentum-firebase-session-v1";
const EXPIRY_SAFETY_MS=60_000;

function authErrorMessage(payload:unknown){
  if(!payload||typeof payload!=="object")return"Authentication request failed.";
  const message=(payload as {error?:{message?:string}}).error?.message??"";
  if(message.includes("INVALID_LOGIN_CREDENTIALS")||message.includes("EMAIL_NOT_FOUND")||message.includes("INVALID_PASSWORD"))return"Incorrect work email or password.";
  if(message.includes("USER_DISABLED"))return"This Momentum account is disabled.";
  if(message.includes("TOO_MANY_ATTEMPTS_TRY_LATER"))return"Too many sign-in attempts. Try again later.";
  if(message.includes("OPERATION_NOT_ALLOWED"))return"Email/password sign-in is not enabled for this Firebase project.";
  return message?`Firebase Authentication: ${message.replaceAll("_"," ").toLowerCase()}`:"Authentication request failed.";
}

function expiresAt(seconds:string){
  const parsed=Number(seconds);
  return Date.now()+Math.max(0,Number.isFinite(parsed)?parsed*1000:0);
}

export function readFirebaseSession():FirebaseAuthSession|null{
  if(typeof window==="undefined")return null;
  try{
    const value=JSON.parse(window.sessionStorage.getItem(SESSION_KEY)??"null") as FirebaseAuthSession|null;
    if(!value||!value.uid||!value.idToken||!value.refreshToken||!Number.isFinite(value.expiresAt))return null;
    return value;
  }catch{return null;}
}

export function persistFirebaseSession(session:FirebaseAuthSession|null){
  if(typeof window==="undefined")return;
  if(!session)window.sessionStorage.removeItem(SESSION_KEY);
  else window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
}

export async function signInWithFirebasePassword(email:string,password:string):Promise<FirebaseAuthSession>{
  const config=firebaseWebConfig();
  if(!config)throw new Error("Firebase web app configuration is missing.");
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({email:email.trim().toLowerCase(),password,returnSecureToken:true}),
  });
  const payload=await response.json().catch(()=>null) as SignInResponse|null;
  if(!response.ok||!payload?.localId||!payload.idToken||!payload.refreshToken)throw new Error(authErrorMessage(payload));
  const session:FirebaseAuthSession={uid:payload.localId,email:(payload.email??email).trim().toLowerCase(),idToken:payload.idToken,refreshToken:payload.refreshToken,expiresAt:expiresAt(payload.expiresIn)};
  persistFirebaseSession(session);
  return session;
}

export async function refreshFirebaseSession(session:FirebaseAuthSession):Promise<FirebaseAuthSession>{
  const config=firebaseWebConfig();
  if(!config)throw new Error("Firebase web app configuration is missing.");
  const body=new URLSearchParams({grant_type:"refresh_token",refresh_token:session.refreshToken});
  const response=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
  const payload=await response.json().catch(()=>null) as RefreshResponse|null;
  if(!response.ok||!payload?.user_id||!payload.id_token||!payload.refresh_token){persistFirebaseSession(null);throw new Error(authErrorMessage(payload));}
  const refreshed:FirebaseAuthSession={...session,uid:payload.user_id,idToken:payload.id_token,refreshToken:payload.refresh_token,expiresAt:expiresAt(payload.expires_in)};
  persistFirebaseSession(refreshed);
  return refreshed;
}

export async function currentFirebaseSession():Promise<FirebaseAuthSession|null>{
  const session=readFirebaseSession();
  if(!session)return null;
  if(session.expiresAt-Date.now()>EXPIRY_SAFETY_MS)return session;
  try{return await refreshFirebaseSession(session);}catch{return null;}
}

export async function updateFirebasePassword(session:FirebaseAuthSession,newPassword:string):Promise<FirebaseAuthSession>{
  const config=firebaseWebConfig();
  if(!config)throw new Error("Firebase web app configuration is missing.");
  if(newPassword.length<8)throw new Error("Password must be at least 8 characters.");
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(config.apiKey)}`,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({idToken:session.idToken,password:newPassword,returnSecureToken:true}),
  });
  const payload=await response.json().catch(()=>null) as UpdateResponse|null;
  if(!response.ok||!payload?.localId||!payload.idToken||!payload.refreshToken)throw new Error(authErrorMessage(payload));
  const updated:FirebaseAuthSession={uid:payload.localId,email:(payload.email??session.email).trim().toLowerCase(),idToken:payload.idToken,refreshToken:payload.refreshToken,expiresAt:expiresAt(payload.expiresIn)};
  persistFirebaseSession(updated);
  return updated;
}

export function signOutFirebase(){persistFirebaseSession(null);}
