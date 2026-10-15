import type { Appointment } from "./types";
import { isValidCalendarDateKey } from "./date-time";

const timeToMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : Number.NaN;
};

export type AppointmentSlot = {
  ownerId?: string;
  date: string;
  startTime: string;
  duration: number;
  excludeId?: string;
};

/** Reject invalid dates, clock times, durations, and appointments crossing midnight. */
export function appointmentSlotIsValid(slot: Pick<AppointmentSlot, "date" | "startTime" | "duration">): boolean {
  const start = timeToMinutes(slot.startTime);
  return isValidCalendarDateKey(slot.date) && Number.isFinite(start) && Number.isInteger(slot.duration)
    && slot.duration > 0 && start + slot.duration <= 24 * 60;
}

/** Return the conflicting appointment when an employee would be double-booked. */
export function appointmentConflict(appointments: readonly Appointment[], slot: AppointmentSlot) {
  if (!slot.ownerId || !appointmentSlotIsValid(slot)) return undefined;
  const start = timeToMinutes(slot.startTime);
  if (!Number.isFinite(start)) return undefined;
  const end = start + slot.duration;
  return appointments.find((appointment) => {
    if (appointment.id === slot.excludeId || appointment.ownerId !== slot.ownerId || appointment.date !== slot.date) return false;
    if (["Completed", "Needs follow-up"].includes(appointment.status)) return false;
    const existingStart = timeToMinutes(appointment.startTime);
    if (!Number.isFinite(existingStart) || !Number.isInteger(appointment.duration) || appointment.duration < 1) return false;
    const existingEnd = existingStart + appointment.duration;
    return start < existingEnd && existingStart < end;
  });
}
