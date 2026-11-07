import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");

test("review-ready C tables sort all data columns without sorting action-only links",()=>{
 const contacts=read("components/prototype/crm-contacts-experience.tsx");
 for(const key of ["name","business","role","decisionRole","email","phone","active","created"])
   assert.match(contacts,new RegExp('heading\\("'+key+'"'));
 const deals=read("components/prototype/crm-deals-experience.tsx");
 for(const key of ["name","location","stage","status","owner","cases","nextAction","updated"])
   assert.match(deals,new RegExp('header\\("'+key+'"'));
 const health=read("components/prototype/crm-account-health.tsx");
 for(const key of ["account","rep","lastOrder","lastPaid","settledCases","nextAction","reviewDate"])
   assert.match(health,new RegExp('header\\("'+key+'"'));
 const map=read("components/prototype/crm-account-map.tsx");
 for(const key of ["account","market","stage","representative","coordinates"])
   assert.match(map,new RegExp('header\\("'+key+'"'));
});

test("customer location, payment statement, activity, document and rep fields are sortable",()=>{
 const hub=read("components/prototype/operations-hub.tsx");
 const customer=hub.slice(hub.indexOf("function CustomerRecord("),hub.indexOf("function matchingLines("));
 for(const k of ["number","location","date","cases","status","payment"])assert.match(customer,new RegExp('transactionHeader\\("'+k+'"'));
 for(const k of ["date","location","reference","type","status","debit","credit"])assert.match(customer,new RegExp('statementHeader\\("'+k+'"'));
 for(const k of ["location","zip","rep","id"])assert.match(customer,new RegExp('locationHeader\\("'+k+'"'));
 const sections=read("components/prototype/crm-customer-record-sections.tsx");
 for(const k of ["title","status","detail"])assert.match(sections,new RegExp('heading\\("'+k+'"'));
 for(const k of ["location","owner","originator","closer","manager"])assert.match(sections,new RegExp('locationHeader\\("'+k+'"'));
 for(const k of ["date","location","from","to","reason"])assert.match(sections,new RegExp('historyHeader\\("'+k+'"'));
});

test("admin data reviews have all data-column controls and remain write-gated",()=>{
 const merge=read("components/prototype/account-consolidation-review.tsx");
 for(const k of ["name","address","rep","parent","orders"])assert.match(merge,new RegExp('reviewHeader\\("'+k+'"'));
 assert.match(merge,/associateCustomerLocations/);
 assert.match(merge,/demoAssociationEnabled/);
 const commissions=read("components/prototype/crm-commission-only-review.tsx");
 for(const k of ["rep","employment","classification","signed","zip","credited","exceptions"])
   assert.match(commissions,new RegExp('heading\\("'+k+'"'));
 assert.match(commissions,/currentUser\?\.role!=="Administrator"/);
 assert.doesNotMatch(commissions,/createDisbursement\(|setRunStatus\(/);
});

test("CRM table headers have a single shared left-alignment rule and responsive overflow",()=>{
 const css=read("app/prototype-navigation.css");
 assert.match(css,/\.prototype-table th,\.prototype-table td\{text-align:left!important/);
 assert.match(css,/\.prototype-table-scroll\{overflow-x:auto\}/);
});
