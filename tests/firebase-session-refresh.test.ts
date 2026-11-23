import assert from "node:assert/strict";
import test from "node:test";
import {currentFirebaseSession,readFirebaseSession,persistFirebaseSession,signOutFirebase} from "../lib/firebase-auth-rest";
import type {FirebaseAuthSession} from "../lib/firebase-auth-rest";

const expired=():FirebaseAuthSession=>({
 uid:"admin-qa",email:"admin@example.invalid",idToken:"old-id-token",
 refreshToken:"old-refresh-token",expiresAt:Date.now()-5_000,
});

/** Simulate the actual per-tab browser storage and Firebase token service. */
async function inBrowser(
 callback:(setFetch:(mock:typeof fetch)=>void)=>Promise<void>,
){
 const originalWindow=(globalThis as typeof globalThis&{window?:unknown}).window;
 const originalFetch=globalThis.fetch;
 const oldEnv={
  apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
 };
 const storage=new Map<string,string>();
 const sessionStorage={
  getItem:(key:string)=>storage.get(key)??null,
  setItem:(key:string,value:string)=>{storage.set(key,value);},
  removeItem:(key:string)=>{storage.delete(key);},
 };
 Object.defineProperty(globalThis,"window",{configurable:true,writable:true,value:{sessionStorage}});
 process.env.NEXT_PUBLIC_FIREBASE_API_KEY="fake-test-key";
 process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="test.example.invalid";
 process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID="momentum-rules-test";
 process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="fake";
 process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="123";
 process.env.NEXT_PUBLIC_FIREBASE_APP_ID="fake";
 try{await callback(mock=>{globalThis.fetch=mock;});}
 finally{
  globalThis.fetch=originalFetch;
  Object.defineProperty(globalThis,"window",{configurable:true,writable:true,value:originalWindow});
  const env:Record<keyof typeof oldEnv,string>={...oldEnv} as Record<keyof typeof oldEnv,string>;
  const keys={
   apiKey:"NEXT_PUBLIC_FIREBASE_API_KEY",authDomain:"NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
   projectId:"NEXT_PUBLIC_FIREBASE_PROJECT_ID",storageBucket:"NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
   messagingSenderId:"NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",appId:"NEXT_PUBLIC_FIREBASE_APP_ID",
  } as const;
  for(const key of Object.keys(keys) as Array<keyof typeof keys>){
   if(env[key]===undefined)delete process.env[keys[key]];
   else process.env[keys[key]]=env[key];
  }
 }
}

test("three order requests share one Firebase refresh and persist the new token",async()=>{
 await inBrowser(async setFetch=>{
  persistFirebaseSession(expired());
  let calls=0;
  setFetch((async()=>{
   calls++;
   return new Response(JSON.stringify({
    user_id:"admin-qa",id_token:"fresh-id-token",
    refresh_token:"fresh-refresh-token",expires_in:"3600",
   }),{status:200,headers:{"content-type":"application/json"}});
  }) as typeof fetch);
  const tokens=await Promise.all([
   currentFirebaseSession(),currentFirebaseSession(),currentFirebaseSession(),
  ]);
  assert.equal(calls,1);
  assert(tokens.every(value=>value?.idToken==="fresh-id-token"));
  assert.equal(readFirebaseSession()?.refreshToken,"fresh-refresh-token");
  assert.equal((await currentFirebaseSession())?.idToken,"fresh-id-token");
  assert.equal(calls,1);
 });
});

test("a transient token service outage does not silently sign out an employee",async()=>{
 await inBrowser(async setFetch=>{
  const initial=expired();
  persistFirebaseSession(initial);
  setFetch((async()=>new Response(JSON.stringify({error:{message:"SERVICE_UNAVAILABLE"}}),{
   status:503,headers:{"content-type":"application/json"},
  })) as typeof fetch);
  assert.equal(await currentFirebaseSession(),null);
  assert.equal(readFirebaseSession()?.refreshToken,initial.refreshToken);
 });
});

test("a late refresh cannot resurrect a signed-out account",async()=>{
 await inBrowser(async setFetch=>{
  persistFirebaseSession(expired());
  let resolveResponse:((value:Response)=>void)|undefined;
  setFetch((async()=>new Promise<Response>(resolve=>{resolveResponse=resolve;})) as typeof fetch);
  const pending=currentFirebaseSession();
  signOutFirebase();
  resolveResponse?.(new Response(JSON.stringify({
   user_id:"admin-qa",id_token:"late-id-token",
   refresh_token:"new-refresh-token",expires_in:"3600",
  }),{status:200}));
  assert.equal(await pending,null);
  assert.equal(readFirebaseSession(),null);
 });
});
