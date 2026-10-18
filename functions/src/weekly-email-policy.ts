/* eslint-disable no-control-regex */
import {createHash} from "node:crypto";

type Row = Record<string, unknown>;

export type WeeklyReminderRecipient = {
  uid: string;
  email: string;
  name: string;
  role: "Sales Representative" | "Sales Manager";
};

const row = (value: unknown): value is Row =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const validEmail = (value: string) =>
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
  !/[\r\n\x00-\x1f\x7f]/.test(value);

/**
 * Return the Arizona-local calendar date for an instant.
 * @param {Date} now Instant to format.
 * @return {string} YYYY-MM-DD Arizona-local date.
 */
export function arizonaDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * Resolve the Monday starting the week containing a calendar date.
 * @param {string} dateKey YYYY-MM-DD calendar date.
 * @return {string} Monday date key, or empty string for invalid input.
 */
export function mondayForDateKey(dateKey: string): string {
  const noon = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(noon.getTime())) return "";
  const offset = (noon.getUTCDay() + 6) % 7;
  noon.setUTCDate(noon.getUTCDate() - offset);
  return noon.toISOString().slice(0, 10);
}

/**
 * Check whether the employee already submitted the weekly progress report.
 * @param {unknown} performanceReports Persisted reports shard.
 * @param {string} uid Employee Firebase uid.
 * @param {string} weekStart Monday date key for the reporting week.
 * @return {boolean} True when the weekly report already exists.
 */
export function weeklyReportSubmitted(
  performanceReports: unknown,
  uid: string,
  weekStart: string,
): boolean {
  if (!row(performanceReports) ||
      !Array.isArray(performanceReports.items)) {
    return false;
  }
  return performanceReports.items.some((value) => {
    if (!row(value)) return false;
    return value.type === "Weekly progress" &&
      value.userId === uid &&
      value.weekStart === weekStart &&
      ["Submitted", "Reviewed"].includes(String(value.status));
  });
}

/**
 * Build the deterministic Sunday reminder outbox payload.
 * @param {WeeklyReminderRecipient} recipient Active employee recipient.
 * @param {string} weekStart Monday date key for the reporting week.
 * @param {string} createdAt Server creation timestamp.
 * @return {object} Validated deterministic mail fields.
 */
export function weeklyReminderMail(
  recipient: WeeklyReminderRecipient,
  weekStart: string,
  createdAt: string,
) {
  const digest = createHash("sha256").update(JSON.stringify([
    "weekly.reminder",
    recipient.uid,
    weekStart,
    1,
  ])).digest("hex");
  const first = recipient.name.trim().split(/\s+/)[0] || "there";
  const weekEnd = new Date(`${weekStart}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const end = weekEnd.toISOString().slice(0, 10);
  const eventId =
    `weekly-sunday-reminder:${recipient.uid}:${weekStart}`;
  return {
    id: `weekly-reminder-${digest}`,
    kind: "weekly_summary_reminder",
    sourcePath: `userDomains/${recipient.uid}/performance/reports`,
    sourceRecordId:
      `weekly-progress:${recipient.uid}:${weekStart}`,
    eventId,
    templateVersion: 1,
    recipientUid: recipient.uid,
    to: recipient.email.trim().toLowerCase(),
    subject: "Momentum weekly report due tomorrow",
    text: [
      `Hello ${first},`,
      "",
      "Your Momentum weekly report for " +
        `${weekStart} through ${end} is due tomorrow.`,
      "Submit your weekly summary and next week's three goals " +
        "before Monday closes.",
      "",
      "Open Momentum: https://momentumdis.web.app",
    ].join("\n"),
    idempotencyKey: `momentum-email-v1-${digest}`,
    createdAt,
  };
}
