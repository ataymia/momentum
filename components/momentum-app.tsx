"use client";

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
  return <WorkspaceProvider><HcmProvider><PerformanceProvider><MomentumExperience/></PerformanceProvider></HcmProvider></WorkspaceProvider>;
}
