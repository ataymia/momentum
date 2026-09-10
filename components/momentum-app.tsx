"use client";

import { AccountingProvider } from "../lib/accounting-context";
import { AuditProvider } from "../lib/audit-context";
import { CommerceProvider } from "../lib/commerce-context";
import { CrmProvider } from "../lib/crm-context";
import { FinanceProvider } from "../lib/finance-context";
import { HcmProvider } from "../lib/hcm-context";
import { IDENTITY_PROVISIONING_STORAGE_KEY } from "../lib/identity-provisioning";
import { IdentityProvisioningProvider, useIdentityProvisioning } from "../lib/identity-provisioning-context";
import { InventoryLedgerProvider } from "../lib/inventory-ledger-context";
import { FieldTrackingProvider } from "../lib/location-tracking-context";
import { MarketingProvider } from "../lib/marketing-context";
import { NotificationProvider } from "../lib/notification-context";
import { PayrollProvider } from "../lib/payroll-context";
import { PerformanceProvider } from "../lib/performance-context";
import { PeriodLockProvider } from "../lib/period-lock-context";
import { RuntimeModeProvider } from "../lib/runtime-mode";
import { currentRuntimeMode } from "../lib/runtime-mode-store";
import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import { AppShell } from "./app-shell";
import { DeparturePrompt } from "./field-tracking/departure-prompt";
import { OnboardingPortal } from "./hcm/onboarding-portal";
import { LoginScreen } from "./login-screen";

const PRESENTATION_SEED_KEY = "momentum-presentation-seed-2026-08-31";
const PRESENTATION_RESET_KEYS = [
  "momentum-demo-workspace-v5",
  "momentum-demo-session-v2",
  "momentum-audit-v1",
  "momentum-notification-rules-v1",
  "momentum-field-tracking-v1",
  IDENTITY_PROVISIONING_STORAGE_KEY,
];

function ensurePresentationSeed() {
  if (typeof window === "undefined" || currentRuntimeMode() !== "demo" || window.localStorage.getItem(PRESENTATION_SEED_KEY) === "ready") return;
  PRESENTATION_RESET_KEYS.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.setItem(PRESENTATION_SEED_KEY, "ready");
}

function MomentumExperience(){
  const {currentUser}=useWorkspace();
  const {currentRecord}=useIdentityProvisioning();
  if(!currentUser)return <LoginScreen/>;
  if(currentUser.role!=="Customer"&&currentRecord?.state!=="Active")return <OnboardingPortal/>;
  return <><AppShell/><DeparturePrompt/></>;
}

export function MomentumApp(){
  ensurePresentationSeed();
  return <WorkspaceProvider><RuntimeModeProvider><PeriodLockProvider><CrmProvider><HcmProvider><IdentityProvisioningProvider><FieldTrackingProvider><PayrollProvider><PerformanceProvider><CommerceProvider><InventoryLedgerProvider><FinanceProvider><AccountingProvider><MarketingProvider><AuditProvider><NotificationProvider><MomentumExperience/></NotificationProvider></AuditProvider></MarketingProvider></AccountingProvider></FinanceProvider></InventoryLedgerProvider></CommerceProvider></PerformanceProvider></PayrollProvider></FieldTrackingProvider></IdentityProvisioningProvider></HcmProvider></CrmProvider></PeriodLockProvider></RuntimeModeProvider></WorkspaceProvider>;
}
