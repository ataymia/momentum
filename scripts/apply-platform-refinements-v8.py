from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def replace_once(path,old,new):
    p=ROOT/path;text=p.read_text();count=text.count(old)
    if count!=1:raise SystemExit(f"V8 PATCH FAILED {path}: {count} matches for {old[:140]!r}")
    p.write_text(text.replace(old,new,1));print(f"v8 patched {path}")

def append_once(path,marker,addition):
    p=ROOT/path;text=p.read_text()
    if marker in text:return
    p.write_text(text.rstrip()+"\n\n"+addition.rstrip()+"\n");print(f"v8 patched {path}")

replace_once("lib/sales-field-engine.ts",'''  const commercialDates = data.orders
    .filter((order) => order.accountId === account.id && (order.paymentStatus === "Paid" || ["Delivered", "Paid"].includes(order.status)))
    .map((order) => arizonaDateKey(order.paidAt ?? order.placedAt));''','''  const commercialDates = data.orders
    .filter((order) => order.accountId === account.id && (order.paymentStatus === "Paid" || ["Delivered", "Paid"].includes(order.status)))
    .map((order) => { const value=order.paidAt ?? order.placedAt; return value.length===10?value:arizonaDateKey(value); });''')
replace_once("lib/sales-field-engine.ts",'''  const weekStart=startOfLocalWeek(asOf);const weekEnd=addCalendarDays(weekStart,6);const inWeek=(value:string|undefined)=>{if(!value)return false;const date=arizonaDateKey(value);return date>=weekStart&&date<=weekEnd;};''','''  const weekStart=startOfLocalWeek(asOf);const weekEnd=addCalendarDays(weekStart,6);const inWeek=(value:string|undefined)=>{if(!value)return false;const date=value.length===10?value:arizonaDateKey(value);return date>=weekStart&&date<=weekEnd;};''')
append_once("tests/platform-integrity.test.ts","date-only Sunday stays in its Arizona business week",'''test("date-only Sunday stays in its Arizona business week",()=>{
  const account={id:"acc-sun",name:"Sunday Shop",location:"Phoenix",channel:"Retail",stage:"Prospect" as const,ownerId:REP,contactName:"Owner",contactRole:"Owner",phone:"1",email:"x@y.com",lastActivity:"",nextAction:"",nextActionDate:"2026-09-27",health:"New" as const,lifetimeCases:0,reorderCount:0,notes:""};
  const sunday:Order={id:"sun-order",number:"GE-SUN",accountId:account.id,cases:10,pricePerCase:24,amount:240,status:"Awaiting approval",placedAt:"2026-09-27",ownerId:REP,creditedRepId:REP,priceBasis:"Tier A",paymentStatus:"Not invoiced"};
  const weekly:WorkspaceData={...data,accounts:[account],orders:[sunday]};
  const summary=weeklySalesManagementSummary(weekly,[],REP,"2026-09-27");assert.equal(summary.weekStart,"2026-09-21");assert.equal(summary.weekEnd,"2026-09-27");assert.equal(summary.orders,1);
});''')
print("PASS: platform refinements v8 applied")
