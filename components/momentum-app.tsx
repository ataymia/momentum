"use client";

import { ReactNode, useEffect, useState } from "react";
import { AccountingProvider } from "../lib/accounting-context";
import { AuditProvider } from "../lib/audit-context";
import { CommerceProvider } from "../lib/commerce-context";
import { CrmProvider } from "../lib/crm-context";
import { FinanceProvider } from "../lib/finance-context";
import { HcmProvider } from "../lib/hcm-context";
import { InventoryLedgerProvider } from "../lib/inventory-ledger-context";
import { MarketingProvider } from "../lib/marketing-context";
import { NotificationProvider } from "../lib/notification-context";
import { PayrollProvider } from "../lib/payroll-context";
import { PerformanceProvider } from "../lib/performance-context";
import { PeriodLockProvider } from "../lib/period-lock-context";
import { RuntimeModeProvider } from "../lib/runtime-mode";
import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import { AppShell } from "./app-shell";
import { LoginScreen } from "./login-screen";

const PRESENTATION_SEED_KEY = "momentum-presentation-seed-2026-08-31";
const PRESENTATION_RESET_KEYS = [
  "momentum-demo-workspace-v5",
  "momentum-demo-session-v2",
  "momentum-audit-v1",
  "momentum-notification-rules-v1",
];

function PresentationSeedGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.localStorage.getItem(PRESENTATION_SEED_KEY) !== "ready") {
      PRESENTATION_RESET_KEYS.forEach((key) => window.localStorage.removeItem(key));
      window.localStorage.setItem(PRESENTATION_SEED_KEY, "ready");
    }
    setReady(true);
  }, []);
  return ready ? children : null;
}

function MomentumExperience(){
  const {currentUser}=useWorkspace();
  return currentUser?<AppShell/>:<LoginScreen/>;
}

export function MomentumApp(){
  return <PresentationSeedGate><WorkspaceProvider><RuntimeModeProvider><PeriodLockProvider><CrmProvider><HcmProvider><PayrollProvider><PerformanceProvider><CommerceProvider><InventoryLedgerProvider><FinanceProvider><AccountingProvider><MarketingProvider><AuditProvider><NotificationProvider><MomentumExperience/></NotificationProvider></AuditProvider></MarketingProvider></AccountingProvider></FinanceProvider></InventoryLedgerProvider></CommerceProvider></PerformanceProvider></PayrollProvider></HcmProvider></CrmProvider></PeriodLockProvider></RuntimeModeProvider></WorkspaceProvider></PresentationSeedGate>;
}
