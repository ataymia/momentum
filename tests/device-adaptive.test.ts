import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {isOpenCommercialAccount} from "../lib/account-view-filter";
import {getNavigationPage,setNavigationPage,subscribeNavigationPage} from "../lib/navigation-store";
import {validateTaxIdentity,taxIdentityMissing} from "../lib/account-tax-identity";

const read=(file:string)=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
test("device navigation is wired to role-filtered menu with accessible mobile destinations",()=>{
  const shell=read("components/app-shell-v4.tsx");
  const component=read("components/navigation/device-navigation.tsx");
  assert.match(shell,/DeviceNavigation items=\{\[\.\.\.allowedPrimary,\.\.\.allowedSecondary\]\}/);
  assert.match(component,/aria-label="Mobile main navigation"/);
  assert.match(component,/aria-current=\{active\?"page":undefined\}/);
  assert.match(component,/aria-haspopup="dialog"/);
  assert.match(component,/aria-expanded=\{expanded\}/);
  assert.match(component,/event\.key==="Escape"/);
  assert.match(component,/setSidebarOpen\(false\)/);
  assert.match(component,/currentUser\.role==="Sales Representative"/);
  assert.match(component,/currentUser\.role==="Customer"/);
});
test("adaptive CSS is strictly confined to touch breakpoints and preserves desktop/print",()=>{
  const css=read("app/device-adaptive.css");
  const layout=read("app/layout.tsx");
  assert.match(layout,/import "\.\/device-adaptive\.css";/);
  assert.match(css,/@media screen and \(max-width:1023px\)/);
  assert.match(css,/@media screen and \(min-width:700px\) and \(max-width:1023px\)/);
  assert.match(css,/@media screen and \(max-width:699px\)/);
  assert.match(css,/\.device-bottom-nav/);
  assert.match(css,/\.page--accounts \.account-table-body>button\.account-table/);
  assert.match(css,/\.page--orders \.order-table-body>button\.order-table/);
  assert.match(css,/\.modal__body\{flex:1 1 auto/);
  assert.match(css,/font-size:16px/);
  assert.doesNotMatch(css,/@media print/);
});
test("delivery-driver independent shell and canonical viewport are preserved",()=>{
  const css=read("app/mobile-platform.css");
  const layout=read("app/layout.tsx");
  assert.match(css,/\.delivery-driver-shell/);
  assert.match(layout,/export const viewport/);
  assert.match(layout,/width: "device-width"/);
});

test("CRM mobile filters omit unverified stage queues without modifying account records",()=>{
  const accounts=read("components/pages/accounts.tsx");
  assert.match(accounts,/const stages=\["All","Prospect","Opening order"\] as const/);
  assert.match(accounts,/stageFilterDisplay=\(stage:/);
  assert.match(accounts,/"Prospects":"Open accounts"/);
  assert.match(accounts,/isOpenCommercialAccount\(account,orderedAccountIds\)/);
  assert.doesNotMatch(accounts,/stages=\["All","Prospect","Qualified"/);
});

test("open-account grouping uses placed orders without rewriting stale stages",()=>{
  const orders=new Set(["acc-ordered"]);
  assert.equal(isOpenCommercialAccount({id:"acc-ordered",stage:"Prospect"},orders),true);
  assert.equal(isOpenCommercialAccount({id:"acc-opening",stage:"Opening order"},orders),true);
  assert.equal(isOpenCommercialAccount({id:"acc-placed",stage:"Placed"},orders),true);
  assert.equal(isOpenCommercialAccount({id:"acc-repeat",stage:"Reordered"},orders),true);
  assert.equal(isOpenCommercialAccount({id:"acc-risk",stage:"At risk"},orders),true);
  assert.equal(isOpenCommercialAccount({id:"acc-prospect",stage:"Prospect"},orders),false);
  assert.equal(isOpenCommercialAccount({id:"acc-qualified",stage:"Qualified"},orders),false);
  assert.equal(isOpenCommercialAccount({id:"acc-sampled",stage:"Sampled"},orders),false);
});

test("navigation and CRM browsing defer expensive sales calculations until requested",()=>{
  const shell=read("components/app-shell-v4.tsx");
  const accounts=read("components/pages/accounts.tsx");
  assert.doesNotMatch(shell,/evaluateSalesRepAccountBonuses/);
  assert.match(accounts,/tab==="incentives"\?evaluateSalesRepAccountBonuses/);
  assert.match(accounts,/tab==="pricing"\?scope\.accounts\.map/);
  assert.match(accounts,/selected&&\(accountPageId\|\|isCustomer\(currentUser\)\)\?evaluatePartnerPricing/);
});

test("CRM cards never inherit a wide desktop table on touch viewports",()=>{
  const css=read("app/device-adaptive.css");
  assert.match(css,/@media screen and \(max-width:1023px\)\{[\s\S]*?\.page--accounts \.account-list-panel\{min-width:0!important/);
  assert.match(css,/\.page--accounts \.account-table-body>button\.account-table\{\s*display:grid!important/);
  assert.match(css,/\.page--accounts \.account-table-body>button\.account-table \.account-name-cell :is\(strong,small\)\{/);
  assert.match(css,/white-space:normal;overflow-wrap:anywhere/);
});

test("navigation is isolated from the shared workspace data context",()=>{
  const base=read("lib/workspace-context-v5.tsx");
  const shell=read("components/app-shell-v4.tsx");
  const app=read("components/app-shell.tsx");
  const mobile=read("components/navigation/device-navigation.tsx");
  assert.match(base,/setNavigationPage\(allowed\)/);
  assert.doesNotMatch(base,/const \[activePage, setActivePage\]/);
  assert.doesNotMatch(base,/activePage: PageKey/);
  assert.match(shell,/const activePage=useNavigationPage\(\)/);
  assert.match(app,/const activePage=useNavigationPage\(\)/);
  assert.match(mobile,/const activePage=useNavigationPage\(\)/);
  assert.match(shell,/Suspense fallback=\{<div className="page"/);
  assert.match(shell,/lazy\(\(\)=>import\("\.\/pages\/focused-workspace-pages"\)/);
});

test("navigation store emits once per real page switch without persisting business data",()=>{
  setNavigationPage("home");
  const events:string[]=[];
  const unsubscribe=subscribeNavigationPage(()=>events.push(getNavigationPage()));
  setNavigationPage("accounts");
  setNavigationPage("accounts");
  setNavigationPage("settings");
  unsubscribe();
  setNavigationPage("home");
  assert.deepEqual(events,["accounts","settings"]);
  const source=read("lib/navigation-store.ts");
  assert.doesNotMatch(source,/momentumStorage\.|window\.localStorage|fetch\(/);
});

test("global record search does not subscribe the main app shell to sales and commerce",()=>{
  const shell=read("components/app-shell-v4.tsx");
  const dialog=read("components/global-search-modal.tsx");
  assert.doesNotMatch(shell,/useCrm\(|useCommerce\(/);
  assert.doesNotMatch(shell,/const searchResults/);
  assert.match(shell,/const GlobalSearchModal=lazy\(\(\)=>import\("\.\/global-search-modal"\)/);
  assert.match(shell,/searchOpen&&<Suspense fallback=/);
  assert.match(shell,/<GlobalSearchModal onClose=\{\(\)=>setSearchOpen\(false\)\}/);
  assert.match(dialog,/const \{crm\}=useCrm\(\)/);
  assert.match(dialog,/const \{commerce\}=useCommerce\(\)/);
  assert.match(dialog,/if \(normalized\) \{/);
  assert.match(dialog,/const visibleSearchResults = searchResults\.slice\(0, 24\)/);
  assert.match(dialog,/onClick=\{\(\) => openResult\(result\.page, result\.focus\)\}/);
});

test("business identity requires licensed name and validates EIN and AZ TPT formats",()=>{
  assert.match(validateTaxIdentity({}).legalBusinessName??"",/exact legal business name/);
  assert.deepEqual(validateTaxIdentity({legalBusinessName:"Licensed Shop LLC",ein:"12-3456789",azTptLicenseNumber:"12345678",taxDocumentType:"Resale 5000A"}),{});
  assert.match(validateTaxIdentity({legalBusinessName:"Shop",ein:"abc123456789"}).ein??"",/9 digits/);
  assert.match(validateTaxIdentity({legalBusinessName:"Shop",azTptLicenseNumber:"1234XYZ9"}).azTptLicenseNumber??"",/8 digits/);
  assert.match(validateTaxIdentity({legalBusinessName:"Shop",taxDocumentType:"Resale 5000A"}).azTptLicenseNumber??"",/TPT number/);
  assert.deepEqual(validateTaxIdentity({legalBusinessName:"Shop",taxDocumentType:"Undetermined"}),{});
});

test("tax identities remain unverified, and missing legacy data is visible",()=>{
  assert.ok(taxIdentityMissing({}).includes("Legal business name"));
  const profile=read("components/pages/accounts.tsx");
  const setup=read("components/pages/operations-tools-base.tsx");
  assert.match(profile,/taxIdentityMissing\(selectedCustomer\)/);
  assert.match(profile,/updateCustomerCommercial\(selectedCustomer\.id/);
  assert.match(profile,/legalBusinessName:taxForm\.legalBusinessName/);
  assert.match(setup,/name="legalName"/);
  assert.match(setup,/name="tptNumber"/);
  assert.match(setup,/name="taxDoc"/);
  assert.doesNotMatch(profile,/taxExemptionStatus:\s*"Verified"/);
});

test("business identity fields persist in customers and commercial patches",()=>{
  const types=read("lib/types.ts");
  const base=read("lib/workspace-context-v5.tsx");
  const state=read("lib/commercial-state.ts");
  const normalized=read("lib/workspace-normalization.ts");
  for(const field of ["legalBusinessName","ein","azTptLicenseNumber","taxDocumentType"]){
    assert.ok(types.includes(field));
    assert.ok(base.includes(field));
    assert.ok(state.includes(field));
    assert.ok(normalized.includes(field));
  }
  assert.match(base,/taxDocumentType:account\.taxDocumentType\?\?"Undetermined"/);
  assert.match(state,/customerPatches\[customerId\]=patch/);
});

test("systemwide native invalid forms and explicit field errors mark blockers red",()=>{
  const component=read("components/form-validation-listener.tsx");
  const app=read("components/momentum-app.tsx");
  const ui=read("components/ui.tsx");
  const css=read("app/globals.css");
  assert.match(component,/addEventListener\("invalid",onInvalid,true\)/);
  assert.match(app,/<FormValidationListener\/>/);
  assert.match(ui,/className="field__error" role="alert"/);
  assert.match(css,/form\[data-validation-attempted="true"\]/);
  assert.match(css,/\.field\[data-invalid="true"\]/);
});
