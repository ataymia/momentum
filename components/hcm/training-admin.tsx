"use client";

import { BookOpenCheck, FileText, Link2, Plus, Search, Trash2, Upload, UsersRound } from "lucide-react";
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

type TrainingTab = "details" | "audience" | "materials";
type TrainingMode = "manage" | "create";

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
  const [mode, setMode] = useState<TrainingMode>("manage");
  const [tab, setTab] = useState<TrainingTab>("details");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [newCourse, setNewCourse] = useState({ title:"", category:"Onboarding", description:"", roles:["Brand Ambassador"] as Role[] });
  const [material, setMaterial] = useState({ title:"", kind:"Video" as TrainingMaterialKind, url:"", description:"" });
  const [upload, setUpload] = useState({ title:"", kind:"Document" as TrainingMaterialKind, description:"", busy:false });
  const [uploadKey, setUploadKey] = useState(0);
  const [edit, setEdit] = useState<{ courseId: string; title: string; category: string; description: string } | null>(null);

  const selected = hcm.courses.find((course) => course.id === selectedId);
  const draft = edit?.courseId === selectedId ? edit : selected ? { courseId: selected.id, title: selected.title, category: selected.category, description: selected.description } : null;
  const dirty = Boolean(selected && draft && (draft.title !== selected.title || draft.category !== selected.category || draft.description !== selected.description));
  const roles = selected ? (library.rolesForCourse(selected.id).length ? library.rolesForCourse(selected.id) : defaultRolesForCourse(selected)) : [];
  const materials = selected ? library.materialsForCourse(selected.id) : [];
  const activeCourses = useMemo(() => hcm.courses.filter((course) => course.active), [hcm.courses]);
  const totalMaterials = useMemo(() => hcm.courses.reduce((sum, course) => sum + library.materialsForCourse(course.id).length, 0), [hcm.courses, library]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCourses = hcm.courses.filter((course) => !normalizedQuery || `${course.title} ${course.category} ${course.description}`.toLowerCase().includes(normalizedQuery));

  if (currentUser?.role !== "Administrator") return null;

  const selectCourse = (courseId: string) => {
    setSelectedId(courseId);
    setMode("manage");
    setTab("details");
    setEdit(null);
    setError("");
    setNotice("");
  };

  const updateCourse = (patch: Partial<Course>) => {
    if (!selected) return;
    setHcm((state) => appendAudit({ ...state, courses: state.courses.map((course) => course.id === selected.id ? { ...course, ...patch, version: patch.version ?? course.version + 1 } : course) }, { actorId: currentUser.id, action: "Updated training module", entityType: "Course", entityId: selected.id, reason: "Administrator training configuration" }));
  };

  const toggleRole = (role: Role) => {
    if (!selected) return;
    const next = roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role];
    if (!next.length) { setError("A training module needs at least one role audience."); return; }
    setError("");
    library.setCourseRoles(selected.id, next);
    updateCourse({ requiredForTeams: teamsForRoles(next) });
  };

  const saveCourseDetails = () => {
    if (!selected || !draft) return;
    if (draft.title.trim().length < 2 || draft.description.trim().length < 4) { setError("Enter a module title and description."); return; }
    setError("");
    updateCourse({ title: draft.title.trim(), category: draft.category.trim() || "Training", description: draft.description.trim() });
    setEdit(null);
    setNotice(`${draft.title.trim()} saved as version ${selected.version + 1}.`);
  };

  const createCourse = (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    if (newCourse.title.trim().length < 2 || newCourse.description.trim().length < 4 || !newCourse.roles.length) { setError("Enter a title, description, and at least one role audience."); return; }
    const courseId = id("course");
    const course: Course = { id:courseId,title:newCourse.title.trim(),category:newCourse.category.trim()||"Training",active:true,description:newCourse.description.trim(),requiredForTeams:teamsForRoles(newCourse.roles),version:1 };
    setHcm((state) => appendAudit({ ...state, courses:[course,...state.courses] }, { actorId: currentUser.id, action:"Created training module", entityType:"Course", entityId:courseId, reason:"Administrator training configuration" }));
    library.setCourseRoles(courseId,newCourse.roles);
    setSelectedId(courseId);
    setNewCourse({title:"",category:"Onboarding",description:"",roles:["Brand Ambassador"]});
    setMode("manage");
    setTab("details");
    setNotice("Training module created. Add materials or adjust the audience when you are ready.");
  };

  const addMaterial = (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    const result = library.addMaterial(selected.id,material);
    if (!result.ok) { setError(result.message); return; }
    setError(""); setNotice("Linked training material added."); setMaterial({title:"",kind:"Video",url:"",description:""});
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
    setNotice("Training file uploaded securely to Firebase Storage.");
  };

  const toggleNewRole = (role: Role) => setNewCourse((current) => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role] }));

  return <div className="page page--focused-tool page--training-admin">
    <PageHeader
      eyebrow="Human Resources"
      title="Training setup"
      description="Build, assign, and maintain role-based training from one control center. Select a module to edit it, or create a new one when the content does not exist yet."
      actions={<Button icon={<Plus size={15}/>} onClick={()=>{setMode("create");setError("");setNotice("")}}>New module</Button>}
    />

    {notice&&<p className="form-notice training-admin-feedback" role="status">{notice}</p>}
    {error&&<p className="form-error training-admin-feedback" role="alert">{error}</p>}

    <div className="training-admin-stats" aria-label="Training library summary">
      <div><span>Modules</span><strong>{hcm.courses.length}</strong><small>Total training modules</small></div>
      <div><span>Active</span><strong>{activeCourses.length}</strong><small>Currently assignable</small></div>
      <div><span>Materials</span><strong>{totalMaterials}</strong><small>Links, videos, and files</small></div>
      <div><span>Selected</span><strong>{selected ? `v${selected.version}` : "—"}</strong><small>{selected?.title ?? "Choose a module"}</small></div>
    </div>

    <div className="training-admin-shell">
      <aside className="training-library-panel" aria-label="Training modules">
        <div className="training-library-panel__header">
          <div><span>Training library</span><strong>{hcm.courses.length} modules</strong></div>
          <Button size="sm" variant="secondary" icon={<Plus size={14}/>} onClick={()=>{setMode("create");setError("");setNotice("")}}>New</Button>
        </div>
        <label className="training-library-search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search modules" aria-label="Search training modules"/></label>
        <div className="training-library-list">
          {visibleCourses.map((course)=>{
            const courseRoles = library.rolesForCourse(course.id).length ? library.rolesForCourse(course.id) : defaultRolesForCourse(course);
            const courseMaterials = library.materialsForCourse(course.id).length;
            return <button type="button" key={course.id} className={mode==="manage"&&selectedId===course.id?"is-selected":""} onClick={()=>selectCourse(course.id)}>
              <span className="training-library-list__icon"><BookOpenCheck size={17}/></span>
              <span className="training-library-list__copy"><strong>{course.title}</strong><small>{course.category} · {courseRoles.length} role{courseRoles.length===1?"":"s"} · {courseMaterials} material{courseMaterials===1?"":"s"}</small></span>
              <StatusPill tone={course.active?"success":"neutral"}>{course.active?"Active":"Inactive"}</StatusPill>
            </button>;
          })}
          {!visibleCourses.length&&<div className="training-library-empty">No modules match “{query}”.</div>}
        </div>
      </aside>

      <main className="training-editor-panel">
        {mode==="create" ? <Section title="Create a training module" description="Start with the learning objective and audience. Add links, videos, or uploaded files after the module is created." className="training-editor-section">
          <form className="training-create-form" onSubmit={createCourse}>
            <div className="form-grid">
              <Field label="Module title"><input required value={newCourse.title} onChange={(event)=>setNewCourse({...newCourse,title:event.target.value})} placeholder="Brand Ambassador event readiness"/></Field>
              <Field label="Category"><input required value={newCourse.category} onChange={(event)=>setNewCourse({...newCourse,category:event.target.value})} placeholder="Onboarding"/></Field>
              <Field label="Description" className="field--full" hint="Describe what the employee should know or be able to do after this module."><textarea required rows={4} value={newCourse.description} onChange={(event)=>setNewCourse({...newCourse,description:event.target.value})}/></Field>
            </div>
            <div className="training-audience-block">
              <div className="training-audience-block__heading"><UsersRound size={18}/><div><strong>Role audience</strong><p>Choose the roles that should receive this module by default.</p></div></div>
              <div className="training-role-grid">{employeeRoles.map((role)=><label key={role} className={newCourse.roles.includes(role)?"is-selected":""}><input type="checkbox" checked={newCourse.roles.includes(role)} onChange={()=>toggleNewRole(role)}/><span><strong>{role}</strong><small>{role==="Brand Ambassador"?"Sampling and activation team":"Momentum role"}</small></span></label>)}</div>
            </div>
            <div className="training-editor-actions"><Button type="button" variant="ghost" onClick={()=>setMode("manage")}>Cancel</Button><Button type="submit" icon={<Plus size={15}/>}>Create module</Button></div>
          </form>
        </Section> : selected ? <>
          <div className="training-editor-heading">
            <div><span>{selected.category}</span><h2>{selected.title}</h2><p>{selected.description}</p></div>
            <div className="training-editor-heading__status"><StatusPill tone={selected.active?"success":"neutral"}>{selected.active?"Active":"Inactive"}</StatusPill><small>Version {selected.version}</small></div>
          </div>

          <nav className="training-editor-tabs" aria-label="Training module settings">
            <button className={tab==="details"?"is-active":""} onClick={()=>setTab("details")}><FileText size={15}/> Details</button>
            <button className={tab==="audience"?"is-active":""} onClick={()=>setTab("audience")}><UsersRound size={15}/> Audience <span>{roles.length}</span></button>
            <button className={tab==="materials"?"is-active":""} onClick={()=>setTab("materials")}><Link2 size={15}/> Materials <span>{materials.length}</span></button>
          </nav>

          {tab==="details"&&<Section title="Module details" description="Edit the employee-facing title, category, and learning description." className="training-editor-section">
            <div className="form-grid">
              <Field label="Module title"><input value={draft?.title??""} onChange={(event)=>setEdit({courseId:selected.id,title:event.target.value,category:draft?.category??selected.category,description:draft?.description??selected.description})}/></Field>
              <Field label="Category"><input value={draft?.category??""} onChange={(event)=>setEdit({courseId:selected.id,title:draft?.title??selected.title,category:event.target.value,description:draft?.description??selected.description})}/></Field>
              <Field label="Version"><input value={`v${selected.version}`} readOnly aria-readonly="true"/></Field>
              <Field label="Description" className="field--full"><textarea rows={5} value={draft?.description??""} onChange={(event)=>setEdit({courseId:selected.id,title:draft?.title??selected.title,category:draft?.category??selected.category,description:event.target.value})}/></Field>
            </div>
            <div className="training-editor-actions"><Button size="sm" variant={selected.active?"secondary":"primary"} onClick={()=>updateCourse({active:!selected.active})}>{selected.active?"Deactivate module":"Reactivate module"}</Button><span className="training-editor-actions__spacer"/>{dirty&&<Button size="sm" variant="ghost" onClick={()=>setEdit(null)}>Discard changes</Button>}<Button size="sm" disabled={!dirty} onClick={saveCourseDetails}>Save changes</Button></div>
          </Section>}

          {tab==="audience"&&<Section title="Default audience" description="Role targeting is specific. Sales Representatives and Brand Ambassadors can receive different training even though both sit under Sales." className="training-editor-section">
            <div className="training-role-grid training-role-grid--wide">{employeeRoles.map((role)=><label key={role} className={roles.includes(role)?"is-selected":""}><input type="checkbox" checked={roles.includes(role)} onChange={()=>toggleRole(role)}/><span><strong>{role}</strong><small>{roles.includes(role)?"Assigned by default":"Not assigned by default"}</small></span></label>)}</div>
            <p className="training-editor-note">Changing the default audience controls future onboarding assignments and role-based training visibility. Existing completed training records are preserved.</p>
          </Section>}

          {tab==="materials"&&<Section title="Training materials" description="Employees see these resources inside their assigned training. Keep each resource clearly named so the module reads in the correct order." className="training-editor-section">
            <div className="training-material-list">
              {materials.map((item)=><article key={item.id}><span className="training-material-list__icon"><Link2 size={16}/></span><div><strong>{item.title}</strong>{item.description&&<p>{item.description}</p>}<TrainingMaterialLink material={item}/></div><Button size="sm" variant="ghost" icon={<Trash2 size={14}/>} onClick={()=>library.removeMaterial(item.id)}>Remove</Button></article>)}
              {!materials.length&&<div className="training-material-empty"><BookOpenCheck size={22}/><div><strong>No materials yet</strong><p>Add an external resource or upload a secured file below.</p></div></div>}
            </div>

            <div className="training-material-actions-grid">
              <form className="training-material-card" onSubmit={addMaterial}>
                <header><span><Link2 size={18}/></span><div><strong>Add an external resource</strong><p>Use this for a website, hosted video, or other secure link.</p></div></header>
                <Field label="Material title"><input required value={material.title} onChange={(event)=>setMaterial({...material,title:event.target.value})} placeholder="5-minute BA training video"/></Field>
                <div className="form-grid">
                  <Field label="Type"><select value={material.kind} onChange={(event)=>setMaterial({...material,kind:event.target.value as TrainingMaterialKind})}><option>Video</option><option>Link</option><option>Document</option></select></Field>
                  <Field label="Link"><input required type="url" value={material.url} onChange={(event)=>setMaterial({...material,url:event.target.value})} placeholder="https://..."/></Field>
                </div>
                <Field label="Description"><textarea rows={3} value={material.description} onChange={(event)=>setMaterial({...material,description:event.target.value})}/></Field>
                <Button type="submit" icon={<Plus size={15}/>}>Add resource</Button>
              </form>

              <form className="training-material-card" key={uploadKey} onSubmit={(event)=>void uploadMaterial(event)}>
                <header><span><Upload size={18}/></span><div><strong>Upload a company file</strong><p>Store a PDF, document, or video securely in Firebase Storage.</p></div></header>
                <Field label="Material title"><input required value={upload.title} onChange={(event)=>setUpload({...upload,title:event.target.value})} placeholder="Brand Ambassador field guide"/></Field>
                <div className="form-grid">
                  <Field label="Type"><select value={upload.kind} onChange={(event)=>setUpload({...upload,kind:event.target.value as TrainingMaterialKind})}><option>Document</option><option>Video</option><option>Link</option></select></Field>
                  <Field label="File"><input required name="training-file" type="file"/></Field>
                </div>
                <Field label="Description"><textarea rows={3} value={upload.description} onChange={(event)=>setUpload({...upload,description:event.target.value})}/></Field>
                <Button type="submit" disabled={upload.busy} icon={<Upload size={15}/>}>{upload.busy?"Uploading…":"Upload file"}</Button>
              </form>
            </div>
            <p className="training-editor-note">Uploaded files remain protected by Firebase Storage rules. Employees open them through their signed-in Momentum session.</p>
          </Section>}
        </> : <div className="training-editor-empty"><BookOpenCheck size={28}/><h2>Select a training module</h2><p>Choose a module from the library or create a new one.</p></div>}
      </main>
    </div>
  </div>;
}
