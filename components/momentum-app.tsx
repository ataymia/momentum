"use client";

import { AccountingProvider } from "../lib/accounting-context";
import { AuditProvider } from "../lib/audit-context";
import { BrandAmbassadorProvider } from "../lib/brand-ambassador-context";
import { BRAND_AMBASSADOR_STORAGE_KEY } from "../lib/brand-ambassador-engine";
import { CommerceProvider } from "../lib/commerce-context";
import { CrmProvider } from "../lib/crm-context";
import { DeliveryProvider } from "../lib/delivery-context";
import { DELIVERY_STORAGE_KEY } from "../lib/delivery-engine";
import { DOCUMENT_TEMPLATE_STORAGE_KEY } from "../lib/document-template-engine";
import { FinanceProvider } from "../lib/finance-context";
import { HcmProvider } from "../lib/hcm-context";
import { IDENTITY_PROVISIONING_STORAGE_KEY } from "../lib/identity-provisioning";
import { IdentityProvisioningProvider, useIdentityProvisioning } from "../lib/identity-provisioning-context";
import { InventoryLedgerProvider } from "../lib/inventory-ledger-context";
import { FieldTrackingProvider } from "../lib/location-tracking-context";
import { FirebaseSessionProvider, useFirebaseSessionOptional } from "../lib/firebase-session-context";
import { MarketingProvider } from "../lib/marketing-context";
import { NotificationProvider } from "../lib/notification-context";
import { PayrollProvider } from "../lib/payroll-context";
import { PerformanceProvider } from "../lib/performance-context";
import { PeriodLockProvider } from "../lib/period-lock-context";
import { RuntimeModeProvider } from "../lib/runtime-mode";
import { currentRuntimeMode, useRuntimeModeValue } from "../lib/runtime-mode-store";
import { TrainingLibraryProvider } from "../lib/training-library-context";
import { TRAINING_LIBRARY_STORAGE_KEY } from "../lib/training-library-engine";
import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import { AppShell } from "./app-shell";
import { DeparturePrompt } from "./field-tracking/departure-prompt";
import { FirebaseGate } from "./firebase-gate";
import { OnboardingPortal } from "./hcm/onboarding-portal";
import { LoginScreen } from "./login-screen";

const PRESENTATION_SEED_KEY = "momentum-presentation-seed-2026-08-31";
const PRESENTATION_RESET_KEYS = [
  "momentum-demo-workspace-v5",
  "momentum-demo-session-v2",
  "momentum-audit-v1",
  "momentum-notification-rules-v1",
  "momentum-field-tracking-v1",
  BRAND_AMBASSADOR_STORAGE_KEY,
  DELIVERY_STORAGE_KEY,
  TRAINING_LIBRARY_STORAGE_KEY,
  IDENTITY_PROVISIONING_STORAGE_KEY,
  DOCUMENT_TEMPLATE_STORAGE_KEY,
];

function ensurePresentationSeed() {
  if (typeof window === "undefined" || currentRuntimeMode() !== "demo" || window.localStorage.getItem(PRESENTATION_SEED_KEY) === "ready") return;
  PRESENTATION_RESET_KEYS.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.setItem(PRESENTATION_SEED_KEY, "ready");
}

function MomentumExperience(){
  const {currentUser}=useWorkspace();
  const {currentRecord}=useIdentityProvisioning();
  const firebase=useFirebaseSessionOptional();
  const activeAdministrator=currentUser?.role==="Administrator"&&firebase?.access?.role==="Administrator"&&firebase.access.accountState==="Active";
  if(!currentUser)return <LoginScreen/>;
  if(currentUser.role!=="Customer"&&currentRecord?.state!=="Active"&&!activeAdministrator)return <OnboardingPortal/>;
  return <><AppShell/><DeparturePrompt/></>;
}

function MomentumProviders(){
  return <WorkspaceProvider><RuntimeModeProvider><PeriodLockProvider><CrmProvider><HcmProvider><TrainingLibraryProvider><IdentityProvisioningProvider><BrandAmbassadorProvider><FieldTrackingProvider><PayrollProvider><PerformanceProvider><CommerceProvider><InventoryLedgerProvider><DeliveryProvider><FinanceProvider><AccountingProvider><MarketingProvider><AuditProvider><NotificationProvider><MomentumExperience/></NotificationProvider></AuditProvider></MarketingProvider></AccountingProvider></FinanceProvider></DeliveryProvider></InventoryLedgerProvider></CommerceProvider></PerformanceProvider></PayrollProvider></FieldTrackingProvider></BrandAmbassadorProvider></IdentityProvisioningProvider></TrainingLibraryProvider></HcmProvider></CrmProvider></PeriodLockProvider></RuntimeModeProvider></WorkspaceProvider>;
}

/**
 * Local demo mode (localhost only) keeps the self-contained localStorage workspace.
 * Production mounts the Firebase session first: the engines only render after the signed-in employee's
 * access record is verified and every Firestore document they may read has been cached.
 */
export function MomentumApp(){
  ensurePresentationSeed();
  const runtimeMode=useRuntimeModeValue();
  if(runtimeMode==="demo")return <MomentumProviders/>;
  return <FirebaseSessionProvider><FirebaseGate><MomentumProviders/></FirebaseGate></FirebaseSessionProvider>;
}
