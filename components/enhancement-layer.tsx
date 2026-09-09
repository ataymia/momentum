"use client";

import { createPortal } from "react-dom";
import { useWorkspace } from "../lib/workspace-context";
import { AccountHealthHome } from "./crm/account-health-home";
import { EmployeeDirectory } from "./hcm/employee-directory";

export function EnhancementLayer() {
  const { activePage } = useWorkspace();
  const target = typeof document === "undefined" ? null : document.querySelector(".page-container");
  if (!target) return null;
  if (activePage === "home") return createPortal(<AccountHealthHome />, target);
  if (activePage === "people") return createPortal(<EmployeeDirectory />, target);
  return null;
}
