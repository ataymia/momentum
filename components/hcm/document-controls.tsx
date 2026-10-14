"use client";
import { HR_FORM_SOURCES, validExternalVerification } from "../../lib/hr-document-controls";
import { useHcm } from "../../lib/hcm-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Section } from "../ui";

export function HrDocumentControls() {
  const { currentUser, data } = useWorkspace();
  const { hcm } = useHcm();
  if (currentUser?.role !== "Administrator") return null;
  const pending = hcm.documents.filter(document => document.status !== "Available" || !validExternalVerification(document.verification, document.version));
  return <Section title="Employment document controls" description="Track verification evidence separately from access activation. Activation or an administrative override does not certify completion of employment paperwork.">
    <details><summary>Official forms and instructions</summary><ul>{HR_FORM_SOURCES.map(form => <li key={form.title}><a href={form.url} target="_blank" rel="noreferrer">{form.title}</a> — {form.detail}</li>)}</ul></details>
    <p>Signed originals remain in the secure HR system of record. Momentum currently records external verification; it does not provide electronic I-9 or tax-form signing. Do not put tax identifiers or signed forms in Marketing or shared training files.</p>
    <div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Employee</th><th>Document</th><th>Version</th><th>Review needed</th></tr></thead><tbody>{pending.map(document => <tr key={document.id}><td>{data.users.find(user => user.id === document.userId)?.name ?? document.userId}</td><td>{document.title}</td><td>{document.version}</td><td>{document.status === "Available" ? "Verification evidence needs review" : document.status}</td></tr>)}</tbody></table></div>
    {!pending.length && <p>No document evidence gaps in the records currently loaded.</p>}
  </Section>;
}
