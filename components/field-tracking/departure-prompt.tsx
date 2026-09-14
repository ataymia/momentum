"use client";

import { MapPin, Route } from "lucide-react";
import { useState } from "react";
import { useFieldTracking } from "../../lib/location-tracking-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal } from "../ui";

export function DeparturePrompt() {
  const { currentUser, data, activePage, navigate } = useWorkspace();
  const { state, documentOffsiteContinuation } = useFieldTracking();
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (!currentUser || currentUser.role !== "Sales Representative") return null;
  const alert = state.departureAlerts
    .filter((item) => item.userId === currentUser.id && item.status === "Open")
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))[0];
  if (!alert || activePage === "dispatch") return null;
  const appointment = data.appointments.find((item) => item.id === alert.appointmentId);
  const account = data.accounts.find((item) => item.id === alert.accountId);
  if (!appointment) return null;

  const goToCloseout = () => {
    sessionStorage.setItem("momentum-focus-record", appointment.id);
    navigate("dispatch");
  };
  const continueOffsite = () => {
    const result = documentOffsiteContinuation(appointment.id, reason);
    if (!result.ok) { setError(result.message ?? "Add the reason this appointment is continuing away from the customer location."); return; }
    setExceptionOpen(false);
    setReason("");
    setError("");
  };

  return <>
    <Modal
      open={!exceptionOpen}
      title="Customer location exited"
      description={`The work tablet moved outside the 2-mile location radius for ${account?.locationName ?? account?.name ?? "this appointment"}. Field presence has ended. Complete the appointment or document why the customer meeting is continuing offsite.`}
      onClose={goToCloseout}
      footer={<><Button variant="secondary" onClick={() => setExceptionOpen(true)}>Continue offsite</Button><Button onClick={goToCloseout}>Complete closeout</Button></>}
    >
      <div className="form-callout"><MapPin size={18}/><p>Departure was recorded at {new Date(alert.triggeredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. The appointment remains open only so its required disposition and notes can be completed.</p></div>
    </Modal>
    <Modal
      open={exceptionOpen}
      title="Document offsite continuation"
      description="Use this when the customer interaction legitimately continues away from the recorded business location, such as a meal or another agreed meeting place. The original geofence departure remains in history."
      onClose={() => { setExceptionOpen(false); setError(""); }}
      footer={<><Button variant="ghost" onClick={() => setExceptionOpen(false)}>Back</Button><Button onClick={continueOffsite}>Continue appointment</Button></>}
    >
      <Field label="Reason for continuing outside the radius"><textarea rows={4} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain where the customer interaction is continuing and why." /></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-callout"><Route size={18}/><p>Location tracking continues on the work tablet. This exception only explains why the appointment remains active after leaving the customer geofence.</p></div>
    </Modal>
  </>;
}
