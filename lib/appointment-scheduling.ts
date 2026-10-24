import type { Appointment } from "./types";
import { isValidCalendarDateKey } from "./date-time";

const timeToMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
};

export type AppointmentSlot = {
  ownerId?: string;
  date: string;
  startTime: string;
  duration: number;
  excludeId?: string;
};

/** An appointment must use a real date, a 24-hour clock time, and end by midnight. */
export function isValidAppointmentSlot(slot: Pick<AppointmentSlot, "date" | "startTime" | "duration">) {
  const start = timeToMinutes(slot.startTime);
  return isValidCalendarDateKey(slot.date)
    && Number.isFinite(start)
    && Number.isInteger(slot.duration)
    && slot.duration > 0
    && start + slot.duration <= 24 * 60;
}

/** Return the conflicting appointment when an employee would be double-booked. */
export function appointmentConflict(appointments: readonly Appointment[], slot: AppointmentSlot) {
  if (!slot.ownerId || !isValidAppointmentSlot(slot)) return undefined;
  const start = timeToMinutes(slot.startTime);
  const end = start + slot.duration;
  return appointments.find((appointment) => {
    if (appointment.id === slot.excludeId || appointment.ownerId !== slot.ownerId || appointment.date !== slot.date) return false;
    if (["Completed", "Needs follow-up"].includes(appointment.status)) return false;
    if (!isValidAppointmentSlot(appointment)) return false;
    const existingStart = timeToMinutes(appointment.startTime);
    const existingEnd = existingStart + appointment.duration;
    return start < existingEnd && existingStart < end;
  });
}
