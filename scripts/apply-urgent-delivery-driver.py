from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str, *, already: str | None = None) -> None:
    p = ROOT / path
    s = p.read_text()
    if already and already in s:
        return
    if old not in s:
        raise SystemExit(f"PATCH FAILED: expected text not found in {path}\n--- expected ---\n{old[:500]}")
    p.write_text(s.replace(old, new, 1))
    print(f"patched {path}")


# ---------------------------------------------------------------------------
# Canonical role model
# ---------------------------------------------------------------------------
patch(
    "lib/types.ts",
    '  | "Operations"\n  | "Warehouse"\n  | "Customer";',
    '  | "Operations"\n  | "Warehouse"\n  | "Delivery Driver"\n  | "Customer";',
    already='  | "Delivery Driver"\n',
)

patch(
    "lib/firebase-access.ts",
    'export const EMPLOYEE_ROLES:Role[]=["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse"];\nconst roles=new Set<string>(["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse","Customer"]);',
    'export const EMPLOYEE_ROLES:Role[]=["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse","Delivery Driver"];\nconst roles=new Set<string>(["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse","Delivery Driver","Customer"]);',
    already='"Warehouse","Delivery Driver"]',
)

patch(
    "lib/workspace-normalization.ts",
    'const roles = new Set(["Administrator", "Sales Manager", "Sales Representative", "Brand Ambassador", "Operations", "Warehouse", "Customer"]);',
    'const roles = new Set(["Administrator", "Sales Manager", "Sales Representative", "Brand Ambassador", "Operations", "Warehouse", "Delivery Driver", "Customer"]);',
    already='"Warehouse", "Delivery Driver", "Customer"',
)

patch(
    "lib/provisioning-contract.ts",
    'export const PROVISIONABLE_ROLES = ["Sales Manager", "Sales Representative", "Brand Ambassador", "Operations", "Warehouse"] as const;',
    'export const PROVISIONABLE_ROLES = ["Sales Manager", "Sales Representative", "Brand Ambassador", "Operations", "Warehouse", "Delivery Driver"] as const;',
    already='"Warehouse", "Delivery Driver"] as const',
)
patch(
    "lib/provisioning-contract.ts",
    '  Operations: "Operations",\n  Warehouse: "Operations",\n};',
    '  Operations: "Operations",\n  Warehouse: "Operations",\n  "Delivery Driver": "Operations",\n};',
    already='  "Delivery Driver": "Operations",\n};',
)

patch(
    "lib/workspace-user-provisioning.ts",
    '  Operations: "Operations",\n  Warehouse: "Operations",\n};',
    '  Operations: "Operations",\n  Warehouse: "Operations",\n  "Delivery Driver": "Operations",\n};',
    already='  "Delivery Driver": "Operations",\n};',
)
patch(
    "lib/workspace-user-provisioning.ts",
    '  if (["Operations", "Warehouse"].includes(input.role) && manager.role !== "Administrator") return `${input.role} must report to an Administrator until an operations-manager role is formally configured.`;',
    '  if (["Operations", "Warehouse"].includes(input.role) && manager.role !== "Administrator") return `${input.role} must report to an Administrator until an operations-manager role is formally configured.`;\n  if (input.role === "Delivery Driver" && !["Administrator", "Operations"].includes(manager.role)) return "A Delivery Driver must report to an Administrator or Operations user.";',
    already='input.role === "Delivery Driver"',
)
patch(
    "lib/workspace-user-provisioning.ts",
    '  if (role === "Sales Representative") return data.users.filter((user) => ["Administrator", "Sales Manager"].includes(user.role));\n  return data.users.filter((user) => user.role === "Administrator");',
    '  if (role === "Sales Representative") return data.users.filter((user) => ["Administrator", "Sales Manager"].includes(user.role));\n  if (role === "Delivery Driver") return data.users.filter((user) => ["Administrator", "Operations"].includes(user.role));\n  return data.users.filter((user) => user.role === "Administrator");',
    already='role === "Delivery Driver"',
)

