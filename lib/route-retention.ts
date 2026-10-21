import { addCalendarDays, arizonaDateKey } from "./date-time";

export const ROUTE_RETENTION_DAYS = 10;
/** Inclusive calendar-day retention: today and nine preceding Arizona days. */
export function routeRetentionStart(reference: Date | string = new Date()): string {
  return addCalendarDays(arizonaDateKey(reference), -(ROUTE_RETENTION_DAYS - 1));
}
export function routeDateWithinRetention(dateKey: string, reference: Date | string = new Date()): boolean {
  return dateKey >= routeRetentionStart(reference) && dateKey <= arizonaDateKey(reference);
}
export function retainRouteEvidence<T extends { at: string }>(rows: readonly T[], reference: Date | string = new Date()): T[] {
  return rows.filter((row) => {
    const date = new Date(row.at);
    return Number.isFinite(date.getTime()) && routeDateWithinRetention(arizonaDateKey(date), reference);
  });
}
export function routeReviewDates(reference: Date | string = new Date()): string[] {
  const today = arizonaDateKey(reference);
  return Array.from({ length: ROUTE_RETENTION_DAYS }, (_, index) => addCalendarDays(today, -index));
}
