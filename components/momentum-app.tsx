"use client";

import { CommerceProvider } from "../lib/commerce-context";
import { CrmProvider } from "../lib/crm-context";
import { HcmProvider } from "../lib/hcm-context";
import { PerformanceProvider } from "../lib/performance-context";
import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import { AppShell } from "./app-shell";
import { LoginScreen } from "./login-screen";

function MomentumExperience(){
  const {currentUser}=useWorkspace();
  return currentUser?<AppShell/>:<LoginScreen/>;
}

export function MomentumApp(){
  return <WorkspaceProvider><CrmProvider><HcmProvider><PerformanceProvider><CommerceProvider><MomentumExperience/></CommerceProvider></PerformanceProvider></HcmProvider></CrmProvider></WorkspaceProvider>;
}
