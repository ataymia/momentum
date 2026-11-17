/* eslint-disable max-len, comma-spacing, indent, key-spacing, space-before-blocks, space-before-function-paren, keyword-spacing, brace-style, semi-spacing, one-var, arrow-parens */
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {customerAccountIds,projectCustomerFinance,projectCustomerOrderRequests,rows,type Row} from "./customer-commerce-projection";
const path=[
 "domains/workspace/fields/accounts",
 "domains/commercial/fields/orders",
 "domains/workspace/fields/orders",
 "domains/commerce/fields/invoices",
 "domains/commerce/fields/payments",
 "domains/commerce/fields/allocations",
 "domains/commerce/fields/credits",
 "domains/commerce/fields/refunds",
];
/** Read-only, no-charge endpoint. Rejects all client supplied account IDs. */
export const customerCommerceSnapshot=onRequest({
 cors:true,region:"us-central1",maxInstances:2,
},async(request,response)=>{
 const send=(status:number,payload:unknown)=>response.status(status).set({
   "Cache-Control":"private, no-store, max-age=0","Content-Type":"application/json; charset=utf-8",
   "X-Content-Type-Options":"nosniff",
 }).json(payload);
 if(request.method!=="GET"){send(405,{ok:false,error:"GET required."});return;}
 const header=request.headers.authorization??"";
 const token=header.startsWith("Bearer ")?header.slice(7).trim():"";
 if(!token){send(401,{ok:false,error:"Sign in required."});return;}
 let uid:string;
 try{uid=(await getAuth().verifyIdToken(token,true)).uid;}catch{
   send(401,{ok:false,error:"Session invalid or expired."});return;
 }
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)){send(401,{ok:false,error:"Invalid identity."});return;}
 try{
   const db=getFirestore();
   const [accessDoc,directoryDoc]=await db.getAll(db.doc("userAccess/"+uid),db.doc("employeeDirectory/"+uid));
   const access=accessDoc.data() as Row|undefined,directory=directoryDoc.data() as Row|undefined;
   const ids=customerAccountIds(access,directory);
   if(!ids.length){send(403,{ok:false,error:"No active authorized customer locations."});return;}
   const documents=await db.getAll(...path.map(p=>db.doc(p)));
   const items=documents.map(snapshot=>rows(snapshot.data()));
   const payload=projectCustomerFinance(ids,{
     accounts:items[0],orders:[...items[1],...items[2]],invoices:items[3],
     payments:items[4],allocations:items[5],credits:items[6],refunds:items[7],
   });
   // Only the active authenticated customer's own submitted requests are included.
   // Request statuses are not financial orders or evidence of payment.
   let requests:ReturnType<typeof projectCustomerOrderRequests>=[];
   let requestHistoryAvailable=false,requestHistoryPartial=false;
   try{
    // Sort before limiting; an arbitrary limited query can hide recent requests.
    const intakeSnapshot=await db.collection("commerceOrderIntakes")
     .where("requestedByUid","==",uid).orderBy("createdAt","desc").limit(101).get();
    requests=projectCustomerOrderRequests(uid,ids,
     intakeSnapshot.docs.slice(0,100).map(snapshot=>snapshot.data()),items[0],50);
    requestHistoryAvailable=true;
    requestHistoryPartial=intakeSnapshot.size>100||requests.length===50;
   }catch{
    // A missing index or temporary history error must not hide authorized invoices.
    // Explicitly report unavailable history rather than inventing an empty list.
   }
   send(200,{ok:true,...payload,requests,requestHistoryAvailable,requestHistoryPartial});
 }catch{
   // Do not disclose account names, document existence, or payment internals.
   send(503,{ok:false,error:"Customer finance records are unavailable."});
 }
});
