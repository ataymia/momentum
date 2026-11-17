import assert from "node:assert/strict";
import test from "node:test";
import {csvDocument,escapeCsvCell} from "../lib/browser-export";

test("spreadsheet formulas are neutralized including leading whitespace and control characters",()=>{
  for(const payload of ["=1+1","+SUM(A1:A2)","-2+3","@SUM(A1)","  =HYPERLINK(1)","\t+cmd","\r\n=1+1","\uFEFF@SUM(1)"]){
    const encoded=escapeCsvCell(payload);
    assert(encoded.startsWith('"\''),JSON.stringify({payload,encoded}));
    assert(encoded.includes(payload.replaceAll('"','""')));
  }
});
test("ordinary customer and inventory data remain intact",()=>{
  assert.equal(escapeCsvCell("Phoenix, AZ"),'"Phoenix, AZ"');
  assert.equal(escapeCsvCell('He said "hello"'),'"He said ""hello"""');
  assert.equal(escapeCsvCell(-12),'"-12"');
  assert.equal(escapeCsvCell(null),'""');
  assert.equal(escapeCsvCell("10-40 cases"),'"10-40 cases"');
});
test("export column allowlist prevents private extra fields from being serialized",()=>{
  const csv=csvDocument([{business:"Shop",status:"Open",privateNotes:"DO NOT EXPORT",bankAccount:"secret"}],["business","status"]);
  assert(csv.startsWith("\uFEFF"));
  assert(csv.includes('"business","status"\r\n"Shop","Open"'));
  assert(!csv.includes("privateNotes"));
  assert(!csv.includes("DO NOT EXPORT"));
  assert(!csv.includes("bankAccount"));
  assert(!csv.includes("secret"));
});
test("CSV retains record boundaries and escapes embedded quotes",()=>{
  const csv=csvDocument([{name:'"North"\r\n=SUM(1)'},{name:"West"}],["name"]);
  assert(csv.includes('"""North""\r\n=SUM(1)"'));
  assert(csv.endsWith('"West"'));
});