patch(
    "lib/identity-provisioning.ts",
    'const validRoles = new Set<ProvisionableRole>(["Sales Manager", "Sales Representative", "Brand Ambassador", "Operations", "Warehouse"]);',
    'const validRoles = new Set<ProvisionableRole>(["Sales Manager", "Sales Representative", "Brand Ambassador", "Operations", "Warehouse", "Delivery Driver"]);',
    already='"Warehouse", "Delivery Driver"]',
)
patch(
    "lib/identity-provisioning.ts",
    '    if (["Operations", "Warehouse"].includes(draft.role) && manager.role !== "Administrator") return false;',
    '    if (["Operations", "Warehouse"].includes(draft.role) && manager.role !== "Administrator") return false;\n    if (draft.role === "Delivery Driver" && !["Administrator", "Operations"].includes(manager.role)) return false;',
    already='draft.role === "Delivery Driver"',
)

patch(
    "lib/training-library-engine.ts",
    'const validRoles = new Set<Role>(["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse","Customer"]);',
    'const validRoles = new Set<Role>(["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse","Delivery Driver","Customer"]);',
    already='"Warehouse","Delivery Driver","Customer"',
)

patch(
    "components/hcm/new-hire-provisioning.tsx",
    'const roleOptions: ProvisionableRole[] = ["Sales Representative", "Sales Manager", "Brand Ambassador", "Operations", "Warehouse"];\nconst defaultTitles = new Set<string>(["Sales Representative", "Sales Manager", "Brand Ambassador", "Operations", "Warehouse"]);',
    'const roleOptions: ProvisionableRole[] = ["Sales Representative", "Sales Manager", "Brand Ambassador", "Operations", "Warehouse", "Delivery Driver"];\nconst defaultTitles = new Set<string>(["Sales Representative", "Sales Manager", "Brand Ambassador", "Operations", "Warehouse", "Delivery Driver"]);',
    already='"Warehouse", "Delivery Driver"]',
)

patch(
    "functions/src/index.ts",
    '  "Operations": "Operations",\n  "Warehouse": "Operations",\n};',
    '  "Operations": "Operations",\n  "Warehouse": "Operations",\n  "Delivery Driver": "Operations",\n};',
    already='  "Delivery Driver": "Operations",\n};',
)

