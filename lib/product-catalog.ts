export type ProductSku = {
  id: string;
  description: string;
  shortName: string;
  /** Compact label used only by the Delivery Driver UI. Canonical inventory/order descriptions remain unchanged. */
  driverNickname: string;
  /** Nominal can size shown in the Delivery Driver quick-glance label. */
  canSizeOz: number;
  casePack: number;
  /** Verified case-level barcode only. Can/unit UPCs are intentionally excluded for wholesale scanning. */
  caseBarcode?: string;
  /** Flo's historical purchase-order quantity. Reference only, never a current inventory balance. */
  historicalPurchaseOrderCases?: number;
  active: boolean;
};

export const GOLDEN_EAGLE_SKUS: ProductSku[] = [
  { id: "ge-original-250ml-24", shortName: "Original", driverNickname: "Regular", canSizeOz: 8.4, description: "0.25L (8.4oz) Golden Eagle Energy Drink (24pack)", casePack: 24, historicalPurchaseOrderCases: 5400, active: true },
  { id: "ge-sugarfree-250ml-24", shortName: "Sugar Free", driverNickname: "Sugar-Free", canSizeOz: 8.4, description: "0.25L (8.4oz) Golden Eagle SugarFree (24pack)", casePack: 24, historicalPurchaseOrderCases: 1890, active: true },
  { id: "ge-tropical-250ml-24", shortName: "Tropical", driverNickname: "Tropical", canSizeOz: 8.4, description: "0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)", casePack: 24, historicalPurchaseOrderCases: 945, active: true },
  { id: "ge-red-250ml-24", shortName: "Red", driverNickname: "Red", canSizeOz: 8.4, description: "0.25L (8.4oz) Golden Eagle RED Edition (24pack)", casePack: 24, historicalPurchaseOrderCases: 945, active: true },
  { id: "ge-blue-zero-250ml-24", shortName: "Blue", driverNickname: "Blue", canSizeOz: 8.4, description: "0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)", casePack: 24, historicalPurchaseOrderCases: 540, active: true },
  { id: "ge-strawberry-250ml-24", shortName: "Strawberry", driverNickname: "Strawberry", canSizeOz: 8.4, description: "0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)", casePack: 24, historicalPurchaseOrderCases: 0, active: true },
];

const aliases = new Map<string, string>([
  ["golden eagle", "ge-original-250ml-24"],
  ["original", "ge-original-250ml-24"],
  ["regular", "ge-original-250ml-24"],
  ["golden eagle energy drink", "ge-original-250ml-24"],
  ["sugar free", "ge-sugarfree-250ml-24"],
  ["sugarfree", "ge-sugarfree-250ml-24"],
  ["golden eagle sugarfree", "ge-sugarfree-250ml-24"],
  ["tropical", "ge-tropical-250ml-24"],
  ["golden eagle tropical", "ge-tropical-250ml-24"],
  ["red", "ge-red-250ml-24"],
  ["golden eagle red", "ge-red-250ml-24"],
  ["blue", "ge-blue-zero-250ml-24"],
  ["blue zero", "ge-blue-zero-250ml-24"],
  ["golden eagle blue", "ge-blue-zero-250ml-24"],
  ["strawberry", "ge-strawberry-250ml-24"],
  ["golden eagle strawberry", "ge-strawberry-250ml-24"],
]);

const key = (value: string) => value.trim().toLowerCase().replace(/[·]/g, " ").replace(/\s+/g, " ");

export function skuById(id: string) {
  return GOLDEN_EAGLE_SKUS.find((sku) => sku.id === id);
}

export function skuForProductName(value: string) {
  const normalized = key(value);
  const exact = GOLDEN_EAGLE_SKUS.find((sku) => key(sku.description) === normalized || key(sku.shortName) === normalized);
  if (exact) return exact;
  const aliasId = aliases.get(normalized);
  if (aliasId) return skuById(aliasId);
  return GOLDEN_EAGLE_SKUS.find((sku) => normalized.includes(key(sku.shortName)));
}

export function canonicalProductDescription(value: string) {
  return skuForProductName(value)?.description ?? value.trim();
}

/**
 * Delivery-driver-only display label. The underlying order and inventory records always keep the canonical SKU
 * description so aliases can never split inventory, reporting, invoicing, or reconciliation.
 */
export function deliveryDriverProductLabel(value: string) {
  const sku = skuForProductName(value);
  if (!sku) return value.trim();
  return `${sku.canSizeOz} oz ${sku.driverNickname} ${sku.casePack}-pack`;
}

export function skuByCaseBarcode(barcode: string) {
  const value = barcode.trim();
  if (!value) return undefined;
  return GOLDEN_EAGLE_SKUS.find((sku) => sku.caseBarcode === value);
}

export function barcodeCatalogReady() {
  return GOLDEN_EAGLE_SKUS.some((sku) => Boolean(sku.caseBarcode));
}

/**
 * The catalog may retain historical purchase-order quantities for reference, but those values are metadata only.
 * Current inventory must come from verified physical receipts/counts and must never be seeded from historical POs.
 */
export const PRODUCT_CATALOG_INVENTORY_POLICY = "Product master only. Current on-hand stock must come from verified physical inventory receipts.";

export const HISTORICAL_PURCHASE_ORDER_POLICY = "Historical purchase-order quantities are reference only. They must never populate current on-hand, available, reserved, or sellable inventory.";
export const WHOLESALE_BARCODE_POLICY = "Momentum scans and stores verified case barcodes only. Can/unit barcodes are not used for wholesale inventory control.";
