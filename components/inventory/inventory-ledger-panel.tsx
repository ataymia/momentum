"use client";

import { InventoryLedgerPanel as InventoryLedgerPanelV2 } from "./inventory-ledger-panel-v2";
import { WarehouseControlPanel } from "./warehouse-control-panel";
import { WarehouseOperationsPanel } from "./warehouse-operations-panel";

export function InventoryLedgerPanel(){return <><WarehouseControlPanel/><WarehouseOperationsPanel/><InventoryLedgerPanelV2/></>;}