# ---------------------------------------------------------------------------
# Role-aware UI/data scope. Delivery drivers get processed orders, inventory,
# their own timekeeping, the employee directory via Firebase, and help.
# ---------------------------------------------------------------------------
patch(
    "lib/access.ts",
    '  Warehouse: ["home","work","actions","orders","inventory","inventoryLedger","products","people","employees","timekeeping","materials","payroll","help"],\n  Customer: ["home","accounts","orders","help"],',
    '  Warehouse: ["home","work","actions","orders","inventory","inventoryLedger","products","people","employees","timekeeping","materials","payroll","help"],\n  "Delivery Driver": ["home","orders","inventory","inventoryLedger","people","employees","timekeeping","materials","help"],\n  Customer: ["home","accounts","orders","help"],',
    already='  "Delivery Driver": ["home","orders"',
)
patch(
    "lib/access.ts",
    'export const canAdvanceFulfillment = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Operations"].includes(user.role));',
    'export const canAdvanceFulfillment = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Operations","Delivery Driver"].includes(user.role));',
    already='["Administrator","Operations","Delivery Driver"]',
)
patch(
    "lib/access.ts",
    '  if (["Administrator","Operations","Warehouse"].includes(user.role)) return true;\n  if (user.role === "Customer") return (user.accountIds ?? []).includes(account.id);',
    '  if (["Administrator","Operations","Warehouse"].includes(user.role)) return true;\n  if (user.role === "Delivery Driver") return data.orders.some((order) => order.accountId === account.id && ["Approved","Allocated","Out for delivery","Delivered","Paid"].includes(order.status));\n  if (user.role === "Customer") return (user.accountIds ?? []).includes(account.id);',
    already='user.role === "Delivery Driver") return data.orders.some',
)
patch(
    "lib/access.ts",
    '  const orders = ["Administrator","Operations","Warehouse"].includes(user.role) ? data.orders : data.orders.filter(order => accountIds.has(order.accountId));',
    '  const orders = ["Administrator","Operations","Warehouse"].includes(user.role) ? data.orders : user.role === "Delivery Driver" ? data.orders.filter((order) => ["Approved","Allocated","Out for delivery","Delivered","Paid"].includes(order.status)) : data.orders.filter(order => accountIds.has(order.accountId));',
    already='user.role === "Delivery Driver" ? data.orders.filter',
)
patch(
    "lib/access.ts",
    '  const placements = ["Customer","Operations","Warehouse","Brand Ambassador"].includes(user.role) ? [] : user.role === "Administrator" ? data.placements : data.placements.filter(item => accountIds.has(item.accountId));',
    '  const placements = ["Customer","Operations","Warehouse","Brand Ambassador","Delivery Driver"].includes(user.role) ? [] : user.role === "Administrator" ? data.placements : data.placements.filter(item => accountIds.has(item.accountId));',
    already='"Brand Ambassador","Delivery Driver"',
)
patch(
    "lib/access.ts",
    '  const timecards = user.role === "Administrator" ? data.timecards : user.role === "Sales Manager" ? data.timecards.filter(card => card.userId === user.id || managedIds.has(card.userId)) : data.timecards.filter(card => card.userId === user.id);\n  const timecardUserIds = new Set(timecards.map(card => card.userId));',
    '  const visibleTimeUserIds = user.role === "Administrator" ? new Set(data.users.filter((candidate) => candidate.role !== "Customer").map((candidate) => candidate.id)) : user.role === "Sales Manager" ? managedIds : new Set([user.id]);\n  const timecards = data.timecards.filter((card) => visibleTimeUserIds.has(card.userId));',
    already='const visibleTimeUserIds =',
)
patch(
    "lib/access.ts",
    '    inventory: ["Administrator","Operations","Warehouse"].includes(user.role) ? data.inventory : [],\n    approvals,\n    timeEntries: data.timeEntries.filter(item => timecardUserIds.has(item.userId)),',
    '    inventory: ["Administrator","Operations","Warehouse","Delivery Driver"].includes(user.role) ? data.inventory : [],\n    approvals,\n    timeEntries: data.timeEntries.filter(item => visibleTimeUserIds.has(item.userId)),',
    already='"Warehouse","Delivery Driver"].includes(user.role) ? data.inventory',
)
patch(
    "lib/access.ts",
    '  const activities = user.role === "Operations"\n    ? data.activities.filter(item => item.type === "order" || (item.type === "visit" && appointments.some(appointment => appointment.accountId === item.accountId)))\n    : user.role === "Warehouse"',
    '  const activities = user.role === "Operations"\n    ? data.activities.filter(item => item.type === "order" || (item.type === "visit" && appointments.some(appointment => appointment.accountId === item.accountId)))\n    : user.role === "Delivery Driver"\n      ? data.activities.filter((item) => item.type === "order")\n    : user.role === "Warehouse"',
    already='user.role === "Delivery Driver"\n      ? data.activities.filter',
)

