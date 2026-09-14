"use client";

import { AppShell as BaseAppShell } from "./app-shell-v3";
import { EnhancementLayer } from "./enhancement-layer";

export function AppShell(){
  return <><BaseAppShell/><EnhancementLayer/></>;
}
