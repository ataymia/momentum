"use client";

import { findAccountDuplicate } from "./duplicate-engine";
import { WorkspaceProvider as BaseWorkspaceProvider, useWorkspace as useBaseWorkspace } from "./workspace-context-v5";

export const WorkspaceProvider = BaseWorkspaceProvider;

export function useWorkspace() {
  const workspace = useBaseWorkspace();
  const createAccount: typeof workspace.createAccount = (account) => {
    if (findAccountDuplicate(workspace.data.accounts, account)) return null;
    return workspace.createAccount(account);
  };
  return { ...workspace, createAccount };
}
