"use client";

import { InventoryLedgerPanel as InventoryLedgerPanelV2 } from "./inventory-ledger-panel-v2";
import { WarehouseControlPanel } from "./warehouse-control-panel";

export function InventoryLedgerPanel(){return <><WarehouseControlPanel/><InventoryLedgerPanelV2/></>;}
