import assert from "node:assert/strict";

const root="http://127.0.0.1:8792";
const pages=["/","/sales/orders","/sales/invoices","/crm/deals",
 "/people/timekeeping","/inventory","/admin/employee-profiles"];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let html="";
for(let attempt=0;attempt<35;attempt++){
 try{
  const response=await fetch(root+"/",{signal:AbortSignal.timeout(2000)});
  if(response.ok){html=await response.text();break;}
 }catch{ /* Wait for the local Worker to boot. */ }
 await sleep(1000);
}
assert(html.includes("<html"),"Local Cloudflare Worker failed to serve HTML app shell.");
for(const path of pages){
 const response=await fetch(root+path,{signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,200,"Cloudflare Worker returned "+response.status+" for "+path);
 assert.match(response.headers.get("content-type")??"",/text\/html/i,
  "Cloudflare Worker must serve HTML for "+path);
 const document=await response.text();
 assert.match(document,/<html[\s>]/i,"A deep link must serve the app shell, not a 404 page: "+path);
 assert.equal(document,html,"Deep route must return the same SPA shell as root: "+path);
}
console.log("CLOUDFLARE SPA WORKER SMOKE PASS: "+pages.length+
 " paths, including Orders, Invoices, CRM, HR, inventory and direct Admin URLs.");
