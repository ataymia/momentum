"use client";

import { AccountingProvider } from "../lib/accounting-context";
import { CommerceProvider } from "../lib/commerce-context";
import { CrmProvider } from "../lib/crm-context";
import { HcmProvider } from "../lib/hcm-context";
import { InventoryLedgerProvider } from "../lib/inventory-ledger-context";
import { MarketingProvider } from "../lib/marketing-context";
import { PerformanceProvider } from "../lib/performance-context";
import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import { AppShell } from "./app-shell";
import { LoginScreen } from "./login-screen";

function MomentumExperience(){
  const {currentUser}=useWorkspace();
  return currentUser?<AppShell/>:<LoginScreen/>;
}

export function MomentumApp(){
  return <WorkspaceProvider><CrmProvider><HcmProvider><PerformanceProvider><CommerceProvider><InventoryLedgerProvider><AccountingProvider><MarketingProvider><MomentumExperience/></MarketingProvider></AccountingProvider></InventoryLedgerProvider></CommerceProvider></PerformanceProvider></HcmProvider></CrmProvider></WorkspaceProvider>;
}
