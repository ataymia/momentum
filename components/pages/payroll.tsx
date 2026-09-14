"use client";

import { AlertTriangle } from "lucide-react";
import { useHcm } from "../../lib/hcm-context";
import { payrollRunControlIssues } from "../../lib/payroll-controls";
import { usePayroll } from "../../lib/payroll-context";
import { useWorkspace } from "../../lib/workspace-context";
import { BenefitTaxTreatmentPanel } from "../payroll/benefit-tax-treatment-panel";
import { Button } from "../ui";
import { PayrollPage as PayrollPageV2 } from "./payroll-v2";

export function PayrollPage() {
  const { data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const { payroll, voidRunForCorrection } = usePayroll();
  const sourceExceptions = currentUser?.role === "Administrator"
    ? payroll.runs
        .filter((run) => run.status !== "Voided")
        .map((run) => ({ run, issues: payrollRunControlIssues(payroll, data, hcm, run) }))
        .filter((item) => item.issues.length > 0)
    : [];

  return <>
    {sourceExceptions.map(({ run, issues }) => <div className="report-integrity-banner" key={run.id}><AlertTriangle size={20}/><div><strong>Payroll source correction required.</strong><p>{run.id}: {issues.map((issue)=>issue.detail).join(" ")}</p><small>Approval, release, unsettled disbursement, and tax-liability actions remain blocked. Void this stale run to free its source records, correct the underlying source, then build a new payroll draft. Settled employee payments or paid tax liabilities require a separate recovery workflow and cannot be silently reversed.</small><div className="request-actions"><Button size="sm" variant="danger" onClick={()=>{const reason=window.prompt(`Reason for voiding ${run.id} for correction`);if(reason)voidRunForCorrection(run.id,reason);}}>{run.status === "Released" ? "Void for correction" : "Void stale run"}</Button></div></div></div>)}
    {currentUser?.role === "Administrator" && <BenefitTaxTreatmentPanel/>}
    <PayrollPageV2/>
  </>;
}
