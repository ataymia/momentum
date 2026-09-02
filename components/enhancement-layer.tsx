"use client";

import { createPortal } from "react-dom";
import { useWorkspace } from "../lib/workspace-context";
import { AccountHealthHome } from "./crm/account-health-home";

export function EnhancementLayer() {
  const { activePage } = useWorkspace();
  const target = typeof document === "undefined" ? null : document.querySelector(".page-container");
  if (!target) return null;
  if (activePage === "home") return createPortal(<AccountHealthHome />, target);
  return null;
}