# ---------------------------------------------------------------------------
# Firestore domain model. No infrastructure is deployed by this script; it
# only updates the source that `npm run rules:build` uses.
# ---------------------------------------------------------------------------
patch(
    "lib/firestore-domains.ts",
    'const OPERATIONAL:Role[]=["Administrator","Sales Manager","Sales Representative","Operations","Warehouse"];',
    'const OPERATIONAL:Role[]=["Administrator","Sales Manager","Sales Representative","Operations","Warehouse"];\nconst DELIVERY_READ:Role[]=["Administrator","Operations","Warehouse","Delivery Driver"];\nconst DELIVERY_WRITE:Role[]=["Administrator","Operations","Delivery Driver"];\nconst DELIVERY_LEDGER_WRITE:Role[]=["Administrator","Operations","Warehouse","Delivery Driver"];',
    already='const DELIVERY_READ:Role[]=',
)
patch(
    "lib/firestore-domains.ts",
    '{key:"momentum-demo-workspace-v5",id:"workspace",read:OPERATIONAL,write:OPERATIONAL,omit:["users"],fields:{customers:{},accounts:{},activities:{},appointments:{},orders:{},placements:{},inventory:{},approvals:{},notifications:{},bulletins:{},territories:{},timeEntries:perUser(),timecards:perUser()}},',
    '{key:"momentum-demo-workspace-v5",id:"workspace",read:OPERATIONAL,write:OPERATIONAL,omit:["users"],fields:{customers:{},accounts:{read:[...OPERATIONAL,"Delivery Driver"]},activities:{},appointments:{},orders:{read:[...OPERATIONAL,"Delivery Driver"],write:[...OPERATIONAL,"Delivery Driver"]},placements:{},inventory:{read:[...OPERATIONAL,"Delivery Driver"]},approvals:{},notifications:{},bulletins:{},territories:{},timeEntries:perUser("userId",{read:"hasAccess",write:"activeEmployee"}),timecards:perUser("userId",{read:"hasAccess",write:"activeEmployee"})}},',
    already='accounts:{read:[...OPERATIONAL,"Delivery Driver"]}',
)
patch(
    "lib/firestore-domains.ts",
    '{key:"momentum-commercial-controls-v1",id:"commercial",read:OPERATIONAL,write:OPERATIONAL,fields:{orders:{},appointments:{},approvals:{},activities:{},inventoryLots:{},territories:{}}},',
    '{key:"momentum-commercial-controls-v1",id:"commercial",read:OPERATIONAL,write:OPERATIONAL,fields:{orders:{read:[...OPERATIONAL,"Delivery Driver"],write:[...OPERATIONAL,"Delivery Driver"]},appointments:{},approvals:{},activities:{},inventoryLots:{read:[...OPERATIONAL,"Delivery Driver"]},territories:{}}},',
    already='orders:{read:[...OPERATIONAL,"Delivery Driver"]',
)
patch(
    "lib/firestore-domains.ts",
    '{key:"momentum-inventory-ledger-v1",id:"inventoryLedger",read:OPERATIONAL,write:OPERATIONS,fields:{nodes:{},movements:{},reservations:{},counts:{}}},',
    '{key:"momentum-inventory-ledger-v1",id:"inventoryLedger",read:OPERATIONAL,write:OPERATIONS,fields:{nodes:{read:[...OPERATIONAL,"Delivery Driver"]},movements:{read:[...OPERATIONAL,"Delivery Driver"],write:DELIVERY_LEDGER_WRITE},reservations:{read:[...OPERATIONAL,"Delivery Driver"],write:DELIVERY_LEDGER_WRITE},counts:{read:[...OPERATIONAL,"Delivery Driver"]}}},\n  {key:"momentum-delivery-v1",id:"delivery",read:DELIVERY_READ,write:DELIVERY_WRITE,fields:{tasks:{}}},',
    already='key:"momentum-delivery-v1"',
)

