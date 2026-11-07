import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";

const base="http://127.0.0.1:5011";
mkdirSync("artifacts/a-browser",{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const pageErrors=[];
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
await context.addInitScript(()=>{
  // Local-only fixture mode. No live identities, Firebase mutation or external traffic.
  localStorage.setItem("momentum-runtime-mode-v1",JSON.stringify({version:1,mode:"demo"}));
});
await context.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.protocol==="data:"||url.protocol==="blob:"||url.hostname==="127.0.0.1"||url.hostname==="localhost"){
    await route.continue();
  }else{
    await route.abort("blockedbyclient");
  }
});
const page=await context.newPage();
page.on("pageerror",error=>pageErrors.push(error.message));
const path=()=>new URL(page.url()).pathname;
const nav=()=>page.getByRole("navigation",{name:"Primary navigation"});
const entry=label=>nav().getByRole("link",{name:label,exact:true});
const screenshot=async name=>page.screenshot({path:"artifacts/a-browser/"+name+".png",fullPage:true,animations:"disabled"});

try{
  await page.goto(base+"/crm/deals",{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"Sign in"}).waitFor();
  await page.getByLabel("Username or work email").fill("odemo");
  await page.getByLabel("Password",{exact:true}).fill("admin");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await nav().waitFor({timeout:40000});
  assert.equal(path(),"/crm/deals","Login must preserve the copied route");
  assert.equal(await entry("Deals").getAttribute("aria-current"),"page");
  await screenshot("desktop-deals");

  await entry("Meetings").click();
  assert.equal(path(),"/calendar/meetings");
  assert.equal(await entry("Meetings").getAttribute("aria-current"),"page");
  assert.notEqual(await entry("Shared Calendar").getAttribute("aria-current"),"page");
  await entry("Shared Calendar").click();
  assert.equal(path(),"/calendar");
  assert.equal(await entry("Shared Calendar").getAttribute("aria-current"),"page");
  await page.goBack();
  await page.waitForFunction(()=>document.querySelector('a[href="/calendar/meetings"]')?.getAttribute("aria-current")==="page");
  assert.equal(path(),"/calendar/meetings");
  await page.goForward();
  await page.waitForFunction(()=>document.querySelector('a[href="/calendar"]')?.getAttribute("aria-current")==="page");
  assert.equal(path(),"/calendar");
  await page.goto(base+"/calendar/meetings",{waitUntil:"domcontentloaded"});
  await entry("Meetings").waitFor();
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector('a[href="/calendar/meetings"]')?.getAttribute("aria-current")==="page");
  assert.match(await page.title(),/Meetings/);

  await page.goto(base+"/sales/customers/acc-101",{waitUntil:"domcontentloaded"});
  await page.getByText("Desert Lantern Market").first().waitFor({timeout:20000});
  assert.equal(path(),"/sales/customers/acc-101");
  // A10: until redesigned counterparts are integrated, do not replace four
  // working CRM/HR workflows with a navigation-only placeholder.
  for(const [route,title] of [
    ["/crm/quick-visit","Quick Visit"],
    ["/crm/account-setup","New Account Setup"],
    ["/crm/account-health","Account health"],
    ["/people/directory","Employee directory"],
  ]){
    await page.goto(base+route,{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:title,exact:true}).first().waitFor({timeout:20000});
    assert.equal(path(),route);
    assert.equal(await page.getByText("Planned module • navigation prototype only").count(),0,route);
  }
  await page.goto(base+"/sales/orders/%2Fadmin",{waitUntil:"domcontentloaded"});
  // Invalid, non-record encodings must NEVER render an Order. The identity
  // guard may safely replace an unauthorized incoming route with Home.
  await page.waitForFunction(()=>window.location.pathname==="/" ||
    document.body.textContent?.includes("Page unavailable"),{timeout:20000});
  assert(!pageErrors.length,"Malformed encoded route must not crash the app");
  assert.equal(await page.getByRole("heading",{name:/^Order details/}).count(),0);

  await page.locator(".user-button").click();
  await page.locator(".user-popover button").filter({hasText:"Customer Demo"}).click();
  await page.goto(base+"/crm/deals",{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"Page unavailable"}).waitFor({timeout:20000});
  await page.getByRole("navigation",{name:"Customer portal navigation"}).waitFor();
  assert.equal(await page.getByRole("link",{name:"Deals"}).count(),0);
  await page.goto(base+"/portal/orders",{waitUntil:"domcontentloaded"});
  await page.getByRole("navigation",{name:"Customer portal navigation"}).waitFor();
  await screenshot("customer-portal");

  await page.locator(".user-button").click();
  await page.locator(".user-popover button").filter({hasText:"Owner Demo"}).click();
  await page.goto(base+"/crm/deals",{waitUntil:"domcontentloaded"});
  await nav().waitFor();
  // No HR Administration through the sales role, but ordinary employee
  // self-service remains available in the Workspace group.
  await page.locator(".user-button").click();
  await page.locator(".user-popover button").filter({hasText:"Sales Rep Demo"}).click();
  await nav().waitFor();
  assert.equal(await nav().getByRole("link",{name:"New Hire"}).count(),0);
  assert.equal(await nav().getByRole("link",{name:"Employee Directory"}).count(),0);
  assert(await nav().getByRole("link",{name:"My Employee Workspace"}).isVisible());
  await page.goto(base+"/admin/employee-profiles",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.body.textContent?.includes("Page unavailable")||window.location.pathname==="/");
  assert.equal(await page.getByText("Compensation").count(),0);
  await page.locator(".user-button").click();
  await page.locator(".user-popover button").filter({hasText:"Owner Demo"}).click();
  await page.goto(base+"/crm/deals",{waitUntil:"domcontentloaded"});
  await nav().waitFor();

  await page.locator(".sidebar__collapse").click();
  await page.setViewportSize({width:768,height:1024});
  await page.getByRole("button",{name:"Open menu"}).click();
  await page.locator("aside.sidebar.is-open").waitFor();
  assert(await entry("Deals").isVisible());
  assert(await entry("Deals").locator("span").isVisible(),"Collapsed desktop state may not hide tablet labels");
  await screenshot("tablet-menu");
  await page.keyboard.press("Escape");
  await page.locator("aside.sidebar.is-open").waitFor({state:"detached"});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button",{name:"Open menu"}).click();
  await page.locator("aside.sidebar.is-open").waitFor();
  assert(await entry("Deals").isVisible());
  await screenshot("phone-menu");
  await page.keyboard.press("Escape");
  await page.locator("aside.sidebar.is-open").waitFor({state:"detached"});
  await page.waitForFunction(()=>document.activeElement===document.querySelector('button[aria-label="Open menu"]'));
  assert.deepEqual(pageErrors,[],"Unexpected browser exception");
  console.log("A browser QA passed: links, history, legacy fallback, role isolation, desktop/tablet/phone menus and keyboard focus");
}finally{
  await context.close();
  await browser.close();
}
