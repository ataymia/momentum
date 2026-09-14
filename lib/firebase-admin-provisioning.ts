import { firebaseWebConfig } from "./firebase-config";

/**
 * Administrator-only identity creation.
 *
 * Momentum never exposes public self-signup. An Administrator, already signed in, creates the Firebase
 * Authentication account for a prepared new hire. The response token belongs to the new employee and is
 * discarded immediately: it is never persisted, so the Administrator's own session is untouched.
 *
 * A freshly created Authentication user has no `userAccess/{uid}` document, so Security Rules deny it
 * everything until the Administrator writes the access record in the same provisioning step.
 */

export type CreatedFirebaseIdentity={uid:string;email:string};

const TEMP_PASSWORD_ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Random, human-transcribable temporary password (no ambiguous glyphs). */
export function generateTemporaryPassword(length=14){
  const bytes=new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let output="";
  for(const byte of bytes)output+=TEMP_PASSWORD_ALPHABET[byte%TEMP_PASSWORD_ALPHABET.length];
  return `${output.slice(0,4)}-${output.slice(4,9)}-${output.slice(9)}`;
}

export function validateTemporaryPassword(password:string){
  if(password.length<10)return"Temporary password must be at least 10 characters.";
  if(!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/\d/.test(password))return"Temporary password needs upper-case, lower-case, and a digit.";
  return null;
}

function provisioningErrorMessage(payload:unknown){
  const message=(payload as {error?:{message?:string}}|null)?.error?.message??"";
  if(message.includes("EMAIL_EXISTS"))return"A Firebase identity already exists for that work e-mail.";
  if(message.includes("WEAK_PASSWORD"))return"Firebase rejected the temporary password as too weak.";
  if(message.includes("INVALID_EMAIL"))return"Firebase rejected the work e-mail address.";
  if(message.includes("OPERATION_NOT_ALLOWED")||message.includes("ADMIN_ONLY_OPERATION"))return"Identity creation is disabled for this Firebase project. Enable Email/Password sign-in (including account creation) in the Firebase console.";
  return message?`Firebase Authentication: ${message.replaceAll("_"," ").toLowerCase()}`:"Identity creation failed.";
}

export async function createFirebaseIdentityAsAdministrator(email:string,temporaryPassword:string):Promise<CreatedFirebaseIdentity>{
  const config=firebaseWebConfig();
  if(!config)throw new Error("Firebase web app configuration is missing.");
  const invalid=validateTemporaryPassword(temporaryPassword);
  if(invalid)throw new Error(invalid);
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({email:email.trim().toLowerCase(),password:temporaryPassword,returnSecureToken:false}),
  });
  const payload=await response.json().catch(()=>null) as {localId?:string;email?:string}|null;
  if(!response.ok||!payload?.localId)throw new Error(provisioningErrorMessage(payload));
  return{uid:payload.localId,email:(payload.email??email).trim().toLowerCase()};
}
