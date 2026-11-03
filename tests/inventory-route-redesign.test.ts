import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  canVisitRoute,permissionForPath,requiresPrototypePage,
  routeLabel,pageForPath,
} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
import {
  createInventoryLedgerSeed,warehouseAvailable,nodeLotBalance,warehouseNodeId,
  type InventoryLedgerState,
} from "../lib/inventory-ledger";
import type {WorkspaceData} from "../lib/types";

const user=(role:WorkspaceUser["role"]):WorkspaceUser=>({
  id:"demo-"+role,name:"Example",firstName:"Example",email:"example@example.invalid",
  initials:"EX",role,team:"Operations",title:"Example",accent:"#000",
});
test("inventory lots and ledger are separate routes restricted by module permission",()=>{
  for(const route of ["/inventory","/inventory/ledger","/inventory/adjustments","/inventory/lots/lot-safe"]){
    assert(requiresPrototypePage(route),route);
    assert(canVisitRoute(user("Administrator"),route),route);
    assert(!canVisitRoute(user("Customer"),route),route);
    assert(!canVisitRoute(user("Marketing"),route),route);
  }
  assert.equal(permissionForPath("/inventory/lots/lot-safe"),"inventory");
  assert.equal(routeLabel("/inventory/lots/lot-safe"),"Lot details");
});
test("existing stock operations remain addressable without being incorrectly rendered as a detail record",()=>{
  assert.equal(pageForPath("/inventory/workflow"),"inventory");
  assert.equal(requiresPrototypePage("/inventory/workflow"),false);
  assert(canVisitRoute(user("Warehouse"),"/inventory/workflow"));
});
test("warehouse stock is calculated from movements and reservations rather than catalog quantity",()=>{
  const data={
    users:[],accounts:[],orders:[],inventory:[{
      id:"lot-a",lotCode:"LOT-A",product:"Golden Eagle",onHand:12,reserved:0,available:12,
      receivedAt:"2026-10-01",bestBy:"2027-06-01",location:"Phoenix",status:"Available",
    }],
  } as unknown as WorkspaceData;
  const seed=createInventoryLedgerSeed(data);
  assert.equal(nodeLotBalance(seed,warehouseNodeId,"lot-a"),12);
  assert.equal(warehouseAvailable(seed,"lot-a"),12);
  const withReservation:InventoryLedgerState={...seed,reservations:[{
    id:"reserve-a",orderId:"order-a",lotId:"lot-a",quantity:5,
    status:"Active",createdAt:"2026-10-03T12:00:00Z",createdBy:"demo",
  }]};
  assert.equal(warehouseAvailable(withReservation,"lot-a"),7);
});
test("read-only inventory pages do not mutate or invent stock movements",()=>{
  const source=readFileSync("components/prototype/inventory-experience.tsx","utf8");
  assert.match(source,/warehouseAvailable\(ledger,lot\.id\)/);
  assert.match(source,/nodeLotBalance\(ledger,warehouseNodeId,lot\.id\)/);
  assert.match(source,/ledger\.movements/);
  assert.doesNotMatch(source,/\bpostMovement\(/);
  assert.doesNotMatch(source,/\brecordCount\(/);
  assert.doesNotMatch(source,/\bresolveQualityHold\(/);
});
