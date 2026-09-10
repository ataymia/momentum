"use client";

import { FormEvent, useMemo, useState } from "react";
import { arizonaDateKey } from "../../lib/date-time";
import { useHcm } from "../../lib/hcm-context";
import { activeBenefitTaxRule, payrollBenefitDeductions, type BenefitTaxTreatment } from "../../lib/payroll-engine";
import { usePayroll } from "../../lib/payroll-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Section, StatusPill, formatMoney } from "../ui";

const today = () => arizonaDateKey();

export function BenefitTaxTreatmentPanel() {
  const { data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const { payroll, saveBenefitTaxRule } = usePayroll();
  const employeePaidTiers = useMemo(() => hcm.benefitPlans.flatMap((plan) => plan.tiers.filter((tier) => tier.employeeContributionPerPayPeriod > 0).map((tier) => ({ plan, tier }))), [hcm.benefitPlans]);
  const [selection, setSelection] = useState(() => employeePaidTiers[0] ? `${employeePaidTiers[0].plan.id}|${employeePaidTiers[0].tier.id}` : "");
  const [treatment, setTreatment] = useState<BenefitTaxTreatment>("Pre-tax");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [notice, setNotice] = useState("");

  if (currentUser?.role !== "Administrator") return null;

  const unresolved = data.users
    .filter((user) => user.role !== "Customer")
    .map((user) => ({ user, deductions: payrollBenefitDeductions(payroll, hcm, user.id, today()) }))
    .filter((item) => item.deductions.unconfigured.length > 0);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const [planId, tierId] = selection.split("|");
    const id = saveBenefitTaxRule(planId, tierId, treatment, effectiveDate);
    setNotice(id ? "Benefit tax treatment saved" : "Choose a valid benefit tier and effective date");
  };

  return <Section title="Benefit payroll tax treatment" description="Payroll will not guess whether an employee-paid benefit is pre-tax or post-tax. Configure the treatment that matches the actual plan documents and payroll setup.">
    <div className="request-actions">
      <StatusPill tone={unresolved.length ? "warning" : "success"}>{unresolved.length ? `${unresolved.length} employee${unresolved.length === 1 ? "" : "s"} blocked` : "Active elections configured"}</StatusPill>
      {notice && <StatusPill tone="info">{notice}</StatusPill>}
    </div>
    {unresolved.length > 0 && <div className="form-callout"><p>{unresolved.map(({ user, deductions }) => `${user.name}: ${deductions.unconfigured.length} active employee-paid benefit election${deductions.unconfigured.length === 1 ? "" : "s"} has no payroll tax treatment`).join(" · ")}. Regular payroll for those employees remains blocked until configured.</p></div>}
    <form className="form-grid" onSubmit={save}>
      <Field label="Benefit plan and tier"><select required value={selection} onChange={(event) => setSelection(event.target.value)}><option value="">Select a tier</option>{employeePaidTiers.map(({ plan, tier }) => <option key={`${plan.id}|${tier.id}`} value={`${plan.id}|${tier.id}`}>{plan.name} · {tier.name} · {formatMoney(tier.employeeContributionPerPayPeriod)}/pay</option>)}</select></Field>
      <Field label="Payroll tax treatment"><select value={treatment} onChange={(event) => setTreatment(event.target.value as BenefitTaxTreatment)}><option>Pre-tax</option><option>Post-tax</option></select></Field>
      <Field label="Effective date"><input type="date" required value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></Field>
      <div className="field"><span>&nbsp;</span><Button type="submit" disabled={!selection}>Save treatment</Button></div>
    </form>
    <div className="company-request-list">
      {employeePaidTiers.map(({ plan, tier }) => {
        const rule = activeBenefitTaxRule(payroll, plan.id, tier.id, today());
        return <article key={`${plan.id}-${tier.id}`}><div><small>{plan.category} · {plan.planYear}</small><strong>{plan.name} · {tier.name}</strong><p>Employee contribution {formatMoney(tier.employeeContributionPerPayPeriod)} per pay period · effective payroll treatment {rule?.effectiveDate ?? "not configured"}</p></div><StatusPill tone={rule ? "success" : "warning"}>{rule?.treatment ?? "Not configured"}</StatusPill></article>;
      })}
      {employeePaidTiers.length === 0 && <div className="review-empty"><p>No employee-paid benefit tiers are configured in Human Resources.</p></div>}
    </div>
  </Section>;
}