# ---------------------------------------------------------------------------
# Inventory custody transitions for delivery drivers. General inventory
# adjustments remain restricted to the existing inventory roles.
# ---------------------------------------------------------------------------
patch(
    "lib/inventory-ledger-context-v2.tsx",
    'type InventoryLedgerContextValue={ledger:InventoryLedgerState;postMovement:(input:{lotId:string;quantity:number;type:MovementType;fromNodeId?:string;toNodeId?:string;relatedOrderId?:string;reason:string})=>string|null;reserve:(orderId:string,lotId:string,quantity:number)=>string|null;releaseReservation:(id:string)=>boolean;fulfillReservation:(id:string)=>boolean;advanceOrderFulfillment:(orderId:string,status:FulfillmentStatus)=>boolean;resolveQualityHold:(lotId:string,decision:"Release"|"Retain",reason:string)=>boolean;recordCount:(nodeId:string,lotId:string,countedQty:number)=>string|null;reconcileCount:(id:string,reason:string)=>boolean;resetLedger:()=>void};',
    'type InventoryLedgerContextValue={ledger:InventoryLedgerState;postMovement:(input:{lotId:string;quantity:number;type:MovementType;fromNodeId?:string;toNodeId?:string;relatedOrderId?:string;reason:string})=>string|null;reserve:(orderId:string,lotId:string,quantity:number)=>string|null;releaseReservation:(id:string)=>boolean;fulfillReservation:(id:string)=>boolean;advanceOrderFulfillment:(orderId:string,status:FulfillmentStatus)=>boolean;loadOrderForDelivery:(orderId:string,driverId:string)=>boolean;startOrderDelivery:(orderId:string,driverId:string)=>boolean;completeOrderDelivery:(orderId:string,driverId:string)=>boolean;resolveQualityHold:(lotId:string,decision:"Release"|"Retain",reason:string)=>boolean;recordCount:(nodeId:string,lotId:string,countedQty:number)=>string|null;reconcileCount:(id:string,reason:string)=>boolean;resetLedger:()=>void};',
    already='loadOrderForDelivery:(orderId:string,driverId:string)=>boolean',
)
patch(
    "lib/inventory-ledger-context-v2.tsx",
    '  const advanceOrderFulfillment=(orderId:string,status:FulfillmentStatus)=>{if(!inventoryManager||locked())return false;',
    '''  const deliveryActor=(driverId:string)=>Boolean(currentUser&&((currentUser.role==="Delivery Driver"&&currentUser.id===driverId)||["Administrator","Operations","Warehouse"].includes(currentUser.role)));
  const activeByLot=(orderId:string)=>{const grouped=new Map<string,number>();for(const reservation of ledger.reservations.filter((item)=>item.orderId===orderId&&item.status==="Active"))grouped.set(reservation.lotId,(grouped.get(reservation.lotId)??0)+reservation.quantity);return grouped;};
  const loadOrderForDelivery=(orderId:string,driverId:string)=>{if(!deliveryActor(driverId)||locked())return false;const order=data.orders.find((item)=>item.id===orderId);const driver=data.users.find((item)=>item.id===driverId&&item.role==="Delivery Driver");const driverNodeId=`node-user-${driverId}`;if(!order||order.status!=="Allocated"||!driver||!ledger.nodes.some((node)=>node.id===driverNodeId))return false;const grouped=activeByLot(orderId);const total=[...grouped.values()].reduce((sum,value)=>sum+value,0);if(total<order.cases)return false;const movements:InventoryMovement[]=[];for(const[lotId,reserved]of grouped){const already=orderLotWarehouseNetOutbound(ledger,orderId,lotId);const quantity=Math.max(0,reserved-already);if(quantity===0)continue;const lot=data.inventory.find((item)=>item.id===lotId);if(!lot||!movementCanPost(ledger,{lotId,quantity,type:"Transfer",fromNodeId:warehouseNodeId,toNodeId:driverNodeId,relatedOrderId:orderId}))return false;movements.push({id:uid("movement-load"),lotId,product:lot.product,quantity,type:"Transfer",fromNodeId:warehouseNodeId,toNodeId:driverNodeId,relatedOrderId:orderId,reason:`Loaded for delivery by ${driver.name}`,at:now(),actorId:currentUser!.id});}if(orderOutboundQuantity(ledger,orderId)+movements.reduce((sum,item)=>sum+item.quantity,0)<order.cases)return false;if(movements.length)setLedger((state)=>({...state,movements:[...movements,...state.movements]}));return true;};
  const startOrderDelivery=(orderId:string,driverId:string)=>{if(!deliveryActor(driverId)||locked())return false;const order=data.orders.find((item)=>item.id===orderId);if(!order||order.status!=="Allocated"||orderOutboundQuantity(ledger,orderId)<order.cases)return false;setOrderStatus(orderId,"Out for delivery");return true;};
  const completeOrderDelivery=(orderId:string,driverId:string)=>{if(!deliveryActor(driverId)||locked())return false;const order=data.orders.find((item)=>item.id===orderId);const driverNodeId=`node-user-${driverId}`;const customerNodeId=`node-account-${order?.accountId??""}`;if(!order||order.status!=="Out for delivery"||!ledger.nodes.some((node)=>node.id===driverNodeId)||!ledger.nodes.some((node)=>node.id===customerNodeId))return false;const grouped=activeByLot(orderId);const movements:InventoryMovement[]=[];for(const[lotId,reserved]of grouped){const delivered=ledger.movements.filter((movement)=>movement.relatedOrderId===orderId&&movement.lotId===lotId&&movement.type==="Delivery").reduce((sum,movement)=>sum+movement.quantity,0);const quantity=Math.max(0,reserved-delivered);if(quantity===0)continue;const lot=data.inventory.find((item)=>item.id===lotId);if(!lot||!movementCanPost(ledger,{lotId,quantity,type:"Delivery",fromNodeId:driverNodeId,toNodeId:customerNodeId,relatedOrderId:orderId}))return false;movements.push({id:uid("movement-delivery"),lotId,product:lot.product,quantity,type:"Delivery",fromNodeId:driverNodeId,toNodeId:customerNodeId,relatedOrderId:orderId,reason:"Delivered to customer",at:now(),actorId:currentUser!.id});}if(orderDeliveryQuantity(ledger,orderId)+movements.reduce((sum,item)=>sum+item.quantity,0)<order.cases)return false;const fulfilledAt=now();setLedger((state)=>({...state,movements:[...movements,...state.movements],reservations:state.reservations.map((item)=>item.orderId===orderId&&item.status==="Active"?{...item,status:"Fulfilled",fulfilledAt}:item)}));setOrderStatus(orderId,"Delivered");return true;};
  const advanceOrderFulfillment=(orderId:string,status:FulfillmentStatus)=>{if(!inventoryManager||locked())return false;''',
    already='const loadOrderForDelivery=',
)
patch(
    "lib/inventory-ledger-context-v2.tsx",
    'return <InventoryLedgerContext.Provider value={{ledger,postMovement,reserve,releaseReservation,fulfillReservation,advanceOrderFulfillment,resolveQualityHold,recordCount,reconcileCount,resetLedger}}>{children}</InventoryLedgerContext.Provider>;',
    'return <InventoryLedgerContext.Provider value={{ledger,postMovement,reserve,releaseReservation,fulfillReservation,advanceOrderFulfillment,loadOrderForDelivery,startOrderDelivery,completeOrderDelivery,resolveQualityHold,recordCount,reconcileCount,resetLedger}}>{children}</InventoryLedgerContext.Provider>;',
    already='advanceOrderFulfillment,loadOrderForDelivery,startOrderDelivery,completeOrderDelivery',
)

