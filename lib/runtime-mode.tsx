"use client";

import { ReactNode, createContext, useContext } from "react";
import { RuntimeMode, RuntimeModeState, readRuntimeModeState, useRuntimeModeValue, writeRuntimeModeState } from "./runtime-mode-store";
import { useWorkspace } from "./workspace-context";

export { RUNTIME_MODE_STORAGE_KEY } from "./runtime-mode-store";
export type { RuntimeMode } from "./runtime-mode-store";
type RuntimeModeContextValue = RuntimeModeState & { isDemo: boolean; setMode: (mode: RuntimeMode) => boolean };

const RuntimeModeContext = createContext<RuntimeModeContextValue | null>(null);

export function RuntimeModeProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useWorkspace();
  const mode = useRuntimeModeValue();
  const state = readRuntimeModeState();
  const setMode = (nextMode: RuntimeMode) => {
    if (currentUser?.role !== "Administrator" || mode === nextMode) return false;
    writeRuntimeModeState({ version: 1, mode: nextMode, changedAt: new Date().toISOString(), changedBy: currentUser.id });
    return true;
  };
  return <RuntimeModeContext.Provider value={{ ...state, mode, isDemo: mode === "demo", setMode }}>{children}</RuntimeModeContext.Provider>;
}

export function useRuntimeMode() {
  const value = useContext(RuntimeModeContext);
  if (!value) throw new Error("useRuntimeMode must be used inside RuntimeModeProvider");
  return value;
}
