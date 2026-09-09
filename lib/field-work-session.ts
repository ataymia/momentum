import type { Appointment, WorkspaceData } from "./types";

export const ACTIVE_FIELD_WORK_STATUSES: Appointment["status"][] = ["Dispatched", "En route", "Arrived"];

export function activeFieldAppointmentForUser(data: WorkspaceData, userId: string) {
  return data.appointments
    .filter((appointment) => appointment.ownerId === userId && ACTIVE_FIELD_WORK_STATUSES.includes(appointment.status))
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))[0];
}

export function fieldWorkBlocksSessionEnd(data: WorkspaceData, userId: string) {
  const appointment = activeFieldAppointmentForUser(data, userId);
  return appointment ? { blocked: true as const, appointmentId: appointment.id, status: appointment.status } : { blocked: false as const };
}
