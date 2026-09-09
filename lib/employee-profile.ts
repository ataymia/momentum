import type { AuditEvent } from "./audit-engine";
import { canManageUser } from "./access";
import { arizonaDateKey } from "./date-time";
import type { HCMState, Shift } from "./hcm-engine";
import type { FieldTrackingState } from "./location-tracking-engine";
import type { Appointment, TimeEntry, WorkspaceData, WorkspaceUser } from "./types";

export const ARIZONA_TIME_ZONE = "America/Phoenix";
export type EmployeePresence = "In field appointment" | "On the clock" | "Off clock" | "No activity";
export type PunctualityEvidence = {
  id: string;
  kind: "Appointment arrival" | "Shift clock-in";
  date: string;
  scheduledTime: string;
  actualTime?: string;
  varianceMinutes?: number;
  sourceId: string;
  accountId?: string;
  note: string;
};

const fieldStatuses = new Set<Appointment["status"]>(["Dispatched", "En route", "Arrived"]);
const salesAppointmentTypes = new Set<Appointment["type"]>(["First visit", "Sample drop", "Placement check", "Reorder"]);

function minutes(value: string) {
  const [hours, minute] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minute;
}

function phoenixParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ARIZONA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function canViewEmployeeManagementDetail(actor: WorkspaceUser | null | undefined, target: WorkspaceUser, data?: WorkspaceData) {
  if (!actor) return false;
  if (actor.role === "Administrator") return true;
  if (!data) {
    if (actor.role !== "Sales Manager") return false;
    return target.id === actor.id || target.managerId === actor.id || (actor.managedTeams ?? []).includes(target.team);
  }
  return canManageUser(data, actor, target.id, true);
}

export function employeePresence(data: WorkspaceData, userId: string, date = arizonaDateKey()): EmployeePresence {
  const activeField = data.appointments.some((appointment) => appointment.ownerId === userId && appointment.date === date && fieldStatuses.has(appointment.status));
  if (activeField) return "In field appointment";
  const activeTime = data.timeEntries.some((entry) => entry.userId === userId && entry.date === date && !entry.clockOut);
  if (activeTime) return "On the clock";
  const anyActivity = data.timeEntries.some((entry) => entry.userId === userId) || data.appointments.some((appointment) => appointment.ownerId === userId) || data.activities.some((activity) => activity.userId === userId);
  return anyActivity ? "Off clock" : "No activity";
}

function entryTimestamp(entry: TimeEntry, time: string | undefined) {
  if (!time) return undefined;
  return new Date(`${entry.date}T${time.slice(0, 5)}:00-07:00`).toISOString();
}

export function lastRecordedEmployeeActivity(data: WorkspaceData, tracking: FieldTrackingState, audit: AuditEvent[], userId: string) {
  const candidates: { at: string; label: string }[] = [];
  audit.filter((event) => event.actorId === userId).forEach((event) => candidates.push({ at: event.at, label: "Platform record activity" }));
  tracking.samples.filter((sample) => sample.userId === userId).forEach((sample) => candidates.push({ at: sample.at, label: "Field device activity" }));
  tracking.appointmentEvents.filter((event) => event.userId === userId).forEach((event) => candidates.push({ at: event.at, label: event.event }));
  data.activities.filter((activity) => activity.userId === userId).forEach((activity) => candidates.push({ at: activity.at, label: activity.title }));
  data.appointments.filter((appointment) => appointment.ownerId === userId && appointment.completedAt).forEach((appointment) => candidates.push({ at: appointment.completedAt!, label: "Appointment completed" }));
  data.timeEntries.filter((entry) => entry.userId === userId).forEach((entry) => {
    const value = entryTimestamp(entry, entry.clockOut ?? entry.clockIn);
    if (value) candidates.push({ at: value, label: entry.clockOut ? "Clocked out" : "Clocked in" });
  });
  return candidates.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
}

export function currentOrNextShift(hcm: HCMState, userId: string, asOf = arizonaDateKey()): Shift | undefined {
  return hcm.shifts
    .filter((shift) => shift.userId === userId && ["Published", "Completed"].includes(shift.status) && shift.date >= asOf)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0];
}

export function appointmentPunctualityEvidence(data: WorkspaceData, tracking: FieldTrackingState, userId: string, start: string, end: string): PunctualityEvidence[] {
  return data.appointments
    .filter((appointment) => appointment.ownerId === userId && salesAppointmentTypes.has(appointment.type) && appointment.date >= start && appointment.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
    .map((appointment) => {
      const arrival = tracking.appointmentEvents
        .filter((event) => event.userId === userId && event.appointmentId === appointment.id && event.event === "Arrival verified")
        .sort((a, b) => a.at.localeCompare(b.at))[0];
      if (!arrival) return { id: `appointment-${appointment.id}`, kind: "Appointment arrival" as const, date: appointment.date, scheduledTime: appointment.startTime, sourceId: appointment.id, accountId: appointment.accountId, note: appointment.status === "Completed" ? "Completed appointment has no verified arrival event." : "Arrival has not been verified yet." };
      const actual = phoenixParts(arrival.at);
      const comparable = actual.date === appointment.date;
      return {
        id: `appointment-${appointment.id}`,
        kind: "Appointment arrival" as const,
        date: appointment.date,
        scheduledTime: appointment.startTime,
        actualTime: actual.time,
        varianceMinutes: comparable ? minutes(actual.time) - minutes(appointment.startTime) : undefined,
        sourceId: arrival.id,
        accountId: appointment.accountId,
        note: comparable ? "Variance is actual verified arrival minus scheduled appointment start. Negative means early; positive means after scheduled start." : "Verified arrival occurred on a different Arizona calendar date; no minute variance is calculated.",
      };
    });
}

export function shiftClockInEvidence(data: WorkspaceData, hcm: HCMState, userId: string, start: string, end: string): PunctualityEvidence[] {
  return hcm.shifts
    .filter((shift) => shift.userId === userId && ["Published", "Completed"].includes(shift.status) && shift.date >= start && shift.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
    .map((shift) => {
      const entry = data.timeEntries.filter((item) => item.userId === userId && item.date === shift.date).sort((a, b) => a.clockIn.localeCompare(b.clockIn))[0];
      return {
        id: `shift-${shift.id}`,
        kind: "Shift clock-in" as const,
        date: shift.date,
        scheduledTime: shift.startTime,
        actualTime: entry?.clockIn,
        varianceMinutes: entry ? minutes(entry.clockIn) - minutes(shift.startTime) : undefined,
        sourceId: entry?.id ?? shift.id,
        note: entry ? "Variance is first clock-in minus scheduled shift start. Negative means early; positive means after scheduled start." : "Published shift has no clock-in record.",
      };
    });
}

export function averageRecordedVariance(records: PunctualityEvidence[]) {
  const values = records.map((record) => record.varianceMinutes).filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}
