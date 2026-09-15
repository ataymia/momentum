"use client";

import { BookOpenCheck, Link2, Plus, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useHcm } from "../../lib/hcm-context";
import { appendAudit, type Course } from "../../lib/hcm-engine";
import { useTrainingLibrary } from "../../lib/training-library-context";
import type { TrainingMaterialKind } from "../../lib/training-library-engine";
import type { Role } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill } from "../ui";

const employeeRoles: Role[] = ["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse"];
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const teamsForRoles = (roles: Role[]) => [...new Set(roles.map((role) => role === "Administrator" ? "Leadership" : ["Sales Manager","Sales Representative","Brand Ambassador"].includes(role) ? "Sales" : "Operations"))];

const defaultRolesForCourse = (course: Course): Role[] => {
  const roles: Role[] = [];
  if (course.requiredForTeams.includes("Leadership")) roles.push("Administrator");
  if (course.requiredForTeams.includes("Sales")) roles.push("Sales Manager","Sales Representative","Brand Ambassador");
  if (course.requiredForTeams.includes("Operations")) roles.push("Operations","Warehouse");
  return roles;
};

export function TrainingAdminPage() {
  const { currentUser } = useWorkspace();
  const { hcm, setHcm } = useHcm();
  const library = useTrainingLibrary();
  const [selectedId, setSelectedId] = useState(hcm.courses[0]?.id ?? "");
  const selected = hcm.courses.find((course) => course.id === selectedId);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [newCourse, setNewCourse] = useState({ title:"", category:"Onboarding", description:"", roles:["Brand Ambassador"] as Role[] });
  const [material, setMaterial] = useState({ title:"", kind:"Video" as TrainingMaterialKind, url:"", description:"" });
  const roles = selected ? (library.rolesForCourse(selected.id).length ? library.rolesForCourse(selected.id) : defaultRolesForCourse(selected)) : [];
  const materials = selected ? library.materialsForCourse(selected.id) : [];
  const activeCourses = useMemo(() => hcm.courses.filter((course) => course.active), [hcm.courses]);

  if (currentUser?.role !== "Administrator") return null;

  const updateCourse = (patch: Partial<Course>) => {
    if (!selected) return;
    setHcm((state) => appendAudit({ ...state, courses: state.courses.map((course) => course.id === selected.id ? { ...course, ...patch, version: patch.version ?? course.version + 1 } : course) }, { actorId: currentUser.id, action: "Updated training module", entityType: "Course", entityId: selected.id, reason: "Administrator training configuration" }));
  };

  const toggleRole = (role: Role) => {
    if (!selected) return;
    const next = roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role];
    library.setCourseRoles(selected.id, next);
    updateCourse({ requiredForTeams: teamsForRoles(next) });
  };

  const createCourse = (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    if (newCourse.title.trim().length < 2 || newCourse.description.trim().length < 4 || !newCourse.roles.length) { setError("Enter a title, description, and at least one role audience."); return; }
    const courseId = id("course");
    const course: Course = { id:courseId,title:newCourse.title.trim(),category:newCourse.category.trim()||"Training",active:true,description:newCourse.description.trim(),requiredForTeams:teamsForRoles(newCourse.roles),version:1 };
    setHcm((state) => appendAudit({ ...state, courses:[course,...state.courses] }, { actorId: currentUser.id, action:"Created training module", entityType:"Course", entityId:courseId, reason:"Administrator training configuration" }));
    library.setCourseRoles(courseId,newCourse.roles);
    setSelectedId(courseId); setNewCourse({title:"",category:"Onboarding",description:"",roles:["Brand Ambassador"]}); setNotice("Training module created.");
  };

  const addMaterial = (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    const result = library.addMaterial(selected.id,material);
    if (!result.ok) { setError(result.message); return; }
    setError(""); setNotice("Training material added. Employees assigned this module can open the link immediately."); setMaterial({title:"",kind:"Video",url:"",description:""});
  };

  return <div className="page page--focused-tool">
    <PageHeader eyebrow="Human Resources" title="Training setup" description="Administrator control for every training module. Configure the audience, module text and linked videos/materials without giving managers HR or Administrator permissions."/>
    {notice&&<p className="form-notice" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}

    <Section title="Training library" description="Choose a module to configure it." action={<StatusPill tone="neutral">{activeCourses.length} active</StatusPill>}>
      <div className="provisioning-queue">{hcm.courses.map((course)=><article key={course.id} className={selectedId===course.id?"is-selected":""}><span className="provisioning-avatar"><BookOpenCheck size={18}/></span><div><strong>{course.title}</strong><p>{course.category}</p><small>Version {course.version} · {course.active?"Active":"Inactive"}</small></div><Button size="sm" variant={selectedId===course.id?"primary":"secondary"} onClick={()=>setSelectedId(course.id)}>Configure</Button></article>)}</div>
    </Section>

    {selected&&<Section title={selected.title} description="Changes here are Administrator-controlled and apply to future and currently assigned training displays.">
      <div className="form-grid">
        <Field label="Module title"><input value={selected.title} onChange={(event)=>updateCourse({title:event.target.value})}/></Field>
        <Field label="Category"><input value={selected.category} onChange={(event)=>updateCourse({category:event.target.value})}/></Field>
        <Field label="Description" className="field--full"><textarea rows={3} value={selected.description} onChange={(event)=>updateCourse({description:event.target.value})}/></Field>
      </div>
      <div className="training-picker"><strong>Who should receive this module by default?</strong>{employeeRoles.map((role)=><label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={()=>toggleRole(role)}/><span><strong>{role}</strong><small>{role==="Brand Ambassador"?"Sampling and activation team":"Role audience"}</small></span></label>)}</div>
      <div className="provisioning-row-actions"><Button size="sm" variant={selected.active?"secondary":"primary"} onClick={()=>updateCourse({active:!selected.active})}>{selected.active?"Deactivate module":"Reactivate module"}</Button></div>
      <div className="onboarding-doc-review">{materials.map((item)=><div key={item.id}><span><Link2 size={15}/><span><strong>{item.title}</strong><small>{item.kind} · {item.url}</small></span></span><Button size="sm" variant="ghost" icon={<Trash2 size={14}/>} onClick={()=>library.removeMaterial(item.id)}>Remove</Button></div>)}</div>
      <form className="provisioning-form" onSubmit={addMaterial}><div className="form-grid"><Field label="Material title"><input required value={material.title} onChange={(event)=>setMaterial({...material,title:event.target.value})} placeholder="5-minute BA training video"/></Field><Field label="Type"><select value={material.kind} onChange={(event)=>setMaterial({...material,kind:event.target.value as TrainingMaterialKind})}><option>Video</option><option>Link</option><option>Document</option></select></Field><Field label="Link" className="field--full"><input required type="url" value={material.url} onChange={(event)=>setMaterial({...material,url:event.target.value})} placeholder="https://..."/></Field><Field label="Description" className="field--full"><input value={material.description} onChange={(event)=>setMaterial({...material,description:event.target.value})}/></Field></div><div className="provisioning-actions"><Button type="submit" icon={<Plus size={15}/>}>Add material</Button></div></form>
      <p className="form-help">Secure file upload is not connected yet, so Momentum stores links to videos/documents rather than pretending a file was uploaded.</p>
    </Section>}

    <Section title="Create training module" description="Use this for a new role, policy, product or field-training module."><form className="provisioning-form" onSubmit={createCourse}><div className="form-grid"><Field label="Title"><input required value={newCourse.title} onChange={(event)=>setNewCourse({...newCourse,title:event.target.value})}/></Field><Field label="Category"><input required value={newCourse.category} onChange={(event)=>setNewCourse({...newCourse,category:event.target.value})}/></Field><Field label="Description" className="field--full"><textarea required rows={3} value={newCourse.description} onChange={(event)=>setNewCourse({...newCourse,description:event.target.value})}/></Field></div><div className="training-picker">{employeeRoles.map((role)=><label key={role}><input type="checkbox" checked={newCourse.roles.includes(role)} onChange={()=>setNewCourse((current)=>({...current,roles:current.roles.includes(role)?current.roles.filter((item)=>item!==role):[...current.roles,role]}))}/><span><strong>{role}</strong></span></label>)}</div><div className="provisioning-actions"><Button type="submit" icon={<Plus size={15}/>}>Create module</Button></div></form></Section>
  </div>;
}
