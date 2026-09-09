"use client";

import { AlertTriangle } from "lucide-react";
import { useHcm } from "../../lib/hcm-context";
import { payrollRunControlIssues } from "../../lib/payroll-controls";
import { usePayroll } from "../../lib/payroll-context";
import { useWorkspace } from "../../lib/workspace-context";
import { BenefitTaxTreatmentPanel } from "../payroll/benefit-tax-treatment-panel";
import { PayrollPage as PayrollPageV2 } from "./payroll-v2";

export function PayrollPage() {
  const { data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const { payroll } = usePayroll();
  const sourceExceptions = currentUser?.role === "Administrator"
    ? payroll.runs
        .filter((run) => run.status !== "Voided")
        .map((run) => ({ run, issues: payrollRunControlIssues(payroll, data, hcm, run) }))
        .filter((item) => item.issues.length > 0)
    : [];

  return <>
    {sourceExceptions.length > 0 && <div className="report-integrity-banner"><AlertTriangle size={20}/><div><strong>Payroll source correction required.</strong><p>{sourceExceptions.map(({run,issues})=>`${run.id}: ${issues.map((issue)=>issue.detail).join(" ")}`).join(" · ")}</p><small>Approval, release, reissue, unsettled disbursement, and tax-liability actions remain blocked until the current source records are reconciled and a corrected payroll draft is built where required.</small></div></div>}
    {currentUser?.role === "Administrator" && <BenefitTaxTreatmentPanel/>}
    <PayrollPageV2/>
  </>;
}