# ---------------------------------------------------------------------------
# Clock-in reliability: a punch creates the current weekly timecard if needed,
# and production writes are flushed immediately rather than waiting on the
# background debounce.
# ---------------------------------------------------------------------------
patch(
    "lib/workspace-context-v5.tsx",
    '  useEffect(() => {\n    if (ready) momentumStorage.setItem(DATA_KEY, JSON.stringify(data));\n  }, [data, ready]);',
    '  useEffect(() => {\n    if (ready) {\n      momentumStorage.setItem(DATA_KEY, JSON.stringify(data));\n      void momentumStorage.flush();\n    }\n  }, [data, ready]);',
    already='void momentumStorage.flush();\n    }\n  }, [data, ready]);',
)
patch(
    "lib/workspace-context-v5.tsx",
    '''  const toggleClock = useCallback(() => {
    if (!currentUser || currentUser.role === "Customer") return;
    setData((current) => {
      const active = current.timeEntries.find((item) => item.userId === currentUser.id && !item.clockOut);
      if (active?.mealStart && !active.mealEnd) return current;
      return active ? { ...current, timeEntries: current.timeEntries.map((item) => item.id === active.id ? { ...item, clockOut: localTime() } : item) } : { ...current, timeEntries: [{ id: `te-${Date.now()}`, userId: currentUser.id, date: todayKey(), clockIn: localTime(), breakMinutes: 0, source: "Demo desktop" }, ...current.timeEntries] };
    });
  }, [currentUser]);''',
    '''  const toggleClock = useCallback(() => {
    if (!currentUser || currentUser.role === "Customer") return;
    setData((current) => {
      const active = current.timeEntries.find((item) => item.userId === currentUser.id && !item.clockOut);
      if (active?.mealStart && !active.mealEnd) return current;
      const date = todayKey();
      const weekStart = startOfLocalWeek(date);
      const weekEnd = addCalendarDays(weekStart, 6);
      const hasTimecard = current.timecards.some((card) => card.userId === currentUser.id && card.weekStart === weekStart && card.weekEnd === weekEnd);
      const timecards = hasTimecard ? current.timecards : [{ id: `tc-${currentUser.id}-${weekStart}`, userId: currentUser.id, weekStart, weekEnd, status: "Open" as const, attested: false }, ...current.timecards];
      const timeEntries = active
        ? current.timeEntries.map((item) => item.id === active.id ? { ...item, clockOut: localTime() } : item)
        : [{ id: `te-${Date.now()}`, userId: currentUser.id, date, clockIn: localTime(), breakMinutes: 0, source: "Demo desktop" as const }, ...current.timeEntries];
      return { ...current, timeEntries, timecards };
    });
  }, [currentUser]);''',
    already='const hasTimecard = current.timecards.some',
)

