from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"V9 PATCH FAILED {path}: {count} matches for {old[:160]!r}")
    target.write_text(text.replace(old, new, 1))
    print(f"v9 patched {path}")


def append_once(path: str, marker: str, addition: str) -> None:
    target = ROOT / path
    text = target.read_text()
    if marker in text:
        print(f"v9 already patched {path}")
        return
    target.write_text(text.rstrip() + "\n\n" + addition.rstrip() + "\n")
    print(f"v9 patched {path}")


# ---------------------------------------------------------------------------
# Canonical Golden Eagle SKU master. Historical PO quantities are reference
# metadata only and are never interpreted as current on-hand inventory.
# ---------------------------------------------------------------------------
replace_once(
    "lib/product-catalog.ts",
    '''export type ProductSku = {\n  id: string;\n  description: string;\n  shortName: string;\n  casePack: number;\n  caseBarcode?: string;\n  active: boolean;\n};''',
    '''export type ProductSku = {\n  id: string;\n  description: string;\n  shortName: string;\n  casePack: number;\n  /** Verified case-level barcode only. Can/unit UPCs are intentionally excluded for wholesale scanning. */\n  caseBarcode?: string;\n  /** Flo's historical purchase-order quantity. Reference only, never a current inventory balance. */\n  historicalPurchaseOrderCases?: number;\n  active: boolean;\n};''',
)
replace_once(
    "lib/product-catalog.ts",
    '''export const GOLDEN_EAGLE_SKUS: ProductSku[] = [\n  { id: "ge-original-250ml-24", shortName: "Original", description: "0.25L (8.4oz) Golden Eagle Energy Drink (24pack)", casePack: 24, active: true },\n  { id: "ge-sugarfree-250ml-24", shortName: "Sugar Free", description: "0.25L (8.4oz) Golden Eagle SugarFree (24pack)", casePack: 24, active: true },\n  { id: "ge-tropical-250ml-24", shortName: "Tropical", description: "0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)", casePack: 24, active: true },\n  { id: "ge-red-250ml-24", shortName: "Red", description: "0.25L (8.4oz) Golden Eagle RED Edition (24pack)", casePack: 24, active: true },\n  { id: "ge-blue-zero-250ml-24", shortName: "Blue", description: "0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)", casePack: 24, active: true },\n  { id: "ge-strawberry-250ml-24", shortName: "Strawberry", description: "0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)", casePack: 24, active: true },\n];''',
    '''export const GOLDEN_EAGLE_SKUS: ProductSku[] = [\n  { id: "ge-original-250ml-24", shortName: "Original", description: "0.25L (8.4oz) Golden Eagle Energy Drink (24pack)", casePack: 24, historicalPurchaseOrderCases: 5400, active: true },\n  { id: "ge-sugarfree-250ml-24", shortName: "Sugar Free", description: "0.25L (8.4oz) Golden Eagle SugarFree (24pack)", casePack: 24, historicalPurchaseOrderCases: 1890, active: true },\n  { id: "ge-tropical-250ml-24", shortName: "Tropical", description: "0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)", casePack: 24, historicalPurchaseOrderCases: 945, active: true },\n  { id: "ge-red-250ml-24", shortName: "Red", description: "0.25L (8.4oz) Golden Eagle RED Edition (24pack)", casePack: 24, historicalPurchaseOrderCases: 945, active: true },\n  { id: "ge-blue-zero-250ml-24", shortName: "Blue", description: "0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)", casePack: 24, historicalPurchaseOrderCases: 540, active: true },\n  { id: "ge-strawberry-250ml-24", shortName: "Strawberry", description: "0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)", casePack: 24, historicalPurchaseOrderCases: 0, active: true },\n];''',
)
append_once(
    "lib/product-catalog.ts",
    "HISTORICAL_PURCHASE_ORDER_POLICY",
    '''export const HISTORICAL_PURCHASE_ORDER_POLICY = "Historical purchase-order quantities are reference only. They must never populate current on-hand, available, reserved, or sellable inventory.";\nexport const WHOLESALE_BARCODE_POLICY = "Momentum scans and stores verified case barcodes only. Can/unit barcodes are not used for wholesale inventory control.";''',
)

