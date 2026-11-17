import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {chromium} from "playwright";
import * as routesModule from "../lib/navigation-route-registry.ts";

const PROJECT="demo-momentum-connected-audit";
const HOST="http://127.0.0.1:5011";
const OUT="artifacts/connected-functional-audit";
const REQUIRE=createRequire(new URL("../functions/package.json",import.meta.url));
const {initializeApp,deleteApp}=REQUIRE("firebase-admin/app");
const {getFirestore}=REQUIRE("firebase-admin/firestore");
const {getAuth}=REQUIRE("firebase-admin/auth");
const routes=routesModule.default??routesModule;
// Do not weaken these guards. The test credentials, records and environment are synthetic.
assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,PROJECT);
assert.equal(process.env.RESEND_LIVE_EMAIL_ENABLED,"false");
assert.equal(process.env.MOMENTUM_INVOICE_ISSUE_APPROVED,"false");
const ready=await fetch("http://127.0.0.1:5001/"+PROJECT+"/us-central1/purchasingApi",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
assert.equal(ready.status,401,"Functions emulator must actually serve authenticated endpoints before the audit.");
for(const name of ["FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST"]){
 assert.match(process.env[name]??"",/^127\.0\.0\.1:\d+$/,"Local emulator required: "+name);
}
fs.mkdirSync(OUT,{recursive:true});
const app=initializeApp({projectId:PROJECT,storageBucket:PROJECT+".appspot.com"});
const db=getFirestore(app), auth=getAuth(app);
const roles=[["admin","Administrator","Leadership"],["reviewer","Administrator","Leadership"],["ops","Operations","Operations"],["warehouse","Warehouse","Operations"],["manager","Sales Manager","Sales"],["rep","Sales Representative","Sales"],["ambassador","Brand Ambassador","Marketing"],["marketing","Marketing","Marketing"],["driver","Delivery Driver","Operations"],["customer","Customer","Customer"],["other-customer","Customer","Customer"]];
const password="Local-QA-Only!2026";
const stamp=new Date().toISOString();
const date=stamp.slice(0,10);
const product="0.25L (8.4oz) Golden Eagle Energy Drink (24pack)";
const accountId="qa-audit-location",orderId="qa-audit-order";
const reports={commit:process.env.GITHUB_SHA??"local",mode:"authenticated emulator, not live production",routes:[],actions:[],errors:[],requests:[],isolated:true};
const uid=key=>"qa-browser-"+key;
const people=new Map();
const getItems=async p=>(await db.doc(p).get()).data()?.items??[];
const register=async()=>(await db.doc("purchasingRegisters/current").get()).data()?.state;
const waitDb=async(check,message)=>{
 for(let i=0;i<60;i++){const result=await check();if(result)return result;await new Promise(r=>setTimeout(r,250));}
 throw new Error(message);
};
async function seed(){
 for(const [key,role,team] of roles){
  const id=uid(key),email=key+"@example.invalid";
  await auth.createUser({uid:id,email,password,emailVerified:true,displayName:"QA "+key});
  const person={id,name:"QA "+key,firstName:key,email,initials:"QA",role,team,title:role,accent:"#53657d",employmentStatus:"Active",...(key==="rep"?{managerId:uid("manager")}:{}),...(key==="manager"?{managedTeams:["Sales"]}:{}),...(key==="customer"?{accountIds:[accountId]}:{})};
  people.set(key,person);
  await db.doc("userAccess/"+id).set({uid:id,email,role,team,accountState:"Active",managerId:person.managerId??null,managedTeams:person.managedTeams??[],updatedAt:stamp,updatedBy:"emulator-seed"});
  await db.doc("employeeDirectory/"+id).set({...person,updatedAt:stamp});
 }
 const location={id:accountId,customerId:uid("customer"),name:"QA isolated store",locationName:"QA Phoenix",location:"Phoenix, AZ",streetAddress:"100 QA Way",postalCode:"85001",channel:"Retail",stage:"Active",ownerId:uid("rep"),contactName:"QA receiver",contactRole:"Buyer",email:"customer@example.invalid",phone:"555-0100",lastActivity:date,nextAction:"QA",nextActionDate:date,health:"Healthy",lifetimeCases:0,reorderCount:0,notes:"Synthetic only",deliveryAddressSameAsBusiness:true};
 const order={id:orderId,accountId,number:"QA-174-ORDER",ownerId:uid("rep"),cases:4,pricePerCase:24,amount:96,status:"Approved",placedAt:stamp,priceBasis:"QA price",paymentStatus:"Not invoiced",product,lines:[{id:"qa-line",product,cases:4,pricePerCase:24,amount:96}]};
 await Promise.all([
  db.doc("platform/bootstrap").set({uid:uid("admin"),createdAt:stamp}),
  db.doc("platform/meta").set({versions:{}}),
  db.doc("domains/workspace/fields/accounts").set({items:[location]}),
  db.doc("domains/workspace/fields/customers").set({items:[]}),
  db.doc("domains/workspace/fields/orders").set({items:[]}),
  db.doc("domains/commercial/fields/orders").set({items:[order]}),
  db.doc("domains/workspace/fields/inventory").set({items:[]}),
  db.doc("domains/commercial/fields/inventoryLots").set({items:[]}),
  db.doc("domains/inventoryLedger/fields/nodes").set({items:[{id:"node-warehouse-main",name:"Phoenix warehouse",type:"Warehouse",active:true},{id:"node-external",name:"External",type:"External",active:true},{id:"node-user-"+uid("driver"),name:"QA driver custody",type:"Employee custody",active:true,userId:uid("driver")},{id:"node-account-"+accountId,name:"QA store",type:"Customer",active:true,accountId}]}),
  db.doc("domains/inventoryLedger/fields/movements").set({items:[]}),
  db.doc("domains/inventoryLedger/fields/reservations").set({items:[]}),
  db.doc("domains/delivery/fields/tasks").set({items:[]}),
  db.doc("domains/delivery/fields/overrides").set({items:[]}),
  db.doc("domains/periodLocks/fields/locks").set({items:[]})
 ]);
}
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const sessions=new Map();
const failedSessions=new Map();
const root=p=>p.locator(".page-container, .driver-shell-main").first();
async function open(key){
 if(failedSessions.has(key))throw new Error(failedSessions.get(key));
 if(sessions.has(key))return sessions.get(key).page;
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",acceptDownloads:true});
 // Real tokens issued by the Auth emulator, real Firestore rules, real Functions
 // handlers. Only rewrite transport destination; never synthesize successful
 // Auth/Firestore/function responses or allow any live network requests.
 await context.route("**/*",async route=>{
  const req=route.request(),u=new URL(req.url());
  if(["data:","blob:"].includes(u.protocol))return route.continue();
  if(u.origin===HOST||u.origin==="http://127.0.0.1:5001"&&u.pathname.startsWith("/"+PROJECT+"/us-central1/")){
   return route.continue();
  }
  let target="";
  if(u.hostname==="firestore.googleapis.com"&&u.pathname.includes("/projects/"+PROJECT+"/"))target="http://127.0.0.1:8080"+u.pathname+u.search;
  if(["identitytoolkit.googleapis.com","securetoken.googleapis.com"].includes(u.hostname)&&u.searchParams.get("key")==="isolated-emulator-key")target="http://127.0.0.1:9099/"+u.hostname+u.pathname+u.search;
  if(u.hostname==="firebasestorage.googleapis.com"&&u.pathname.includes(PROJECT))target="http://127.0.0.1:9199"+u.pathname+u.search;
  if(!target)return route.abort("blockedbyclient");
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":HOST,"access-control-allow-headers":"authorization,content-type,x-firebase-storage-version,x-goog-upload-protocol","access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS"}});
  const response=await route.fetch({url:target,maxRedirects:0});
  await route.fulfill({response,headers:{...response.headers(),"access-control-allow-origin":HOST,"access-control-expose-headers":"*"}});
 });
 const page=await context.newPage();
 page.on("pageerror",e=>reports.errors.push({key,route:new URL(page.url()).pathname,error:e.message}));
 page.on("response",r=>{const u=new URL(r.url());if(r.status()>=400&&["firestore.googleapis.com","identitytoolkit.googleapis.com","127.0.0.1"].includes(u.hostname))reports.requests.push({key,path:u.pathname,status:r.status()});});
 sessions.set(key,{context,page});
 try{
 await page.goto(HOST+"/",{waitUntil:"domcontentloaded"});
 await page.getByLabel("Username or work email").fill(people.get(key).email);
 await page.getByLabel("Password",{exact:true}).fill(password);
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await root(page).waitFor({timeout:60000});
 return page;
 }catch(e){const reason="Authenticated "+key+" session failed: "+String(e);failedSessions.set(key,reason);throw new Error(reason);}
}
async function goto(page,path){
 await page.evaluate(path=>{history.pushState(null,"",path);window.dispatchEvent(new PopStateEvent("popstate"));},path);
 if(await page.locator(".page-container").count())await page.waitForFunction(path=>document.querySelector(".page-container")?.getAttribute("data-current-route")===path,path,{timeout:10000});
 await page.waitForFunction(()=>{const el=document.querySelector(".page-container,.driver-shell-main");return el&&el.innerText.trim().length>10&&!/^Opening (page|section)/i.test(el.innerText.trim());},{timeout:15000});
}
async function snapshot(page){
 return root(page).evaluate(el=>{
  const text=el.innerText.trim();
  return {headings:[...el.querySelectorAll("h1,h2,h3")].map(x=>x.textContent?.trim()).filter(Boolean),textLength:text.length,blocked:/Page unavailable|You do not have permission to view this module/i.test(text),placeholder:/Planned module|navigation prototype only|has not been implemented as a live workflow|Customer self-service • prototype/i.test(text),errors:/Something went wrong|unexpected error|Application error|Momentum could not reach Firebase/i.test(text),overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth,controls:[...el.querySelectorAll("button,input,select,textarea,a[href]")].filter(x=>x.getClientRects().length).map(x=>({kind:x.tagName,label:(x.getAttribute("aria-label")||x.closest("label")?.textContent||x.textContent||x.getAttribute("placeholder")||"").trim().slice(0,120),disabled:x.hasAttribute("disabled")})),blockers:text.split("\n").map(x=>x.trim()).filter(x=>/demo[- ]only|only in isolated local demo|disabled against connected|not (yet )?(implemented|connected|enabled)|requires.*approval|read-only|not configured/i.test(x)).slice(0,20),sample:text.slice(0,220)};
 });
}
async function inspectRoute(key,path,expected=true,device="desktop"){
 const row={key,path,device,expected,pass:false,interactions:[]};
 let page;
 try{
  page=await open(key);
  await page.setViewportSize(device==="phone"?{width:390,height:844}:{width:1440,height:900});
  await goto(page,path);
  const s=await snapshot(page);Object.assign(row,s);
  assert(expected?!s.blocked&&!s.placeholder&&!s.errors&&s.textLength>20:s.blocked,"Route entitlement, rendering or placeholder failure");
  if(expected){
   assert(s.overflow<=8,"Viewport overflow "+s.overflow);
   // Exercise only non-mutating controls generically; financial/HR/order
   // mutations require explicit workflow scenarios below.
   const search=root(page).locator('input[aria-label^="Search"],input[placeholder^="Search"]').first();
   if(await search.isVisible()&&await search.isEditable()){
    await search.fill("qa-unmatched-route-search-174");assert.equal(await search.inputValue(),"qa-unmatched-route-search-174");await search.fill("");row.interactions.push("search edit/reset");
   }
   const sort=root(page).getByRole("button",{name:/^Sort by /i}).first();
   if(await sort.isVisible()&&await sort.isEnabled()){await sort.click();await sort.click();row.interactions.push("sort toggle/reset");}
   const filter=root(page).locator('select[aria-label^="Filter"]').first();
   if(await filter.isVisible()&&await filter.isEnabled()){
    const initial=await filter.inputValue();const options=await filter.locator("option:not([disabled])").evaluateAll(xs=>xs.map(x=>x.value));
    const other=options.find(x=>x!==initial);if(other!==undefined){await filter.selectOption(other);assert.equal(await filter.inputValue(),other);await filter.selectOption(initial);row.interactions.push("filter select/reset");}
   }
  }
  row.pass=true;
 }catch(e){row.failure=String(e).slice(0,400);if(page)await page.screenshot({path:OUT+"/"+key+"-"+device+"-"+path.replace(/[^a-z0-9]+/gi,"-")+".png"}).catch(()=>{});}
 reports.routes.push(row);
 console.log("CONNECTED_ROUTE "+JSON.stringify({key,path,device,pass:row.pass,failure:row.failure}));
}
async function run(name,task){
 try{await task();reports.actions.push({name,pass:true});console.log("CONNECTED_ACTION PASS "+name);}
 catch(e){reports.actions.push({name,pass:false,failure:String(e).slice(0,700)});console.log("CONNECTED_ACTION FAIL "+name+" "+String(e).slice(0,500));}
}
async function form(key,section,values){
 const page=await open(key);await goto(page,"/purchases/"+section);
 await page.getByRole("button",{name:/^Prepare /i}).click();
 const f=page.locator(".prototype-purchasing-form");
 for(const [name,value] of Object.entries(values)){
  const el=f.locator('[name="'+name+'"]');
  if(await el.evaluate(e=>e.tagName)==="SELECT")await el.selectOption(value);else await el.fill(value);
 }
 await f.getByRole("button",{name:"Save company record"}).click();
 await root(page).getByText(/Saved to company purchasing register/).waitFor({timeout:20000});
 return page;
}
async function button(key,section,id,label,prompt){
 const page=await open(key);await goto(page,"/purchases/"+section);
 await page.getByRole("button",{name:"Refresh company register"}).click();
 const row=page.getByRole("row").filter({has:page.getByRole("button",{name:id,exact:true})});
 if(prompt)page.once("dialog",d=>void d.accept(prompt));
 await row.getByRole("button",{name:label,exact:true}).click();
 await root(page).getByText(/Saved to company purchasing register|Verified receipt and inventory movement saved together/).waitFor({timeout:25000});
 return page;
}
try{
 await seed();
 const staff=routes.MENU_GROUPS.flatMap(g=>g.entries);
 const customer=routes.CUSTOMER_MENU;
 for(const entry of staff)await inspectRoute("admin",entry.path);
 console.log("CONNECTED_ADMIN_ROUTES "+staff.length);
 for(const entry of staff)await inspectRoute("admin",entry.path,true,"phone");
 for(const key of ["ops","warehouse","manager","rep","ambassador","marketing"]){
  for(const entry of staff.filter(e=>routes.canShowModuleInMenu(people.get(key),e.path)))await inspectRoute(key,entry.path);
  for(const path of ["/admin/access","/people/payroll","/purchases/payments"].filter(p=>!routes.canVisitRoute(people.get(key),p)))await inspectRoute(key,path,false);
 }
 for(const entry of customer)await inspectRoute("customer",entry.path);
 for(const path of ["/admin/access","/people/payroll","/inventory","/purchases/bills"])await inspectRoute("customer",path,false);
 for(const entry of routes.DRIVER_MENU)await inspectRoute("driver",entry.path);
 console.log("CONNECTED_ROLE_ROUTE_COUNT "+reports.routes.length);
 await run("Customer catalog request creates intake only and preserves order records",async()=>{
  const page=await open("customer");await goto(page,"/portal/products");
  const before=(await getItems("domains/commercial/fields/orders")).map(x=>x.id).sort();
  const form=page.getByRole("region",{name:"Customer order request"});
  await form.getByLabel("Business location").selectOption(accountId);
  await form.getByLabel("Requested product 1").selectOption("ge-original-250ml-24");
  await form.getByLabel("Requested cases 1").fill("3");
  await form.getByLabel("Notes").fill("QA catalog request only");
  await form.getByRole("button",{name:"Submit request to sales"}).click();
  const request=await waitDb(async()=>{
   const docs=await db.collection("commerceOrderIntakes").get();
   return docs.docs.map(d=>d.data()).find(x=>x.requestedByUid===uid("customer")&&x.accountId===accountId&&x.totalCases===3);
  },"Customer intake missing");
  assert.equal(request.status,"Needs commercial review");
  assert.deepEqual((await getItems("domains/commercial/fields/orders")).map(x=>x.id).sort(),before);
 });
 await run("CRM prospect creation persists and links to its detail record",async()=>{
  const page=await open("admin");await page.setViewportSize({width:1440,height:900});await goto(page,"/crm/leads");
  await page.getByRole("button",{name:"Create lead",exact:true}).click();
  const f=page.getByRole("form",{name:"Create sales lead"});
  await f.getByLabel("Legal business name").fill("QA Connected Prospect");
  await f.getByLabel("Store / location name").fill("QA Prospect Phoenix");
  await f.getByLabel("City / market").fill("Phoenix, AZ");
  await f.getByLabel("Street address").fill("12345 QA Test Avenue");
  await f.getByLabel("ZIP code").fill("85001");
  await f.getByLabel("Buyer / primary contact").fill("QA Buyer");
  await f.getByLabel("Contact role").fill("Buyer");
  await f.getByLabel("Email",{exact:true}).fill("prospect@example.invalid");
  await f.getByRole("button",{name:"Save prospect"}).click();
  const account=await waitDb(async()=>(await getItems("domains/workspace/fields/accounts")).find(x=>x.name==="QA Prospect Phoenix"||x.locationName==="QA Prospect Phoenix"||x.name==="QA Connected Prospect"),"Prospect missing");
  assert.equal(account.stage,"Prospect");
  await page.waitForURL("**/crm/leads/"+account.id,{timeout:30000});
  await page.reload({waitUntil:"domcontentloaded"});await root(page).waitFor({timeout:60000});
  assert.match(await root(page).innerText(),/QA (Connected Prospect|Prospect Phoenix)/);
 });
 await run("Staff support case creation, internal note and durable history",async()=>{
  const page=await open("admin");await goto(page,"/support/cases");
  await page.getByRole("button",{name:"Open new case"}).click();
  const f=page.locator("form").filter({has:page.getByLabel("Issue description")});
  await f.getByLabel("Title",{exact:true}).fill("QA internal support issue");
  await f.getByLabel("Issue description").fill("Synthetic internal test; no customer messages.");
  await f.getByRole("button",{name:"Submit support case"}).click();
  const record=await waitDb(async()=>{
   const docs=await db.collection("supportCases").where("title","==","QA internal support issue").get();
   return docs.docs[0];
  },"Support record missing");
  await page.waitForURL("**/support/cases/"+record.id,{timeout:30000});
  await page.getByLabel("Case note").fill("QA verified internal history");
  await page.getByRole("button",{name:"Record note"}).click();
  await waitDb(async()=>JSON.stringify((await record.ref.get()).data()?.history).includes("QA verified internal history"),"Support note missing");
  await page.reload({waitUntil:"domcontentloaded"});await root(page).waitFor({timeout:60000});
  await page.getByText(/QA verified internal history/).waitFor({timeout:30000});
 });
 await run("Employee leave request records submitted status without granting PTO",async()=>{
  const page=await open("rep");await goto(page,"/my-account/time-off");
  const future=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
  await page.getByLabel("Start",{exact:true}).fill(future);
  await page.getByLabel("End",{exact:true}).fill(future);
  await page.getByLabel("Hours",{exact:true}).fill("2");
  await page.getByLabel("Reason",{exact:true}).fill("QA synthetic leave review");
  await page.getByRole("button",{name:"Submit request",exact:true}).click();
  const request=await waitDb(async()=>(await getItems("userDomains/"+uid("rep")+"/hcm/leaveRequests")).find(r=>r.reason==="QA synthetic leave review"),"Leave record missing");
  assert.equal(request.status,"Submitted");assert.equal(request.requestedHours,2);
  await page.reload({waitUntil:"domcontentloaded"});await root(page).waitFor({timeout:60000});await goto(page,"/my-account/time-off");
  await page.getByText("2 hours · Submitted",{exact:true}).waitFor({timeout:30000});
 });
 await run("Staff meeting creation, invitee response and persistence",async()=>{
  const page=await open("admin");await goto(page,"/calendar/meetings/new");
  const future=new Date(Date.now()+21*86400000).toISOString().slice(0,10);
  await page.getByLabel("Meeting title").fill("QA connected staff meeting");
  await page.getByLabel("Meeting date").fill(future);
  await page.getByLabel("Meeting start time").fill("10:00");
  await page.getByLabel("Meeting end time").fill("10:30");
  await page.getByLabel("Meeting location").fill("QA internal meeting room");
  await page.getByLabel("Meeting agenda").fill("Synthetic internal browser acceptance");
  await page.getByLabel(/QA rep · Sales Representative/).check();
  await page.getByRole("button",{name:"Create meeting for invitees"}).click();
  const doc=await waitDb(async()=>(await db.collection("staffMeetings").where("title","==","QA connected staff meeting").get()).docs[0],"Meeting not saved");
  assert(doc.data().attendeeIds.includes(uid("rep")));
  const rep=await open("rep");await rep.reload({waitUntil:"domcontentloaded"});await root(rep).waitFor({timeout:60000});await goto(rep,"/calendar/meetings/"+doc.id);
  await rep.getByRole("button",{name:"Accepted",exact:true}).click();
  await waitDb(async()=>(await doc.ref.get()).data()?.rsvps?.[uid("rep")]==="Accepted","Invitation response not saved");
 });
 await run("Customer PDF upload, reload, private download and independent review permission",async()=>{
  const page=await open("customer");await goto(page,"/portal/documents");
  const pdf=Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  await page.getByLabel("Document title").fill("QA connected document");
  await page.getByLabel("PDF file (up to 5 MB)").setInputFiles({name:"qa-test.pdf",mimeType:"application/pdf",buffer:pdf});
  await page.getByLabel(/This PDF is intended/).check();
  await page.getByRole("button",{name:"Submit PDF for review"}).click();
  await page.getByText("QA connected document",{exact:true}).waitFor({timeout:30000});
  const docs=await db.collection("customerDocuments").where("accountId","==",accountId).get();
  assert.equal(docs.size,1);const record=docs.docs[0].data();assert.equal(record.state,"Archived");assert.equal(record.status,"Submitted for review");
  await page.reload({waitUntil:"domcontentloaded"});await root(page).waitFor({timeout:60000});await goto(page,"/portal/documents");
  const row=page.getByRole("row").filter({hasText:"QA connected document"});await row.waitFor({timeout:30000});
  const downloaded=page.waitForEvent("download");await row.getByRole("button",{name:"Download PDF"}).click();
  const download=await downloaded;const path=await download.path();assert.deepEqual(fs.readFileSync(path),pdf);
  assert.equal(await row.getByRole("button",{name:"Mark reviewed"}).count(),0);
 });
 await run("Vendor create and fresh reload",async()=>{
  const page=await form("admin","vendors",{name:"QA Connected Supplier",contact:"Synthetic reference"});
  const v=await waitDb(async()=>(await register())?.vendors.find(v=>v.name==="QA Connected Supplier"),"Vendor missing in Firestore");
  await page.reload({waitUntil:"domcontentloaded"});await page.getByText(v.name,{exact:true}).waitFor({timeout:60000});
 });
 await run("PO preparation, submission and independent review",async()=>{
  const vendor=(await register()).vendors.find(v=>v.name==="QA Connected Supplier");
  await form("ops","orders",{vendor:vendor.id,sku:"ge-original-250ml-24",cases:"10",unitCost:"10",warehouse:"Phoenix warehouse",expectedDate:date});
  const po=await waitDb(async()=>(await register())?.orders.find(p=>p.vendorId===vendor.id),"PO missing");
  await button("ops","orders",po.id,"Submit");
  assert((await register()).orders.find(p=>p.id===po.id).submittedAt);
  await button("admin","orders",po.id,"Approve PO");
  assert.equal((await register()).orders.find(p=>p.id===po.id).approvedBy,uid("admin"));
 });
 await run("Warehouse receive, independent inspection, exact stock and refresh",async()=>{
  const po=(await register()).orders[0];
  await form("warehouse","receipts",{order:po.id,cases:"10",lot:"QA-BROWSER-LOT",bestBy:"2099-01-01"});
  const receipt=await waitDb(async()=>(await register())?.receipts.find(r=>r.poId===po.id),"Receipt not saved");
  assert.equal(receipt.inventoryPosted,false);
  await button("admin","receipts",receipt.id,"Inspect & post stock","QA synthetic physical inspection 174");
  const posted=(await register()).receipts.find(r=>r.id===receipt.id);
  assert.equal(posted.inventoryPosted,true);
  const moves=(await getItems("domains/inventoryLedger/fields/movements")).filter(m=>m.lotId===posted.inventoryLotId);
  assert.equal(moves.length,1);assert.equal(moves[0].quantity,10);
  const p=await open("admin");await p.reload({waitUntil:"domcontentloaded"});await root(p).waitFor({timeout:60000});await goto(p,"/inventory");await p.getByText("QA-BROWSER-LOT",{exact:true}).waitFor();
  const cells=await p.getByRole("row").filter({hasText:"QA-BROWSER-LOT"}).locator("td").allTextContents();
  assert.equal(cells[4].trim(),"10");assert.equal(cells[6].trim(),"10");
 });
 await run("Supplier bill and three-way match",async()=>{
  const po=(await register()).orders[0];
  await form("ops","bills",{order:po.id,invoice:"QA-BILL-174",cases:"10",amount:"100"});
  const bill=await waitDb(async()=>(await register())?.bills.find(b=>b.invoiceNumber==="QA-BILL-174"),"Bill not saved");
  await button("admin","bills",bill.id,"Approve match");
  assert.equal((await register()).bills.find(b=>b.id===bill.id).approvedBy,uid("admin"));
 });
 await run("Supplier payment records only, independent evidence and credit",async()=>{
  const bill=(await register()).bills[0];
  await form("admin","payments",{bill:bill.id,reference:"QA-PAY-174",amount:"25"});
  const pay=await waitDb(async()=>(await register())?.payments.find(p=>p.reference==="QA-PAY-174"),"Payment record not saved");
  assert.equal(pay.externalSettlementVerified,false);
  await button("reviewer","payments",pay.id,"Verify recorded settlement","QA synthetic settlement evidence");
  assert.equal((await register()).payments.find(p=>p.id===pay.id).externalSettlementVerified,true);
  await form("ops","credits",{bill:bill.id,reference:"QA-CREDIT-174",reason:"Synthetic test credit",amount:"5"});
  const credit=(await register()).credits[0];
  await button("admin","credits",credit.id,"Review credit");
  assert.equal((await register()).credits[0].approvedBy,uid("admin"));
 });
 await run("Expense prepare and independent review",async()=>{
  await form("ops","expenses",{vendor:"",description:"QA synthetic expense",amount:"13.42"});
  const expense=(await register()).expenses[0];assert.equal(expense.amountCents,1342);
  await button("admin","expenses",expense.id,"Approve");
  assert.equal((await register()).expenses[0].approvedBy,uid("admin"));
 });
 await run("Shipment controls assign, reserve, load and depart",async()=>{
  const page=await open("admin");await page.reload({waitUntil:"domcontentloaded"});await root(page).waitFor({timeout:60000});await goto(page,"/inventory/shipments/"+orderId);
  await page.getByLabel("Assign driver for QA-174-ORDER").selectOption(uid("driver"));
  async function advance(label){
   const panel=page.locator(".prototype-fulfillment-workflow");
   await panel.locator("input[type=checkbox]").check();
   await panel.getByRole("button",{name:label,exact:true}).click();
   await panel.getByText("Saved and confirmed by the company server.",{exact:true}).waitFor({timeout:30000});
  }
  for(const label of ["Assign driver","Reserve full order","Confirm loading","Confirm departure"])await advance(label);
  assert.equal((await getItems("domains/delivery/fields/tasks")).find(t=>t.orderId===orderId).status,"In transit");
  assert.equal((await getItems("domains/commercial/fields/orders")).find(o=>o.id===orderId).status,"Out for delivery");
 });
 await run("Driver signature and exactly one posted delivery",async()=>{
  const page=await open("driver");await page.reload({waitUntil:"domcontentloaded"});await root(page).waitFor({timeout:60000});await goto(page,"/driver/deliveries");
  const card=page.locator(".delivery-card").filter({hasText:"QA-174-ORDER"});
  await card.getByRole("button",{name:"Complete delivery & sign"}).click();
  await page.getByPlaceholder("Name of person receiving delivery").fill("QA Synthetic Receiver");
  const pad=page.getByRole("img",{name:"Recipient signature drawing box"});
  await pad.scrollIntoViewIfNeeded();const b=await pad.boundingBox();assert(b);
  await page.mouse.move(b.x+b.width*.15,b.y+b.height*.3);await page.mouse.down();await page.mouse.move(b.x+b.width*.6,b.y+b.height*.6,{steps:12});await page.mouse.up();
  await page.getByRole("button",{name:"Save signature & complete"}).click();
  await page.getByText(/Recipient proof, inventory and Delivered status confirmed by server/).waitFor({timeout:30000});
  const tasks=await getItems("domains/delivery/fields/tasks");const t=tasks.find(x=>x.orderId===orderId);assert.equal(t.status,"Delivered");assert.equal(t.signature.recipientName,"QA Synthetic Receiver");
  const movements=(await getItems("domains/inventoryLedger/fields/movements")).filter(m=>m.relatedOrderId===orderId&&m.type==="Delivery");
  assert.equal(movements.length,1);assert.equal(movements[0].quantity,4);
  await page.reload({waitUntil:"domcontentloaded"});await root(page).waitFor({timeout:60000});await goto(page,"/driver/deliveries");assert.equal(await page.getByRole("button",{name:"Complete delivery & sign"}).count(),0);
 });
} catch(e){reports.errors.push({error:String(e),phase:"setup or suite"});}
finally{
 const failed=reports.routes.filter(r=>!r.pass),actions=reports.actions.filter(r=>!r.pass);
 reports.summary={routes:reports.routes.length,routeFailures:failed.length,actions:reports.actions.length,actionFailures:actions.length,pageErrors:reports.errors.length,routeControls:reports.routes.reduce((a,r)=>a+(r.controls?.length??0),0)};
 fs.writeFileSync(OUT+"/report.json",JSON.stringify(reports,null,2));
 console.log("CONNECTED_SUMMARY "+JSON.stringify(reports.summary));
 console.log("CONNECTED_ROUTE_FAILURES "+JSON.stringify(failed.map(({key,path,device,failure,sample,blockers})=>({key,path,device,failure,sample,blockers}))));
 console.log("CONNECTED_ACTION_FAILURES "+JSON.stringify(actions));
 console.log("CONNECTED_ERRORS "+JSON.stringify(reports.errors));
 for(const {context} of sessions.values())await context.close();
 await browser.close();await deleteApp(app);
 if(!reports.routes.length||!reports.actions.length||failed.length||actions.length||reports.errors.length)process.exitCode=1;
}