patch(
    "lib/workspace-context.tsx",
    '  useEffect(() => {\n    if (typeof window !== "undefined") momentumStorage.setItem(COMMERCIAL_KEY, JSON.stringify(commercial));\n  }, [commercial]);',
    '  useEffect(() => {\n    if (typeof window !== "undefined") {\n      momentumStorage.setItem(COMMERCIAL_KEY, JSON.stringify(commercial));\n      void momentumStorage.flush();\n    }\n  }, [commercial]);',
    already='momentumStorage.setItem(COMMERCIAL_KEY, JSON.stringify(commercial));\n      void momentumStorage.flush();',
)

# ---------------------------------------------------------------------------
# Cross-session order safety. A dependent account/order document may arrive a
# few hundred milliseconds later than the record that references it. Do not
# delete a legitimate record merely because another Firestore shard is late.
# ---------------------------------------------------------------------------
patch(
    "lib/commercial-state.ts",
    '  if (!object(input) || input.version !== 1) return seed;',
    '  if (!object(input) || (input.version !== undefined && input.version !== 1)) return seed;',
    already='input.version !== undefined && input.version !== 1',
)
patch(
    "lib/commercial-state.ts",
    '    if (!id || baseOrderIds.has(id) || !text(raw.number) || !accountIds.has(accountId) || !owner ||',
    '    if (!id || baseOrderIds.has(id) || !text(raw.number) || !accountId || !owner ||',
    already='!text(raw.number) || !accountId || !owner ||',
)
patch(
    "lib/commercial-state.ts",
    '    const sourcePlacementId = optionalText(raw.sourcePlacementId); const placement = sourcePlacementId ? placementById.get(sourcePlacementId) : undefined;\n    if (sourcePlacementId && (!placement || placement.accountId !== accountId || placement.product !== product)) return [];',
    '    const sourcePlacementId = optionalText(raw.sourcePlacementId);',
    already='const sourcePlacementId = optionalText(raw.sourcePlacementId);\n    const settlementEvidence',
)
patch(
    "lib/commercial-state.ts",
    '    if (!id || baseAppointmentIds.has(id) || !accountIds.has(accountId) || (ownerId && !internalSalesIds.has(ownerId)) ||',
    '    if (!id || baseAppointmentIds.has(id) || !accountId || (ownerId && !internalSalesIds.has(ownerId)) ||',
    already='baseAppointmentIds.has(id) || !accountId ||',
)
patch(
    "lib/commercial-state.ts",
    '    const account = data.accounts.find((item) => item.id === accountId)!;\n    return [{ ...raw, id, accountId, ownerId, customerId: account.customerId,',
    '    const account = data.accounts.find((item) => item.id === accountId);\n    return [{ ...raw, id, accountId, ownerId, customerId: account?.customerId ?? optionalText(raw.customerId),',
    already='customerId: account?.customerId ?? optionalText(raw.customerId)',
)
patch(
    "lib/commercial-state.ts",
    '    const linkedRecordValid = type === "Territory exception" ? Boolean(recordId && accountIds.has(recordId)) : Boolean(recordId && orderIds.has(recordId));',
    '    const linkedRecordValid = Boolean(recordId);',
    already='const linkedRecordValid = Boolean(recordId);',
)
patch(
    "lib/commercial-state.ts",
    '    if (!id || baseActivityIds.has(id) || (accountId && !accountIds.has(accountId)) || !activityTypes.has(type) ||',
    '    if (!id || baseActivityIds.has(id) || !activityTypes.has(type) ||',
    already='baseActivityIds.has(id) || !activityTypes.has(type)',
)

