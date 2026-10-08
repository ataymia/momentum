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
    <header className="driver-shell-header">
      <div className="driver-shell-heading">
        <BrandMark compact />
        <div className="driver-shell-brandtext"><strong>Momentum Delivery</strong><small>Golden Eagle fulfillment</small></div>
      </div>
      <div className="driver-shell-actions">
        <Avatar initials={currentUser.initials}/>
        <div className="driver-shell-user"><strong>{currentUser.name}</strong><small>{currentUser.title}</small></div>
        <div className="driver-shell-signout">
          <Button type="button" size="sm" variant="ghost" aria-label="Sign out" icon={<LogOut size={18}/>} onClick={()=>logout()}>Sign out</Button>
        </div>
      </div>
    </header>
    <nav className="driver-shell-nav" aria-label="Delivery driver navigation">
      {tabs.map(({key,label,icon:Icon})=><button type="button" key={key}
        className={`nav-item driver-shell-tab ${tab===key?"is-active":""}`}
        aria-current={tab===key?"page":undefined}
        onClick={()=>setTab(key)}><Icon size={18}/><span>{label}</span></button>)}
    </nav>
    <main className="driver-shell-main">
      {tab==="deliveries"&&<DeliveriesPage/>}
      {tab==="requests"&&<DeliveryRequestsPage/>}
      {tab==="inventory"&&<InventoryPage/>}
      {tab==="time"&&<PeoplePage/>}
      {tab==="directory"&&<div className="page page--focused-tool"><EmployeeDirectory/></div>}
      {tab==="help"&&<HelpPage/>}
    </main>
  </div>;
}
