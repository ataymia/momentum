import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const BASE="http://127.0.0.1:5011";
const OUT="artifacts/full-platform-audit";
fs.mkdirSync(OUT,{recursive:true});
const registry=fs.readFileSync("lib/navigation-route-registry.ts","utf8");
const menu=registry.slice(registry.indexOf("export const MENU_GROUPS:"),registry.indexOf("/** Customer-facing"));
const groups={};let groupName="";
for(const line of menu.split("\n")){
  const group=line.match(/^\s*\{ label: "([^"]+)", entries: \[$/);
  if(group){groupName=group[1];groups[groupName]=[];continue;}
  const item=line.match(/^\s*\{ label: "([^"]+)", path: "(\/[^"]+)", permission: "([^"]+)", state: "([^"]+)" \},?$/);
  if(item&&groupName)groups[groupName].push({label:item[1],path:item[2],permission:item[3],state:item[4]});
}
const pages=Object.entries(groups).flatMap(([group,entries])=>entries.map(e=>({...e,group})));
assert.equal(pages.length,84,"All 84 declared staff menu destinations must be audited");

const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1, reducedMotion:"reduce"});
await context.addInitScript(()=>{
  localStorage.setItem("momentum-runtime-mode-v1",JSON.stringify({version:1,mode:"demo"}));
});
await context.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(["data:","blob:"].includes(url.protocol)||["127.0.0.1","localhost"].includes(url.hostname))await route.continue();
  else await route.abort("blockedbyclient");
});
const page=await context.newPage();
const errors=[];
const consoleErrors=[];
page.on("pageerror",e=>errors.push({route:new URL(page.url()).pathname,message:e.message}));
page.on("console",m=>{
 if(m.type()==="error"&&!/net::ERR_FAILED|ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text()))
  consoleErrors.push({route:new URL(page.url()).pathname,message:m.text().slice(0,350)});
});
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const saveShot=async(name,full=false)=>{
 try{return await page.screenshot({path:path.join(OUT,name+".jpg"),type:"jpeg",quality:62,fullPage:full,animations:"disabled"});}
 catch(e){console.log("SCREENSHOT_ERROR "+name+" "+String(e));return null;}
};
const goto=async(route)=>{
 await page.goto(BASE+route,{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator(".page-container").waitFor({timeout:20000});
 // The app is lazy-loaded; wait for a real page or error rather than capturing Suspense.
 await page.waitForFunction(()=>{
  const el=document.querySelector(".page-container");
  const txt=el?.textContent?.trim()??"";
  return txt.length>=30&&!/^Opening (page|section)/i.test(txt);
 },{timeout:12000}).catch(()=>{});
 await page.waitForTimeout(160);
};
const inspect=async()=>page.evaluate(()=>{
 const root=document.querySelector(".page-container");
 const body=document.body,main=root?.querySelector("main")||root;
 const text=(root?.innerText||"").trim();
 const h1=[...root?.querySelectorAll("h1")||[]].map(x=>x.textContent?.trim()||"").filter(Boolean);
 const images=[...root?.querySelectorAll("img")||[]];
 const broken=images.filter(img=>img.complete&&img.naturalWidth===0).map(img=>img.src.slice(0,140));
 const doc=document.documentElement;
 const overflow=Math.max(doc.scrollWidth,body.scrollWidth)-doc.clientWidth;
 return{title:document.title,h1,textLength:text.length,blank:text.length<35,
  blocked:text.includes("Page unavailable"),
  placeholder:text.includes("Planned module")&&text.includes("navigation prototype only"),
  connectionBlocked:text.includes("Production connection blocked"),
  readonly:text.toLowerCase().includes("read-only"),
  errorText:/application error|an unexpected error occurred|internal server error/i.test(text),
  overflowPx:overflow,images:images.length,broken,
  buttons:main?.querySelectorAll("button")?.length||0,
  inputs:main?.querySelectorAll("input,select,textarea")?.length||0,
  tables:main?.querySelectorAll("table")?.length||0,
  visibleText:text.slice(0,180),
 };
});
const report={sha:process.env.GITHUB_SHA??"local",timestamp:new Date().toISOString(),routeChecks:[],visualChecks:[],roleChecks:[],interactions:[],errors,consoleErrors,summary:{}};
async function recordInteraction(name,operation){
 try{await operation();report.interactions.push({name,result:"PASS"});}
 catch(e){report.interactions.push({name,result:"FAIL",message:String(e).slice(0,400)});}
}
try{
 await page.goto(BASE+"/crm/deals",{waitUntil:"domcontentloaded"});
 await page.getByRole("heading",{name:"Sign in"}).waitFor({timeout:22000});
 await page.getByLabel("Username or work email").fill("odemo");
 await page.getByLabel("Password",{exact:true}).fill("admin");
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await page.getByRole("navigation",{name:"Primary navigation"}).waitFor({timeout:40000});
 console.log("BROWSER_AUDIT staff login verified; menu routes="+pages.length);

 for(const entry of pages){
  let result={...entry},phase="nav";
  try{
   await goto(entry.path);
   Object.assign(result,await inspect());
   if(result.blank||result.errorText||result.blocked||result.placeholder||result.broken.length){
    await saveShot("issue-"+slug(entry.group+"-"+entry.label));
   }
  }catch(e){result.failure=String(e).slice(0,500);await saveShot("exception-"+slug(entry.group+"-"+entry.label));}
  report.routeChecks.push(result);
  if(report.routeChecks.length%14===0)console.log("ROUTE_AUDIT_PROGRESS "+report.routeChecks.length+"/"+pages.length);
 }
 // Inspect high-traffic pages at desktop, tablet, and phone sizes.
 const visualRoutes=[
  ["/","Workspace Home"],
  ["/crm/leads","CRM Leads"],
  ["/crm/deals","CRM Deals"],
  ["/sales/customers","Customer Accounts"],
  ["/sales/orders","Sales Orders"],
  ["/sales/invoices","Invoices"],
  ["/items","Item Catalog"],
  ["/inventory","Inventory"],
  ["/purchases/vendors","Purchasing"],
  ["/operations/deliveries","Deliveries"],
  ["/people","HR"],
  ["/people/directory","Employee Directory"],
  ["/marketing","Marketing"],
  ["/reports/explorer","Analytics"],
  ["/support/cases","Support Cases"],
  ["/calendar/meetings","Meetings"],
  ["/admin","Administration"],
 ];
 for(const [width,height,device] of [[1440,900,"desktop"],[768,1024,"tablet"],[390,844,"phone"]]){
  await page.setViewportSize({width,height});
  for(const [url,label] of visualRoutes){
   try{
    await goto(url);
    const state=await inspect();
    if(device==="phone"&&url==="/sales/orders"){
      const cards=page.locator(".momentum-mobile-order-card");
      const count=await cards.count();
      const desktopVisible=await page.locator(".momentum-order-desktop-table").isVisible();
      if(count===0||desktopVisible)state.failure="Mobile Sales Orders must show legible record cards instead of the desktop table.";
      else state.mobileCards=count;
    }
    report.visualChecks.push({device,url,label,...state});
    if(device!=="tablet"||state.overflowPx>8)
      await saveShot(device+"-"+slug(label));
   }catch(e){report.visualChecks.push({device,url,label,failure:String(e).slice(0,350)});}
  }
  console.log("VISUAL_AUDIT_PROGRESS "+device);
 }
 await page.setViewportSize({width:1440,height:900});
 await recordInteraction("CRM Leads search and reset",async()=>{
   await goto("/crm/leads");
   const q=page.getByRole("textbox",{name:"Search businesses"});await q.fill("unlikely_synthetic_audit_7f2");
   assert.match(await page.locator(".page-container").innerText(),/matching records|No/i);
   await q.fill("");
 });
 await recordInteraction("CRM Accounts representative filter",async()=>{
   await goto("/sales/customers");
   const rep=page.getByLabel("Filter accounts by representative");assert(await rep.isVisible());
   const opts=await rep.locator("option").count();assert(opts>=1);
 });
 await recordInteraction("CRM Deals to new record via direct navigation",async()=>{
   await goto("/crm/deals/new");const state=await inspect();
   assert(!state.blocked&&!state.placeholder&&state.h1.length>0);
 });
 await recordInteraction("Meeting creation route",async()=>{
   await goto("/calendar/meetings/new");const s=await inspect();
   assert(!s.blocked&&!s.placeholder&&s.inputs>=2);
 });
 await recordInteraction("Purchasing local-demo entry form",async()=>{
   await goto("/purchases/vendors");
   await page.getByRole("button",{name:/Prepare vendor/i}).click();
   assert(await page.getByText("Vendor name").count()>0);
   await page.getByRole("button",{name:/Close entry form/i}).click();
 });
 await recordInteraction("Invoice print center available",async()=>{
   await goto("/sales/invoices");
   const toggle=page.getByRole("button",{name:/Print \/ Save PDF \(single or bulk\)/});
   if(await toggle.count()>0){await toggle.first().click();assert(await page.getByText(/Print selected|Print \/ Save PDF/).count()>0);}
   else throw new Error("Invoice print-center toggle missing");
 });
 // Role-negative testing, not just hidden menus: copied URLs should fail closed.
 await recordInteraction("Global staff search opens selected customer record",async()=>{
   await goto("/sales/customers");
   await page.locator(".sidebar-search").click();
   const input=page.getByPlaceholder("Search records…");await input.fill("Desert Lantern");
   const result=page.locator(".command-results button").filter({hasText:"Desert Lantern"}).first();
   await result.waitFor({timeout:10000});await result.click();
   assert.match(new URL(page.url()).pathname,/^\/sales\/customers\/[^/]+$/);
 });
 await page.locator(".user-button").click();
 await page.locator(".user-popover button").filter({hasText:"Customer Demo"}).click();
 await recordInteraction("Customer search opens portal order rather than internal sales workspace",async()=>{
   await goto("/portal/orders");
   await page.locator(".sidebar-search").click();
   const input=page.getByPlaceholder("Search location or order…");await input.fill("GE-1047");
   const result=page.locator(".command-results button").filter({hasText:"GE-1047"}).first();
   await result.waitFor({timeout:10000});await result.click();
   assert.match(new URL(page.url()).pathname,/^\/portal\/orders\/[^/]+$/);
 });
 for(const route of ["/crm/deals","/admin/employee-profiles","/people/payroll","/inventory","/purchases/bills","/sales/orders/new"]){
  try{await goto(route);const state=await inspect();report.roleChecks.push({role:"Customer",route,blocked:state.blocked,pass:state.blocked});}
  catch(e){report.roleChecks.push({role:"Customer",route,pass:false,failure:String(e)});}
 }
 for(const route of ["/portal/orders","/portal/invoices","/portal/payments","/portal/account","/portal/deliveries"]){
  try{await goto(route);const state=await inspect();report.roleChecks.push({role:"Customer",route,accessible:!state.blocked,pass:!state.blocked,connectionBlocked:state.connectionBlocked});}
  catch(e){report.roleChecks.push({role:"Customer",route,pass:false,failure:String(e)});}
 }
 await goto("/portal/orders");await saveShot("customer-portal");
 await page.locator(".user-button").click();
 await page.locator(".user-popover button").filter({hasText:"Owner Demo"}).click();
 await goto("/crm/deals");
 await page.locator(".user-button").click();
 await page.locator(".user-popover button").filter({hasText:"Sales Rep Demo"}).click();
 for(const [route,expectAccess] of [["/crm/deals",true],["/crm/self-delivery",true],["/people/payroll",false],["/admin/employee-profiles",false],["/purchases/payments",false]]){
  try{await goto(route);const state=await inspect();report.roleChecks.push({role:"Sales Representative",route,expected:expectAccess,accessible:!state.blocked,pass:(!state.blocked)===expectAccess});}
  catch(e){report.roleChecks.push({role:"Sales Representative",route,pass:false,failure:String(e)});}
 }
 await goto("/crm/self-delivery");await saveShot("rep-self-delivery");
 // Summary and audit artifact: failures are data, never silently dropped.
 const broken=report.routeChecks.filter(x=>x.failure||x.blank||x.errorText||x.blocked||(x.placeholder&&x.state!=="planned")||x.broken?.length);
 const visual=report.visualChecks.filter(x=>x.failure||x.overflowPx>8||x.blank||x.blocked||x.placeholder||x.broken?.length);
 const role=report.roleChecks.filter(x=>!x.pass);
 const interactions=report.interactions.filter(x=>x.result!=="PASS");
 report.summary={staffRoutes:pages.length,staffBroken:broken.length,visualViews:report.visualChecks.length,
  visualProblems:visual.length,roleChecks:report.roleChecks.length,roleProblems:role.length,
  interactionChecks:report.interactions.length,interactionProblems:interactions.length,
  uncaughtErrors:errors.length,consoleErrors:consoleErrors.length,
  intentionallyPlanned:report.routeChecks.filter(x=>x.placeholder&&x.state==="planned").length,
  groups:Object.fromEntries(Object.entries(groups).map(([key,items])=>[key,items.length]))};
 fs.writeFileSync(path.join(OUT,"audit-report.json"),JSON.stringify(report,null,2));
 const markdown=[
 "# Momentum exhaustive demo browser route, role and layout audit",
 "Commit: "+report.sha+" · "+report.timestamp,
 "## Summary\n"+JSON.stringify(report.summary,null,2),
 "## Broken static routes\n"+JSON.stringify(broken,null,2),
 "## Responsive exceptions\n"+JSON.stringify(visual,null,2),
 "## Role problems\n"+JSON.stringify(role,null,2),
 "## Interaction results\n"+JSON.stringify(report.interactions,null,2),
 "## Page exceptions\n"+JSON.stringify(errors,null,2),
 "## Console errors\n"+JSON.stringify(consoleErrors,null,2),
 ].join("\n\n");
 fs.writeFileSync(path.join(OUT,"audit-report.md"),markdown);
 console.log("FULL_AUDIT_SUMMARY "+JSON.stringify(report.summary));
 console.log("FULL_AUDIT_ROUTE_FINDINGS "+JSON.stringify(broken.map(({group,path,label,blocked,placeholder,blank,errorText,failure})=>({group,path,label,blocked,placeholder,blank,errorText,failure}))));
 console.log("FULL_AUDIT_VISUAL_FINDINGS "+JSON.stringify(visual.map(({device,url,label,overflowPx,blank,blocked,placeholder,failure})=>({device,url,label,overflowPx,blank,blocked,placeholder,failure}))));
 console.log("FULL_AUDIT_ROLE_FINDINGS "+JSON.stringify(role));
 console.log("FULL_AUDIT_INTERACTIONS "+JSON.stringify(report.interactions));
 console.log("FULL_AUDIT_ERRORS "+JSON.stringify(errors.slice(0,20)));
 // Tiny stills embedded in logs allow direct human visual inspection without exposing customers or production.
 for(const name of ["desktop-crm-deals","phone-sales-orders","desktop-inventory","phone-hr","customer-portal"]){
  const file=path.join(OUT,name+".jpg");
  if(fs.existsSync(file)){
   const buffer=fs.readFileSync(file);
   if(buffer.length<130000)console.log("AUDIT_VISUAL_IMAGE "+name+" "+buffer.toString("base64"));
  }
 }
 // Report failures rather than masking them, but screenshots and JSON are uploaded even when this command fails.
 if(broken.length||visual.length||role.length||interactions.length||errors.length)process.exitCode=1;
}finally{
 await context.close();await browser.close();
}
