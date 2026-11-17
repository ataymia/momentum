import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("RC acceptance index lists exactly 98 stable unique product IDs and seven CI IDs",()=>{
 const text=readFileSync(new URL("../docs/RELEASE_CANDIDATE_98_ACCEPTANCE_LEDGER.md",import.meta.url),"utf8");
 const product=[...text.matchAll(/^\|\s*([A-G]\d{2})\s*\|/gm)].map(m=>m[1]);
 const expected=[["A",13],["B",9],["C",25],["D",18],["E",9],["F",14],["G",10]]
   .flatMap(([name,count])=>Array.from({length:count as number},(_,i)=>(name as string)+String(i+1).padStart(2,"0")));
 assert.deepEqual(product,expected);
 assert.equal(new Set(product).size,98);
 const ci=[...text.matchAll(/^\|\s*(FIX-CI-\d{2})\s*\|/gm)].map(m=>m[1]);
 assert.deepEqual(ci,Array.from({length:7},(_,i)=>"FIX-CI-"+String(i+1).padStart(2,"0")));
 assert.match(text,/Unreconciled is not Not Started/);
 assert.match(text,/partial increment NEVER counts as Built/);
 assert.doesNotMatch(text,/\|\s*(?:C01|C02|C03|C04|C05|C06)\s*\|\s*complete\b/i);
});
