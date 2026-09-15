"use client";

import { BookOpenCheck, Link2, Plus, Trash2, Upload } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useHcm } from "../../lib/hcm-context";
import { appendAudit, type Course } from "../../lib/hcm-engine";
import { useTrainingLibrary } from "../../lib/training-library-context";
import type { TrainingMaterialKind } from "../../lib/training-library-engine";
import type { Role } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill } from "../ui";
import { TrainingMaterialLink } from "./training-material-link";

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
  const [upload, setUpload] = useState({ title:"", kind:"Document" as TrainingMaterialKind, description:"", busy:false });
  const [uploadKey, setUploadKey] = useState(0);
  // Course edits are staged locally so one round of typing produces one version bump and one audit event.
  const [edit, setEdit] = useState<{ courseId: string; title: string; category: string; description: string } | null>(null);
  const draft = edit?.courseId === selectedId ? edit : selected ? { courseId: selected.id, title: selected.title, category: selected.category, description: selected.description } : null;
  const dirty = Boolean(selected && draft && (draft.title !== selected.title || draft.category !== selected.category || draft.description !== selected.description));
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

  const saveCourseDetails = () => {
    if (!selected || !draft) return;
    if (draft.title.trim().length < 2 || draft.description.trim().length < 4) { setError("Enter a module title and description."); return; }
    setError("");
    updateCourse({ title: draft.title.trim(), category: draft.category.trim() || "Training", description: draft.description.trim() });
    setNotice(`${draft.title.trim()} saved as version ${selected.version + 1}.`);
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

  const uploadMaterial = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || upload.busy) return;
    const form = event.target as HTMLFormElement;
    const input = form.elements.namedItem("training-file") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) { setError("Choose a file to upload."); return; }
    setError(""); setNotice(""); setUpload((current) => ({ ...current, busy: true }));
    const result = await library.uploadMaterial(selected.id, { title: upload.title, kind: upload.kind, description: upload.description, file });
    setUpload((current) => ({ ...current, busy: false }));
    if (!result.ok) { setError(result.message); return; }
    setUpload({ title:"", kind:"Document", description:"", busy:false }); setUploadKey((current) => current + 1);
    setNotice("Training file uploaded to Firebase Storage. Only provisioned employees can open it, through their signed-in Momentum session.");
  };

  return <div className="page page--focused-tool">
    <PageHeader eyebrow="Human Resources" title="Training setup" description="Administrator control for every training module. Configure the audience, module text and linked videos/materials without giving managers HR or Administrator permissions."/>
    {notice&&<p className="form-notice" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}

    <Section title="Training library" description="Choose a module to configure it." action={<StatusPill tone="neutral">{activeCourses.length} active</StatusPill>}>
      <div className="provisioning-queue">{hcm.courses.map((course)=><article key={course.id} className={selectedId===course.id?"is-selected":""}><span className="provisioning-avatar"><BookOpenCheck size={18}/></span><div><strong>{course.title}</strong><p>{course.category}</p><small>Version {course.version} · {course.active?"Active":"Inactive"}</small></div><Button size="sm" variant={selectedId===course.id?"primary":"secondary"} onClick={()=>setSelectedId(course.id)}>Configure</Button></article>)}</div>
    </Section>

    {selected&&<Section title={selected.title} description="Changes here are Administrator-controlled and apply to future and currently assigned training displays.">
      <div className="form-grid">
        <Field label="Module title"><input value={draft?.title??""} onChange={(event)=>setEdit({courseId:selected.id,title:event.target.value,category:draft?.category??selected.category,description:draft?.description??selected.description})}/></Field>
        <Field label="Category"><input value={draft?.category??""} onChange={(event)=>setEdit({courseId:selected.id,title:draft?.title??selected.title,category:event.target.value,description:draft?.description??selected.description})}/></Field>
        <Field label="Version"><input value={`v${selected.version}`} readOnly aria-readonly="true"/></Field>
        <Field label="Description" className="field--full"><textarea rows={3} value={draft?.description??""} onChange={(event)=>setEdit({courseId:selected.id,title:draft?.title??selected.title,category:draft?.category??selected.category,description:event.target.value})}/></Field>
      </div>
      <div className="provisioning-row-actions"><Button size="sm" disabled={!dirty} onClick={saveCourseDetails}>Save module changes</Button>{dirty&&<Button size="sm" variant="ghost" onClick={()=>setEdit(null)}>Discard</Button>}</div>
      <div className="training-picker"><strong>Who should receive this module by default?</strong>{employeeRoles.map((role)=><label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={()=>toggleRole(role)}/><span><strong>{role}</strong><small>{role==="Brand Ambassador"?"Sampling and activation team":"Role audience"}</small></span></label>)}</div>
      <div className="provisioning-row-actions"><Button size="sm" variant={selected.active?"secondary":"primary"} onClick={()=>updateCourse({active:!selected.active})}>{selected.active?"Deactivate module":"Reactivate module"}</Button></div>
      <div className="onboarding-doc-review">{materials.map((item)=><div key={item.id}><span><Link2 size={15}/><span><strong>{item.title}</strong><TrainingMaterialLink material={item}/></span></span><Button size="sm" variant="ghost" icon={<Trash2 size={14}/>} onClick={()=>library.removeMaterial(item.id)}>Remove</Button></div>)}</div>
      <form className="provisioning-form" onSubmit={addMaterial}><div className="form-grid"><Field label="Material title"><input required value={material.title} onChange={(event)=>setMaterial({...material,title:event.target.value})} placeholder="5-minute BA training video"/></Field><Field label="Type"><select value={material.kind} onChange={(event)=>setMaterial({...material,kind:event.target.value as TrainingMaterialKind})}><option>Video</option><option>Link</option><option>Document</option></select></Field><Field label="Link" className="field--full"><input required type="url" value={material.url} onChange={(event)=>setMaterial({...material,url:event.target.value})} placeholder="https://..."/></Field><Field label="Description" className="field--full"><input value={material.description} onChange={(event)=>setMaterial({...material,description:event.target.value})}/></Field></div><div className="provisioning-actions"><Button type="submit" icon={<Plus size={15}/>}>Add link</Button></div></form>
      <form className="provisioning-form" key={uploadKey} onSubmit={(event)=>void uploadMaterial(event)}><div className="form-grid"><Field label="Uploaded material title"><input required value={upload.title} onChange={(event)=>setUpload({...upload,title:event.target.value})} placeholder="Brand Ambassador field guide"/></Field><Field label="Type"><select value={upload.kind} onChange={(event)=>setUpload({...upload,kind:event.target.value as TrainingMaterialKind})}><option>Document</option><option>Video</option><option>Link</option></select></Field><Field label="File" className="field--full"><input required name="training-file" type="file"/></Field><Field label="Description" className="field--full"><input value={upload.description} onChange={(event)=>setUpload({...upload,description:event.target.value})}/></Field></div><div className="provisioning-actions"><Button type="submit" disabled={upload.busy} icon={<Upload size={15}/>}>{upload.busy?"Uploading…":"Upload training file"}</Button></div></form>
      <p className="form-help">Uploaded files are stored at <code>training/{selected.id}/…</code> in Firebase Storage. They are never public: only an Administrator may upload or delete them, and employees open them through their signed-in Momentum session.</p>
    </Section>}

    <Section title="Create training module" description="Use this for a new role, policy, product or field-training module."><form className="provisioning-form" onSubmit={createCourse}><div className="form-grid"><Field label="Title"><input required value={newCourse.title} onChange={(event)=>setNewCourse({...newCourse,title:event.target.value})}/></Field><Field label="Category"><input required value={newCourse.category} onChange={(event)=>setNewCourse({...newCourse,category:event.target.value})}/></Field><Field label="Description" className="field--full"><textarea required rows={3} value={newCourse.description} onChange={(event)=>setNewCourse({...newCourse,description:event.target.value})}/></Field></div><div className="training-picker">{employeeRoles.map((role)=><label key={role}><input type="checkbox" checked={newCourse.roles.includes(role)} onChange={()=>setNewCourse((current)=>({...current,roles:current.roles.includes(role)?current.roles.filter((item)=>item!==role):[...current.roles,role]}))}/><span><strong>{role}</strong></span></label>)}</div><div className="provisioning-actions"><Button type="submit" icon={<Plus size={15}/>}>Create module</Button></div></form></Section>
  </div>;
}
