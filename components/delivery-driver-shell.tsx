"use client";

import { Boxes, CircleHelp, Clock3, LogOut, Megaphone, Truck, UsersRound } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "../lib/workspace-context";
import { EmployeeDirectory } from "./hcm/employee-directory";
import { DeliveryRequestsPage } from "./pages/delivery-requests";
import { DeliveriesPage } from "./pages/deliveries";
import { HelpPage } from "./pages/help";
import { InventoryPage } from "./pages/inventory";
import { PeoplePage } from "./pages/people";
import { Avatar, BrandMark, Button } from "./ui";

type DriverTab = "deliveries" | "requests" | "inventory" | "time" | "directory" | "help";

const tabs: Array<{ key: DriverTab; label: string; icon: typeof Truck }> = [
  { key: "deliveries", label: "Deliveries", icon: Truck },
  { key: "requests", label: "Requests", icon: Megaphone },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "time", label: "Time & HR", icon: Clock3 },
  { key: "directory", label: "Directory", icon: UsersRound },
  { key: "help", label: "Help", icon: CircleHelp },
];

export function DeliveryDriverShell() {
  const { currentUser, logout } = useWorkspace();
  const [tab, setTab] = useState<DriverTab>("deliveries");
  if (!currentUser || currentUser.role !== "Delivery Driver") return null;

  return <div className="delivery-driver-shell">
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"14px 18px",borderBottom:"1px solid var(--line, #d9dee8)",background:"var(--surface, #fff)",position:"sticky",top:0,zIndex:20}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}><BrandMark/><div><strong>Momentum Delivery</strong><small style={{display:"block"}}>Golden Eagle fulfillment</small></div></div>
      <div style={{display:"flex",alignItems:"center",gap:10}}><Avatar initials={currentUser.initials}/><div className="driver-shell-user"><strong>{currentUser.name}</strong><small style={{display:"block"}}>{currentUser.title}</small></div><Button size="sm" variant="ghost" icon={<LogOut size={15}/>} onClick={()=>logout()}>Sign out</Button></div>
    </header>
    <nav aria-label="Delivery driver navigation" style={{display:"flex",gap:8,padding:"10px 14px",overflowX:"auto",borderBottom:"1px solid var(--line, #d9dee8)",background:"var(--surface, #fff)"}}>
      {tabs.map(({key,label,icon:Icon})=><button key={key} className={`nav-item ${tab===key?"is-active":""}`} onClick={()=>setTab(key)} style={{minWidth:"max-content"}}><Icon size={17}/><span>{label}</span></button>)}
    </nav>
    <main style={{minHeight:"calc(100vh - 116px)"}}>
      {tab==="deliveries"&&<DeliveriesPage/>}
      {tab==="requests"&&<DeliveryRequestsPage/>}
      {tab==="inventory"&&<InventoryPage/>}
      {tab==="time"&&<PeoplePage/>}
      {tab==="directory"&&<div className="page page--focused-tool"><EmployeeDirectory/></div>}
      {tab==="help"&&<HelpPage/>}
    </main>
  </div>;
}
