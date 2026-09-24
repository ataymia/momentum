"use client";

import { Megaphone, PackageCheck } from "lucide-react";
import { useMemo } from "react";
import { useMarketing } from "../../lib/marketing-context";
import { useWorkspace } from "../../lib/workspace-context";
import { PageHeader, Section, StatusPill, formatDate } from "../ui";

export function DeliveryRequestsPage() {
  const { data } = useWorkspace();
  const marketing = useMarketing().state;
  const approved = useMemo(
    () => marketing.deliveryNotices.filter((request) => request.status === "Approved").sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)),
    [marketing.deliveryNotices],
  );

  return <div className="page page--delivery-requests">
    <PageHeader title="Approved requests" actions={<StatusPill tone={approved.length ? "warning" : "success"}>{approved.length} approved</StatusPill>}/>
    <Section title="Marketing / delivery requests" description="Approved requests that may affect a delivery appear here. Location-linked requests also repeat on the matching delivery card.">
      <div className="delivery-marketing-request-list">
        {approved.map((request) => {
          const account = request.accountId ? data.accounts.find((item) => item.id === request.accountId) : undefined;
          const requester = data.users.find((item) => item.id === request.requesterId);
          return <article key={request.id}>
            <span><Megaphone size={17}/></span>
            <div>
              <small>{request.type}{request.neededBy ? ` · needed ${formatDate(request.neededBy, { month: "short", day: "numeric" })}` : ""}</small>
              <strong>{request.title}</strong>
              <p>{request.detail}</p>
              <em>{account ? (account.locationName ?? account.name) : "No location linked"}{requester ? ` · requested by ${requester.name}` : ""}</em>
            </div>
            <StatusPill tone="warning">Approved</StatusPill>
          </article>;
        })}
        {approved.length === 0 && <div className="review-empty"><PackageCheck size={23}/><p>No approved delivery-related requests are waiting right now.</p></div>}
      </div>
    </Section>
  </div>;
}
