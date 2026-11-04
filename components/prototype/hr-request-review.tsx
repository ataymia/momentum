"use client";

import { useMemo, useState } from "react";
import { hrRequestReviewDetail, hrRequestReviewRows, planHrRequestDecision, type HrRequestKind } from "../../lib/hr-request-review";
import { useHcm } from "../../lib/hcm-context";
import { navigateToRoute } from "../../lib/navigation-store";
import { momentumStorage } from "../../lib/persistence";
import { useRuntimeMode } from "../../lib/runtime-mode";
import { useWorkspace } from "../../lib/workspace-context";

const requestPath = (kind: HrRequestKind, id: string) => `/people/requests/${kind}/${encodeURIComponent(id)}`;

export function PeopleRequestQueue() {
  const { data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Submitted");
  const rows = useMemo(() => hrRequestReviewRows({ viewer: currentUser, users: data.users, hcm })
    .filter((item) => status === "All" || item.status === status)
    .filter((item) => [item.employeeName, item.label, item.status, item.kind].join(" ").toLowerCase().includes(query.toLowerCase())),
    [currentUser, data.users, hcm, status, query]);
  if (!currentUser || currentUser.role === "Customer") return <div className="prototype-empty">Not authorized.</div>;
  return <div className="prototype-domain prototype-domain--people">
    <button className="prototype-back" type="button" onClick={() => navigateToRoute("/people")}>← Human Resources</button>
    <header className="prototype-heading"><h1>{currentUser.role === "Administrator" ? "HR request reviews" : "My HR requests"}</h1>
      <p>Recorded time-off and employee workflow requests, with individual decision history.</p></header>
    <section className="prototype-panel">
      <div className="prototype-controls">
        <label className="prototype-search">Search <input aria-label="Search HR requests" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Employee or request"/></label>
        <label>Status <select aria-label="HR request status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="Submitted">Submitted</option><option value="Approved">Approved</option><option value="Returned">Returned</option><option value="Cancelled">Cancelled</option><option value="All">All</option>
        </select></label>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table">
        <thead><tr><th>Employee</th><th>Request</th><th>Submitted</th><th>Status</th><th>Review</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.kind + ":" + item.id}>
          <td>{item.employeeName}</td><td>{item.label}</td><td>{item.submittedAt}</td><td>{item.status}</td>
          <td><button type="button" className="prototype-link" onClick={() => navigateToRoute(requestPath(item.kind, item.id))}>Open request ›</button></td>
        </tr>)}</tbody>
      </table></div>
      {!rows.length && <p className="prototype-note">No accessible requests match this filter.</p>}
    </section>
    <p className="prototype-note">Client-side request scoping is not a substitute for backend HCM and Storage authorization.</p>
  </div>;
}

export function PeopleRequestDetail({ kind, requestId }: { kind: HrRequestKind; requestId: string }) {
  const { data, currentUser } = useWorkspace();
  const { hcm, setHcm } = useHcm();
  const runtime = useRuntimeMode();
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const detail = hrRequestReviewDetail({ viewer: currentUser, users: data.users, hcm, kind, requestId });
  const localReview = runtime.isDemo && momentumStorage.mode() === "local" && currentUser?.role === "Administrator";
  const mayReview = Boolean(localReview && detail && detail.status === "Submitted" && detail.userId !== currentUser?.id);
  const decide = (decision: "Approved" | "Returned") => {
    if (!mayReview || !currentUser) return;
    const decidedAt = new Date().toISOString();
    const input = { viewer: currentUser, users: data.users, data, kind, requestId, decision, note, decidedAt };
    const proposed = planHrRequestDecision({ ...input, hcm });
    if (!proposed.ok) { setFeedback(proposed.error); return; }
    setHcm((latest) => {
      const fresh = planHrRequestDecision({ ...input, hcm: latest });
      return fresh.ok ? fresh.state : latest;
    });
    setFeedback("Local demo decision requested. Verify the updated record status; no connected records were changed.");
  };
  if (!detail) return <div className="prototype-empty">HR request unavailable or not authorized.</div>;
  return <div className="prototype-domain prototype-domain--people">
    <button className="prototype-back" type="button" onClick={() => navigateToRoute("/people/requests")}>← Back to requests</button>
    <header className="prototype-heading"><h1>{detail.label}</h1><p>{detail.employeeName} · {detail.status}</p></header>
    <section className="prototype-panel"><h2>Request details</h2>
      <dl className="prototype-facts">
        <div><dt>Submitted</dt><dd>{detail.submittedAt}</dd></div>
        <div><dt>Status</dt><dd>{detail.status}</dd></div>
        {detail.startDate && <div><dt>Dates</dt><dd>{detail.startDate} to {detail.endDate}</dd></div>}
        {detail.requestedHours !== undefined && <div><dt>Requested hours</dt><dd>{detail.requestedHours}</dd></div>}
        <div><dt>Employee explanation</dt><dd>{detail.reason}</dd></div>
        {detail.decidedAt && <div><dt>Decision recorded</dt><dd>{detail.decidedAt}</dd></div>}
        {detail.decisionNote && <div><dt>Reviewer note</dt><dd>{detail.decisionNote}</dd></div>}
      </dl>
    </section>
    {mayReview && <section className="prototype-panel"><h2>Local demo review</h2>
      <label>Decision note <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)}
        placeholder="Return instructions required when returning a request" /></label>
      <div className="prototype-controls">
        <button type="button" onClick={() => decide("Returned")} disabled={!note.trim()}>Return for correction</button>
        <button type="button" onClick={() => decide("Approved")}>Approve request</button>
      </div>
      <p className="prototype-note">Uses the existing HCM actor and PTO ledger invariants. Approving a workflow request does not perform its underlying employment, payroll or legal action.</p>
    </section>}
    {feedback && <p role="status" className="prototype-note">{feedback}</p>}
    <p className="prototype-note">Review-only on connected data. No production approval, payroll, timecard, employee access or external notification is performed here.</p>
  </div>;
}
