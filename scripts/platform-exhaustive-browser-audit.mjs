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
assert.equal(pages.length,83,"All 83 declared staff menu destinations must be audited, including personal Account");

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
 // Structural and visual consistency evidence, not just "a route loaded".
 const uiRoot=document.querySelector(".page-container");
 const styled=uiRoot instanceof HTMLElement&&uiRoot.classList.contains("momentum-workspace-ui");
 const mainLandmark=uiRoot?.matches("main[role=main],main#momentum-workspace-content")===true;
 const blocks=[...(uiRoot?.querySelectorAll(".panel,.prototype-panel,section,article,.card,.metric-card")??[])];
 const headingStructure=[...(uiRoot?.querySelectorAll("h1,h2,h3")??[])].map(el=>el.textContent?.trim()??"").filter(Boolean);
 const foreground=uiRoot?getComputedStyle(uiRoot).color:null;
 const canvas=uiRoot?getComputedStyle(uiRoot).backgroundColor:null;
 const pageLabel=document.querySelector(".topbar__location")?.textContent?.trim()??"";
 const visibleInputElements=[...(uiRoot?.querySelectorAll("input:not([type=hidden]),select,textarea")??[])].filter(el=>el instanceof HTMLElement && el.getClientRects().length>0 && !(el instanceof HTMLInputElement && ["checkbox","radio"].includes(el.type)));
 const unlabeledInputs=visibleInputElements.filter(el=>{
   const input=el;
   const name=input.getAttribute("aria-label")?.trim()||input.getAttribute("aria-labelledby")?.trim()||
       input.closest("label")?.textContent?.trim()|| (input.id?document.querySelector('label[for="'+CSS.escape(input.id)+'"]')?.textContent?.trim():"");
   return !name;
 }).length;
 const compactActions=[...(uiRoot?.querySelectorAll("button")??[])].filter(el=>{
   const r=el.getBoundingClientRect();
   return r.width>0&&r.height>0&&!el.disabled&&r.height<30&&r.width<30;
 }).length;
 return{title:document.title,h1,textLength:text.length,blank:text.length<35,
  styled,mainLandmark,canvas,foreground,breadcrumb:pageLabel,contentBlocks:blocks.length,headingStructure,
  unlabeledInputs,compactActions,layoutReview:(!h1.length||!blocks.length),
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
const report={sha:process.env.GITHUB_SHA??"local",timestamp:new Date().toISOString(),routeChecks:[],visualChecks:[],roleChecks:[],interactions:[],errors,consoleErrors,summary:{},contractVersion:"visual-r72-v1"};
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
   if(result.blank||result.errorText||result.blocked||result.placeholder||result.broken.length||!result.styled||!result.mainLandmark){
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
  ["/crm/quick-visit","Quick Visit"],
  ["/crm/account-setup","Account Setup"],
  ["/people/timekeeping","Timekeeping"],
  ["/my-account/time-off","Personal Leave"],
  ["/admin/employee-profiles","Employee Profiles"],
  ["/admin/audit","Audit Center"],
  ["/admin/workforce","Workforce Live"],
  ["/people/leave","HR Leave"],
 ];
 // Every registered destination must be screened at desktop and phone width.
 // Tablet retains a high-risk representative set to bound browser audit time.
 const representative=visualRoutes;
 const allRoutes=[...new Map([...representative,...pages.map(item=>[item.path,item.group+" / "+item.label])].map(item=>[item[0],item])).values()];
 for(const [width,height,device] of [[1440,900,"desktop"],[768,1024,"tablet"],[390,844,"phone"]]){
  await page.setViewportSize({width,height});
  for(const [url,label] of (device==="tablet"?representative:allRoutes)){
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
      await saveShot(device+"-"+slug(label)+"-"+slug(url));
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
 // R15/R16: a physical Quick Visit is an editable three-stage form.
 await recordInteraction("R15 Quick Visit freehand entry, validation and demo persistence",async()=>{
   await goto("/crm/quick-visit");
   const name=page.getByLabel("Business or store name");
   assert(await name.isEditable(),"Quick Visit business name must be editable");
   await name.fill("Audit-only physical store example");
   await page.getByLabel("Visit notes").fill("Isolated automated browser audit entry");
   await page.getByLabel(/I confirm that I physically visited this business/).check();
   await page.getByRole("button",{name:"Save field visit"}).click();
   await page.getByText(/Physical visit recorded in the local demonstration CRM/).waitFor({timeout:10000});
   await page.reload({waitUntil:"domcontentloaded"});
   await page.getByText("Audit-only physical store example").first().waitFor({timeout:10000});
 });
 // R52: submit leave from personal account; don't imply HR approval.
 await recordInteraction("R52 employee can submit a demo leave request",async()=>{
   await goto("/my-account/time-off");
   const form=page.locator('form').filter({has:page.getByRole("button",{name:/Submit request/})}).first();
   assert(await form.isVisible(),"Leave request form must render");
   await form.locator('input[type="date"]').nth(0).fill("2027-01-18");
   await form.locator('input[type="date"]').nth(1).fill("2027-01-18");
   await form.locator('input[type="number"]').fill("8");
   await form.locator("textarea").fill("Automated local-demo workflow check");
   await form.getByRole("button",{name:"Submit request"}).click();
   await page.getByText(/Demo request saved in this browser/).waitFor({timeout:10000});
   await page.getByText("2027-01-18 to 2027-01-18").waitFor({timeout:10000});
 });
 // R10: punch and then restore original state to avoid misleading test timecards.
 await recordInteraction("R10 timekeeping has visible actionable state and reversible punches",async()=>{
   await goto("/people/timekeeping");
   const hero=page.locator(".timekeeping-hero");
   assert(await hero.isVisible(),"New timekeeper hero absent");
   const clockIn=hero.getByRole("button",{name:"Clock in"});
   const originallyOpen=!(await clockIn.count());
   await hero.getByRole("button",{name:originallyOpen?"Clock out":"Clock in"}).click();
   await hero.getByRole("button",{name:originallyOpen?"Clock in":"Clock out"}).waitFor({timeout:10000});
   await hero.getByRole("button",{name:originallyOpen?"Clock in":"Clock out"}).click();
   await hero.getByRole("button",{name:originallyOpen?"Clock out":"Clock in"}).waitFor({timeout:10000});
 });
 // R72: inspect account menu and genuine persisted display preference, not inert links.
 await recordInteraction("R72 account menu lets user edit display preferences",async()=>{
   await goto("/my-account");
   await page.locator(".user-button").click();
   await page.getByRole("button",{name:/Display preferences/}).click();
   const selector=page.getByRole("dialog").getByRole("combobox");
   await selector.selectOption("compact");
   assert(await page.locator("html.momentum-density-compact").count()===1,"Compact layout choice did not apply");
   await page.getByRole("dialog").getByRole("button",{name:"Done"}).click();
   await goto("/crm/leads");
   assert(await page.locator("html.momentum-density-compact").count()===1,"Display preference was lost on navigation");
   await page.locator(".user-button").click();
   await page.getByRole("button",{name:/Display preferences/}).click();
   await page.getByRole("dialog").getByRole("combobox").selectOption("comfortable");
   await page.getByRole("dialog").getByRole("button",{name:"Done"}).click();
 });
 // R73: hierarchy is not the former single leaf label.
 await recordInteraction("R73 account breadcrumbs include every parent segment",async()=>{
   await goto("/my-account/time-off");
   const breadcrumb=await page.getByRole("navigation",{name:"Breadcrumb"}).innerText();
   assert.match(breadcrumb,/Momentum/);
   assert.match(breadcrumb,/Account/);
   assert.match(breadcrumb,/My Account/);
   assert.match(breadcrumb,/My Time Off/);
 });
 await recordInteraction("R23 customer account transactions show relationship and provenance",async()=>{
   await goto("/sales/customers");
   await page.locator(".sidebar-search").click();
   await page.getByPlaceholder("Search records…").fill("Desert Lantern");
   const record=page.locator(".command-results button").filter({hasText:"Desert Lantern"}).first();
   await record.waitFor({timeout:10000});await record.click();
   const pathname=new URL(page.url()).pathname;
   assert.match(pathname,/^\/sales\/customers\/[^/]+$/);
   await goto(pathname+"/transactions");
   const body=await page.locator(".page-container").innerText();
   assert.match(body,/Orders & billing transactions/);
   assert.match(body,/Sales orders, invoiced amounts and settled payment evidence are distinct records/);
 });
 await recordInteraction("R50 admin employee profile has clear record sections",async()=>{
   await goto("/admin/employee-profiles");
   const body=await page.locator(".page-container").innerText();
   assert.match(body,/Employee|Profile/);
   assert(await page.locator(".employee-profile-card").count()>0,"Employee record card not present");
   assert(await page.locator(".employee-directory-list").count()>0,"Employee list missing");
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
 const broken=report.routeChecks.filter(x=>x.failure||x.blank||x.errorText||x.blocked||(x.placeholder&&x.state!=="planned")||x.broken?.length||!x.styled||!x.mainLandmark);
 const visual=report.visualChecks.filter(x=>x.failure||x.overflowPx>8||x.blank||x.blocked||x.placeholder||x.broken?.length||!x.styled||!x.mainLandmark);
 const role=report.roleChecks.filter(x=>!x.pass);
 const interactions=report.interactions.filter(x=>x.result!=="PASS");
 report.summary={staffRoutes:pages.length,staffBroken:broken.length,visualViews:report.visualChecks.length,
  styledRoutes:report.routeChecks.filter(x=>x.styled&&x.mainLandmark).length,
  structureReviewRoutes:report.routeChecks.filter(x=>x.layoutReview).length,
  unlabeledInputsObserved:report.routeChecks.reduce((n,x)=>n+(x.unlabeledInputs||0),0),
  compactControlsObserved:report.routeChecks.reduce((n,x)=>n+(x.compactActions||0),0),
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
 "## Route-by-route layout inventory (all staff pages)\n"+JSON.stringify(report.routeChecks.map(({group,path,label,h1,styled,mainLandmark,contentBlocks,headingStructure,unlabeledInputs,compactActions,canvas,breadcrumb,layoutReview})=>({group,path,label,h1,styled,mainLandmark,contentBlocks,headingStructure,unlabeledInputs,compactActions,canvas,breadcrumb,layoutReview})),null,2),
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
