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
 * @return {boolean} Whether stock can be consumed without affecting another order.
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
