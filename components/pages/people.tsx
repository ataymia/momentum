"use client";

import { BookOpenCheck, FileText, UserRound, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useHcm } from "../../lib/hcm-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Section, StatusPill, formatDate } from "../ui";
import { PeoplePage as PeoplePageV2 } from "./people-v2";

export function PeoplePage() {
  const { data } = useWorkspace();
  const { hcm } = useHcm();
  const [focusId] = useState(() => typeof window !== "undefined" ? window.sessionStorage.getItem("momentum-focus-record") : null);
  const training = focusId ? hcm.training.find((item) => item.id === focusId) : undefined;
  const workflow = focusId ? hcm.workflows.find((item) => item.id === focusId) : undefined;
  const employee = focusId ? data.users.find((item) => item.id === focusId && item.role !== "Customer") : undefined;
  const course = training ? hcm.courses.find((item) => item.id === training.courseId) : undefined;
  const workflowEmployee = workflow ? data.users.find((item) => item.id === workflow.userId) : undefined;
  const manager = employee?.managerId ? data.users.find((item) => item.id === employee.managerId) : undefined;
  const hasFocusedRecord = Boolean(training || workflow || employee);

  useEffect(() => {
    if (!hasFocusedRecord || !focusId) return;
    const handle = window.setTimeout(() => document.getElementById("people-focused-source")?.scrollIntoView({ behavior:"smooth", block:"start" }), 0);
    return () => window.clearTimeout(handle);
  }, [focusId, hasFocusedRecord]);

  return <>
    {hasFocusedRecord && <div id="people-focused-source" className="people-focused-source"><Section title="Opened HR record" description="Momentum preserved the exact source record that brought you here."><div className="company-request-list">
      {training && <article className="is-focused"><span><BookOpenCheck size={18}/></span><div><small>Training assignment{training.dueDate ? ` · due ${formatDate(training.dueDate,{month:"short",day:"numeric"})}` : ""}</small><strong>{course?.title ?? "Assigned training"}</strong><p>{course?.description ?? "Training assignment"}</p></div><StatusPill tone={training.status === "Complete" ? "success" : "warning"}>{training.status}</StatusPill></article>}
      {workflow && <article className="is-focused"><span><FileText size={18}/></span><div><small>{workflowEmployee?.name ?? "Employee"} · {workflow.type}</small><strong>{workflow.title}</strong><p>{workflow.detail}</p></div><StatusPill tone={workflow.status === "Approved" ? "success" : workflow.status === "Returned" ? "danger" : "warning"}>{workflow.status}</StatusPill></article>}
      {employee && <article className="is-focused"><span><UserRound size={18}/></span><div><small>{employee.role} · {employee.team}</small><strong>{employee.name}</strong><p>{employee.title} · {employee.email}{manager ? ` · reports to ${manager.name}` : ""}</p></div><StatusPill tone="info">Workforce record</StatusPill></article>}
    </div></Section></div>}
    <PeoplePageV2/>
  </>;
}
