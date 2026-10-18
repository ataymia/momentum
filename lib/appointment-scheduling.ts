import { isValidCalendarDateKey } from "./date-time";
import type { Appointment } from "./types";

const timeToMinutes = (value: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
};

export type AppointmentSlot = {
  ownerId?: string;
  date: string;
  startTime: string;
  duration: number;
  excludeId?: string;
};

/** A visit must fit on one valid local calendar day; never accept malformed time values. */
export function validAppointmentSlot(slot: Pick<AppointmentSlot, "date" | "startTime" | "duration">) {
  const start = timeToMinutes(slot.startTime);
  return isValidCalendarDateKey(slot.date) &&
    Number.isFinite(start) &&
    Number.isInteger(slot.duration) &&
    slot.duration > 0 &&
    start + slot.duration <= 24 * 60;
}

/** Return the conflicting appointment when an employee would be double-booked. */
export function appointmentConflict(appointments: readonly Appointment[], slot: AppointmentSlot) {
  if (!slot.ownerId || !validAppointmentSlot(slot)) return undefined;
  const start = timeToMinutes(slot.startTime);
  const end = start + slot.duration;
  return appointments.find((appointment) => {
    if (appointment.id === slot.excludeId || appointment.ownerId !== slot.ownerId || appointment.date !== slot.date) return false;
    if (["Completed", "Needs follow-up"].includes(appointment.status)) return false;
    if (!validAppointmentSlot(appointment)) return false;
    const existingStart = timeToMinutes(appointment.startTime);
    return start < existingStart + appointment.duration && existingStart < end;
  });
}
