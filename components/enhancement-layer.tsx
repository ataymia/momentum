"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "../lib/workspace-context";
import { AccountHealthHome } from "./crm/account-health-home";
import { AccountProfilePanel } from "./crm/account-profile-panel";

export function EnhancementLayer(){
  const { activePage } = useWorkspace();
  const [target,setTarget]=useState<Element|null>(null);
  useEffect(()=>{setTarget(document.querySelector(".page-container"));},[activePage]);
  if(!target)return null;
  if(activePage==="home")return createPortal(<AccountHealthHome/>,target);
  if(activePage==="accounts")return createPortal(<AccountProfilePanel/>,target);
  return null;
}
