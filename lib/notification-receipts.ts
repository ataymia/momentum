import {usableNotificationTime} from "./notification-display-time";

/**
 * Read receipts are scoped to one signed-in user, never shared between users.
 * They are presentation state, not proof of delivery or a business event.
 */
export const MAX_READ_RECEIPTS = 2000;
export const STATUS_BELL_WINDOW_DAYS = 30;

export function parseReadReceipts(input: unknown): Set<string> {
  if (!Array.isArray(input)) return new Set<string>();
  const ids = input.filter((item): item is string =>
    typeof item === "string" && item.length > 0 && item.length <= 500);
  return new Set(ids.slice(-MAX_READ_RECEIPTS));
}

/** Additive merge prevents an old tab from undoing clears written by another tab. */
export function mergeReadReceipts(...sets: ReadonlySet<string>[]): Set<string> {
  const ids = new Set<string>();
  for (const source of sets) {
    for (const id of source) {
      if (typeof id !== "string" || !id || id.length > 500) continue;
      ids.delete(id);
      ids.add(id);
    }
  }
  return new Set([...ids].slice(-MAX_READ_RECEIPTS));
}

/** The bell is not a historical status feed. Undated/old *status* changes
 * remain in source records and Audit; they must not backfill unread counts.
 * Active review/action notices use their own lifecycle and do not expire here.
 */
export function recentRecordedStatus(occurredAt: string | undefined, now: Date): boolean {
  if (!usableNotificationTime(occurredAt)) return false;
  const occurred = Date.parse(occurredAt);
  const current = now.getTime();
  return Number.isFinite(occurred) && Number.isFinite(current) &&
    occurred >= current - STATUS_BELL_WINDOW_DAYS * 86_400_000 &&
    occurred <= current + 5 * 60_000;
}

/** One shared predicate for the badge and the popover. Historical status records
 * remain available in their source modules; only live action/reminders and
 * recently evidenced status updates belong in the notification bell.
 */
export function shouldSurfaceBellIntent(
  intent:{importance:"critical"|"action"|"status"|"reminder";occurredAt?:string},
  now:Date,
):boolean{
  return intent.importance!=="status"||recentRecordedStatus(intent.occurredAt,now);
}
