"use client";

import { WorkspaceProvider, useWorkspace } from "../lib/workspace-context";
import { AppShell } from "./app-shell";
import { LoginScreen } from "./login-screen";

function MomentumExperience() {
  const { currentUser } = useWorkspace();
  return currentUser ? <AppShell /> : <LoginScreen />;
}

export function MomentumApp() {
  return (
    <WorkspaceProvider>
      <MomentumExperience />
    </WorkspaceProvider>
  );
}
