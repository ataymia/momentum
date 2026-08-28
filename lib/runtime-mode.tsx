"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { useWorkspace } from "./workspace-context";

export const RUNTIME_MODE_STORAGE_KEY = "momentum-runtime-mode-v1";
export type RuntimeMode = "demo" | "production";
type RuntimeModeState = { version: 1; mode: RuntimeMode; changedAt?: string; changedBy?: string };
type RuntimeModeContextValue = RuntimeModeState & { isDemo: boolean; setMode: (mode: RuntimeMode) => boolean };

const RuntimeModeContext = createContext<RuntimeModeContextValue | null>(null);
const seed: RuntimeModeState = { version: 1, mode: "demo" };

function readMode(): RuntimeModeState {
  if (typeof window === "undefined") return seed;
  try {
    const value = JSON.parse(window.localStorage.getItem(RUNTIME_MODE_STORAGE_KEY) ?? "null") as Partial<RuntimeModeState> | null;
    return value?.mode === "production" || value?.mode === "demo" ? { version: 1, mode: value.mode, changedAt: value.changedAt, changedBy: value.changedBy } : seed;
  } catch {
    return seed;
  }
}

export function RuntimeModeProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useWorkspace();
  const [state, setState] = useState<RuntimeModeState>(() => readMode());
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(RUNTIME_MODE_STORAGE_KEY, JSON.stringify(state)); }, [state]);
  const setMode = (mode: RuntimeMode) => {
    if (currentUser?.role !== "Administrator" || state.mode === mode) return false;
    setState({ version: 1, mode, changedAt: new Date().toISOString(), changedBy: currentUser.id });
    return true;
  };
  return <RuntimeModeContext.Provider value={{ ...state, isDemo: state.mode === "demo", setMode }}>{children}</RuntimeModeContext.Provider>;
}

export function useRuntimeMode() {
  const value = useContext(RuntimeModeContext);
  if (!value) throw new Error("useRuntimeMode must be used inside RuntimeModeProvider");
  return value;
}
