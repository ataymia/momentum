/* eslint-disable max-len, comma-spacing, key-spacing, keyword-spacing, curly, one-var */
type BusinessRecord = Record<string, unknown>;
type SourceEntry = {lotId: string; fromNodeId: string; quantity: number};

const txt = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * A stock movement must not consume stock reserved for another order.
 * Nonwarehouse sources additionally require proof of custody for this order.
 * Pure so it can be tested independently of Firebase.
 * @param {BusinessRecord[]} movements Recorded stock movements.
 * @param {BusinessRecord[]} reservations Stock reservations.
 * @param {SourceEntry} entry Proposed delivery lot and source.
 * @param {string} sourceType Type of the custody source.
 * @param {string} orderId Order being completed.
 * @return {boolean} True if this order can safely consume these cases.
 */
export function overrideSourceAvailable(
  movements: BusinessRecord[],
  reservations: BusinessRecord[],
  entry: SourceEntry,
  sourceType: string,
  orderId: string,
): boolean {
  const matching = movements.filter((row) => txt(row.lotId) === entry.lotId);
  const onHand = matching.reduce((sum, row) => {
    const quantity = number(row.quantity);
    return sum +
      (txt(row.toNodeId) === entry.fromNodeId ? quantity : 0) -
      (txt(row.fromNodeId) === entry.fromNodeId ? quantity : 0);
  }, 0);
  if (onHand + 0.0001 < entry.quantity) return false;

  if (sourceType === "Warehouse") {
    const reservedElsewhere = reservations
      .filter((row) => txt(row.lotId) === entry.lotId &&
        txt(row.status) === "Active" && txt(row.orderId) !== orderId)
      .reduce((sum, row) => sum + number(row.quantity), 0);
    return onHand - reservedElsewhere + 0.0001 >= entry.quantity;
  }

  // Shared employee/vehicle/bin custody can contain cases from many orders.
  const linkedToThisOrder = matching.reduce((sum, row) => {
    if (txt(row.relatedOrderId) !== orderId) return sum;
    const quantity = number(row.quantity);
    return sum +
      (txt(row.toNodeId) === entry.fromNodeId ? quantity : 0) -
      (txt(row.fromNodeId) === entry.fromNodeId ? quantity : 0);
  }, 0);
  return linkedToThisOrder + 0.0001 >= entry.quantity;
}


export type AutoDeliveryAllocation=SourceEntry;
type ExpectedLine={product:string;cases:number};
const productKey=(value:string)=>value.trim().toLowerCase();

/**
 * Automatically choose recorded order custody first, then unreserved warehouse stock.
 * Never take another order's reservations or create negative on-hand balances.
 * @param {ExpectedLine[]} lines Canonical order quantities.
 * @param {BusinessRecord[]} lots Saved inventory lots.
 * @param {BusinessRecord[]} nodes Recorded custody locations.
 * @param {BusinessRecord[]} movements Recorded source-of-truth movements.
 * @param {BusinessRecord[]} reservations Outstanding order reservations.
 * @param {string} orderId Order receiving delivery.
 * @return {AutoDeliveryAllocation[]|null} Verified stock or no safe plan.
 */
export function planAutomaticDelivery(
  lines:ExpectedLine[],
  lots:BusinessRecord[],
  nodes:BusinessRecord[],
  movements:BusinessRecord[],
  reservations:BusinessRecord[],
  orderId:string,
):AutoDeliveryAllocation[]|null {
  const allocations:AutoDeliveryAllocation[]=[];
  const working=[...movements];
  const priorities:Record<string,number>={
    "Employee custody":0,"Vehicle":1,"Bin":2,"Warehouse":3,
  };
  const sources=nodes.filter((node)=>
    node.active===true&&priorities[txt(node.type)]!==undefined)
    .sort((a,b)=>priorities[txt(a.type)]-priorities[txt(b.type)]||
      txt(a.id).localeCompare(txt(b.id)));
  const grouped=new Map<string,number>();
  for(const line of lines) {
    if(!productKey(line.product)||!Number.isInteger(line.cases)||line.cases<1)
      return null;
    const product=productKey(line.product);
    grouped.set(product,(grouped.get(product)??0)+line.cases);
  }
  for(const [product,required] of grouped) {
    let needed=required;
    const candidates=lots.filter((lot)=>productKey(txt(lot.product))===product&&
      txt(lot.status)!=="Quality hold"&&Boolean(txt(lot.id)))
      .sort((a,b)=>
        txt(a.expirationDate||a.expiresAt).localeCompare(
          txt(b.expirationDate||b.expiresAt))||
        txt(a.id).localeCompare(txt(b.id)));
    for(const source of sources) {
      if(needed===0)break;
      for(const lot of candidates) {
        if(needed===0)break;
        const sourceId=txt(source.id),lotId=txt(lot.id);
        const balance=working.filter((movement)=>txt(movement.lotId)===lotId)
          .reduce((sum,movement)=>
            sum+(txt(movement.toNodeId)===sourceId?number(movement.quantity):0)-
              (txt(movement.fromNodeId)===sourceId?number(movement.quantity):0),0);
        if(balance<=0)continue;
        const quantity=Math.min(needed,Math.floor(balance));
        // Try from maximum quantity down to a safe warehouse/custody allocation.
        const reservedElsewhere=txt(source.type)==="Warehouse"?
          reservations.filter((row)=>txt(row.lotId)===lotId&&
            txt(row.status)==="Active"&&txt(row.orderId)!==orderId)
            .reduce((sum,row)=>sum+number(row.quantity),0):0;
        const relatedBalance=txt(source.type)==="Warehouse"?quantity:
          working.filter((movement)=>txt(movement.lotId)===lotId&&
            txt(movement.relatedOrderId)===orderId)
            .reduce((sum,movement)=>
              sum+(txt(movement.toNodeId)===sourceId?number(movement.quantity):0)-
                (txt(movement.fromNodeId)===sourceId?number(movement.quantity):0),0);
        const allowed=Math.min(quantity,Math.floor(
          txt(source.type)==="Warehouse"?balance-reservedElsewhere:relatedBalance));
        if(allowed<=0)continue;
        const entry={lotId,fromNodeId:sourceId,quantity:allowed};
        if(!overrideSourceAvailable(working,reservations,entry,
          txt(source.type),orderId))continue;
        allocations.push(entry);
        working.push({lotId,fromNodeId:sourceId,
          toNodeId:"pending-customer",quantity:allowed,relatedOrderId:orderId});
        needed-=allowed;
      }
    }
    if(needed>0)return null;
  }
  return allocations;
}