# ---------------------------------------------------------------------------
# Backend product controls. Orders and inventory receipts may use legacy aliases,
# but they must resolve to one of the six canonical SKUs before persistence.
# ---------------------------------------------------------------------------
replace_once(
    "lib/workspace-context.tsx",
    'import { canonicalProductDescription } from "./product-catalog";',
    'import { canonicalProductDescription, skuForProductName } from "./product-catalog";',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    for(const candidate of supplied){\n      const product=canonicalProductDescription(candidate.product);const cases=Number(candidate.cases);\n      if(!product||!Number.isInteger(cases)||cases<1)return null;''',
    '''    for(const candidate of supplied){\n      const sku=skuForProductName(candidate.product);\n      if(!sku?.active)return null;\n      const product=sku.description;const cases=Number(candidate.cases);\n      if(!Number.isInteger(cases)||cases<1)return null;''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    for (const lot of lots) {\n      const code = lot.lotCode.trim().toLowerCase();\n      if (!code || !lot.product.trim() || !lot.location.trim() || !Number.isInteger(lot.onHand) || lot.onHand < 0 || !Number.isFinite(lot.reserved) || lot.reserved !== 0 || !["Available", "Quality hold", "Low stock"].includes(lot.status) || !isValidCalendarDateKey(lot.receivedAt) || !isValidCalendarDateKey(lot.bestBy) || seenCodes.has(code)) continue;\n      seenCodes.add(code);\n      valid.push({ ...lot, id: lot.id || uid("lot-import"), product: lot.product.trim(), location: lot.location.trim(), reserved: 0, available: lot.status === "Quality hold" ? 0 : lot.onHand });''',
    '''    for (const lot of lots) {\n      const code = lot.lotCode.trim().toLowerCase();\n      const sku=skuForProductName(lot.product);\n      if (!code || !sku?.active || !lot.location.trim() || !Number.isInteger(lot.onHand) || lot.onHand < 0 || !Number.isFinite(lot.reserved) || lot.reserved !== 0 || !["Available", "Quality hold", "Low stock"].includes(lot.status) || !isValidCalendarDateKey(lot.receivedAt) || !isValidCalendarDateKey(lot.bestBy) || seenCodes.has(code)) continue;\n      seenCodes.add(code);\n      valid.push({ ...lot, id: lot.id || uid("lot-import"), product: sku.description, location: lot.location.trim(), reserved: 0, available: lot.status === "Quality hold" ? 0 : lot.onHand });''',
)

# Inventory entry is now constrained to the verified SKU master instead of free-text product names.
replace_once(
    "components/pages/inventory.tsx",
    '''          <div className="field--full form-callout"><Boxes size={17}/><p>Leave Cases blank for any product you are not receiving. Product names are editable before the receipt is saved.</p></div>''',
    '''          <div className="field--full form-callout"><Boxes size={17}/><p>Leave Cases blank for any product you are not receiving. Product names come from the verified Golden Eagle SKU master. Historical purchase-order quantities are reference only and never load into current on-hand inventory.</p></div>''',
)
replace_once(
    "components/pages/inventory.tsx",
    '''            <Field label="Product"><input value={row.product} onChange={(event)=>updateQuickRow(index,{product:event.target.value})}/></Field>''',
    '''            <Field label="Product"><select value={row.product} onChange={(event)=>updateQuickRow(index,{product:event.target.value})}>{quickProducts.map((product)=><option value={product} key={product}>{product}</option>)}</select></Field>''',
)

# ---------------------------------------------------------------------------
# Tests: SKU master is exact, PO quantities cannot masquerade as on-hand, and
# arbitrary products are not accepted into the canonical catalog.
# ---------------------------------------------------------------------------
append_once(
    "tests/platform-integrity.test.ts",
    "canonical Golden Eagle SKU master keeps historical PO quantities separate from stock",
    '''\nimport { GOLDEN_EAGLE_SKUS, HISTORICAL_PURCHASE_ORDER_POLICY, skuForProductName } from "../lib/product-catalog";\n\ntest("canonical Golden Eagle SKU master keeps historical PO quantities separate from stock",()=>{\n  assert.deepEqual(GOLDEN_EAGLE_SKUS.map((sku)=>[sku.description,sku.historicalPurchaseOrderCases]),[\n    ["0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",5400],\n    ["0.25L (8.4oz) Golden Eagle SugarFree (24pack)",1890],\n    ["0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)",945],\n    ["0.25L (8.4oz) Golden Eagle RED Edition (24pack)",945],\n    ["0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)",540],\n    ["0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)",0],\n  ]);\n  assert.match(HISTORICAL_PURCHASE_ORDER_POLICY,/never populate current on-hand/i);\n  assert.equal(skuForProductName("Regular")?.description,"0.25L (8.4oz) Golden Eagle Energy Drink (24pack)");\n  assert.equal(skuForProductName("Made Up Flavor"),undefined);\n});''',
)

print("PASS: platform refinements v9 applied")
