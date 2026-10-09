import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const read=(p:string)=>readFileSync(p,"utf8");

test("sign in includes only Momentum Distribution on navy with no redundant subtitle",()=>{
 const login=read("components/login-screen.tsx");
 const gate=read("components/firebase-gate.tsx");
 assert.ok(login.includes('<div className="login-hero__wordmark"><strong>Momentum Distribution</strong></div>'));
 for(const text of ["Arizona distribution workspace","<span>Golden Eagle Energy Drink</span>","Authorized access only","{subtitle}","subtitle?:","Both identify the same Momentum account."])
   assert.ok(!login.includes(text),text);
 assert.ok(!gate.includes("Both open the same Momentum account."));
 assert.ok(login.includes("Username or work email"));
 assert.ok(login.includes("Forgot password?"));
 assert.ok(login.includes("Forgot username?"));
});
test("high-traffic pages do not overexplain simple controls",()=>{
 for(const [path,phrase] of [
 ["components/pages/dashboard.tsx","with no access to internal company records"],
 ["components/pages/deliveries.tsx","Each card shows the essentials"],
 ["components/pages/orders-v3.tsx","Click any order to open the complete"],
 ["components/pages/marketing.tsx","live in one auditable marketing system"],
 ["components/pages/help.tsx","A role-aware guide to the screens"],
 ["components/pages/settings-v3.tsx","Operational truth should fail loudly"],
 ])assert.ok(!read(path).includes(phrase),`${path}: ${phrase}`);
});
