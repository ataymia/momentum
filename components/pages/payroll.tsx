"use client";

import { AlertTriangle } from "lucide-react";
import { invalidBonusSourcesForRun } from "../../lib/payroll-engine";
import { usePayroll } from "../../lib/payroll-context";
import { useWorkspace } from "../../lib/workspace-context";
import { PayrollPage as PayrollPageV2 } from "./payroll-v2";

export function PayrollPage() {
  const { data, currentUser } = useWorkspace();
  const { payroll } = usePayroll();
  const sourceExceptions = currentUser?.role === "Administrator"
    ? payroll.runs
        .filter((run) => run.status !== "Voided")
        .map((run) => ({ run, invalidBonusIds: invalidBonusSourcesForRun(run, data) }))
        .filter((item) => item.invalidBonusIds.length > 0)
    : [];

  return <>
    {sourceExceptions.length > 0 && <div className="report-integrity-banner"><AlertTriangle size={20}/><div><strong>Payroll source correction required.</strong><p>{sourceExceptions.map(({run,invalidBonusIds})=>`${run.id}: ${invalidBonusIds.length} bonus source${invalidBonusIds.length===1?"":"s"} no longer qualifies`).join(" · ")}. Approval, release, and unsettled disbursement actions are blocked until the changed customer-payment source is corrected through the payroll exception path.</p></div></div>}
    <PayrollPageV2/>
  </>;
}
