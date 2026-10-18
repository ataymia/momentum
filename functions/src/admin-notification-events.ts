import type {ServerMail} from "./resend-mail-policy";

export type AdminNotificationEvent = {
  id: string;
  policyId: "system.email_bounced" | "system.email_failed";
  title: string;
  detail: string;
  createdAt: string;
  sourceId: string;
  sourceRecordId: string;
  outboxId: string;
  status: "Open";
};

type AdminNotificationInput = {
  eventId: string;
  status: string;
  mail: Pick<ServerMail, "id" | "kind" | "to" | "sourceRecordId">;
  createdAt: string;
  errorDetail?: string;
};

const safeDetail = (value: string) =>
  value.replace(/[\r\n]+/g, " ").slice(0, 600);

/** Build a sanitized Administrator-only event for Resend delivery failures. */
export function resendAdminNotification(
  input: AdminNotificationInput,
): AdminNotificationEvent | null {
  const bounced = input.status === "Bounced";
  const failed = [
    "Failed",
    "Complained",
    "Suppressed",
    "Review required",
  ].includes(input.status);
  if (!bounced && !failed) return null;

  const policyId = bounced ? "system.email_bounced" : "system.email_failed";
  const title = bounced ?
    "Customer email bounced" :
    "Customer email send failed";
  const statusText = bounced ?
    "bounced" :
    input.status === "Review required" ?
      "requires delivery review" :
      `reported ${input.status.toLowerCase()}`;

  const extra = input.errorDetail?.trim() ?
    ` ${safeDetail(input.errorDetail.trim())}` :
    "";
  return {
    id: `resend-admin-${input.eventId}`,
    policyId,
    title,
    detail: safeDetail(
      `Email to ${input.mail.to} for ${input.mail.kind} ${statusText}.${extra}`,
    ),
    createdAt: input.createdAt,
    sourceId: input.eventId,
    sourceRecordId: input.mail.sourceRecordId,
    outboxId: input.mail.id,
    status: "Open",
  };
}
