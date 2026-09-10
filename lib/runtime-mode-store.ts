"use client";

import { useSyncExternalStore } from "react";

export const RUNTIME_MODE_STORAGE_KEY = "momentum-runtime-mode-v1";
export const RUNTIME_MODE_EVENT = "momentum-runtime-mode-change";
export type RuntimeMode = "demo" | "production";
export type RuntimeModeState = { version: 1; mode: RuntimeMode; changedAt?: string; changedBy?: string };
export const RUNTIME_MODE_SEED: RuntimeModeState = { version: 1, mode: "production" };

export function demoCapabilityEnabled() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function readRuntimeModeState(): RuntimeModeState {
  if (typeof window === "undefined") return RUNTIME_MODE_SEED;
  try {
    const value = JSON.parse(window.localStorage.getItem(RUNTIME_MODE_STORAGE_KEY) ?? "null") as Partial<RuntimeModeState> | null;
    if (value?.mode === "demo" && demoCapabilityEnabled()) return { version: 1, mode: "demo", changedAt: value.changedAt, changedBy: value.changedBy };
    if (value?.mode === "production") return { version: 1, mode: "production", changedAt: value.changedAt, changedBy: value.changedBy };
    return RUNTIME_MODE_SEED;
  } catch {
    return RUNTIME_MODE_SEED;
  }
}

export function currentRuntimeMode(): RuntimeMode {
  return readRuntimeModeState().mode;
}

export function writeRuntimeModeState(state: RuntimeModeState) {
  if (typeof window === "undefined") return;
  const next = state.mode === "demo" && !demoCapabilityEnabled() ? { ...state, mode: "production" as const } : state;
  window.localStorage.setItem(RUNTIME_MODE_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RUNTIME_MODE_EVENT, { detail: next }));
}

function subscribeRuntimeMode(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === RUNTIME_MODE_STORAGE_KEY) callback();
  };
  const onRuntimeMode = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener(RUNTIME_MODE_EVENT, onRuntimeMode);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(RUNTIME_MODE_EVENT, onRuntimeMode);
  };
}

export function useRuntimeModeValue() {
  return useSyncExternalStore(subscribeRuntimeMode, currentRuntimeMode, () => "production" as RuntimeMode);
}
