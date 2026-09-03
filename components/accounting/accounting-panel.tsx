"use client";

import { BookOpenCheck, ShieldAlert } from "lucide-react";
import { useEffect } from "react";
import { unprocessedSourceEvents } from "../../lib/accounting-engine";
import { useAccounting } from "../../lib/accounting-context";
import { Section, StatusPill, formatMoney } from "../ui";
import { AccountingPanel as AccountingPanelV2 } from "./accounting-panel-v2";

export function AccountingPanel() {
  const { accounting, events } = useAccounting();
  const focusId = typeof window !== "undefined" ? window.sessionStorage.getItem("momentum-focus-record") : null;
  const focused = focusId ? unprocessedSourceEvents(accounting, events).find((event) => event.id === focusId) : undefined;

  useEffect(() => {
    if (!focused || !focusId) return;
    const handle = window.setTimeout(() => document.getElementById(`accounting-focus-${focused.id}`)?.scrollIntoView({ behavior:"smooth", block:"center" }), 0);
    window.sessionStorage.removeItem("momentum-focus-record");
    return () => window.clearTimeout(handle);
  }, [focusId, focused]);

  return <>
    {focused && <div id={`accounting-focus-${focused.id}`} className="accounting-focus-record"><Section title="Accounting action source" description="This is the exact source-event record opened from My Work."><div className="company-request-list"><article className="is-focused"><span>{focused.blockedReason ? <ShieldAlert size={17}/> : <BookOpenCheck size={17}/>}</span><div><small>{focused.type} · {focused.date}</small><strong>{focused.description}{focused.amount ? ` · ${formatMoney(focused.amount)}` : ""}</strong><p>{focused.blockedReason ?? "Eligible for the configured accounting-rule workflow."}</p></div><StatusPill tone={focused.blockedReason ? "warning" : "success"}>{focused.blockedReason ? "Needs policy" : "Ready"}</StatusPill></article></div></Section></div>}
    <AccountingPanelV2/>
  </>;
}