patch(
    "lib/workspace-normalization.ts",
    '    if (!id || !text(value.number) || !accountIds.has(accountId) || !owner ||',
    '    if (!id || !text(value.number) || !accountId || !owner ||',
    already='!text(value.number) || !accountId || !owner ||',
)
patch(
    "lib/workspace-normalization.ts",
    '    if (sourcePlacementId && !placementIds.has(sourcePlacementId)) return [];\n',
    '',
    already='const inventory = uniqueById',
)
patch(
    "lib/workspace-normalization.ts",
    '    if (!id || !accountIds.has(accountId) || !text(value.product) ||',
    '    if (!id || !accountId || !text(value.product) ||',
    already='if (!id || !accountId || !text(value.product)',
)
patch(
    "lib/workspace-normalization.ts",
    '    if (!id || !accountIds.has(accountId) || (ownerId && !internalUserIds.has(ownerId)) ||',
    '    if (!id || !accountId || (ownerId && !internalUserIds.has(ownerId)) ||',
    already='if (!id || !accountId || (ownerId && !internalUserIds.has(ownerId))',
)
patch(
    "lib/workspace-normalization.ts",
    '    const account = accounts.find((item) => item.id === accountId)!;\n    return [{ ...value, id, accountId, ownerId, customerId: account.customerId,',
    '    const account = accounts.find((item) => item.id === accountId);\n    return [{ ...value, id, accountId, ownerId, customerId: account?.customerId ?? optionalText(value.customerId),',
    already='customerId: account?.customerId ?? optionalText(value.customerId)',
)
patch(
    "lib/workspace-normalization.ts",
    '    if (!id || (accountId && !accountIds.has(accountId)) || !activityTypes.has(type) ||',
    '    if (!id || !activityTypes.has(type) ||',
    already='if (!id || !activityTypes.has(type)',
)
patch(
    "lib/workspace-normalization.ts",
    '    if (recordId && ["Order", "Low stock sale", "Price exception"].includes(type) && !orderIds.has(recordId)) return [];\n    if (recordId && type === "Territory exception" && !accountIds.has(recordId)) return [];\n    if (recordId && type === "Timecard" && !timecardIds.has(recordId)) return [];\n    if (recordId && type === "Inventory adjustment" && !inventoryIds.has(recordId)) return [];\n',
    '',
    already='return [{ id, type: type as Approval["type"]',
)

print("PASS: urgent delivery-driver, clock, and order-sync source patch applied.")
print("NEXT: npm run rules:build, then lint/build/tests before any deployment.")
