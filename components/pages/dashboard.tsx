"use client";

import { AlertTriangle, BellRing, Check, CheckCircle2, Clock3, Megaphone, PackageCheck, PackagePlus, Route, Store, UsersRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { canAccessPage, canPostBulletin, isCustomer } from "../../lib/access";
import type { Bulletin, PageKey, Team } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, Field, MetricCard, Modal, PageHeader, Section, StatusPill, TextButton, formatDate, formatMoney } from "../ui";

const stages = ["Prospect","Qualified","Sampled","Opening order","Placed","Reordered"];
const bulletinTone = (priority: Bulletin["priority"]) => priority === "Urgent" ? "danger" as const : priority === "Important" ? "warning" as const : "info" as const;

function CustomerDashboard() {
  const { scope, currentUser, navigate } = useWorkspace();
  const account = scope.accounts[0]; const open = scope.orders.filter(order => !["Delivered","Paid"].includes(order.status));
  const recent = [...scope.orders].sort((a,b) => b.placedAt.localeCompare(a.placedAt)).slice(0,4);
  const delivered = recent.find(order => ["Delivered","Paid"].includes(order.status));
  return <div className="page page--dashboard page--customer-home">
    <PageHeader eyebrow="Golden Eagle partner portal" title={`Welcome, ${currentUser?.firstName}.`} description="Your account and orders—nothing outside your organization." actions={<Button variant="gold" icon={<PackagePlus size={17}/>} onClick={() => navigate("orders")}>Place order</Button>}/>
    <div className="customer-welcome-band"><span><Store size={22}/></span><div><small>Account access</small><strong>{account?.name ?? "Linked customer account"}</strong><p>{account?.location} · {account?.channel}</p></div><StatusPill tone="success">Access limited to your account</StatusPill></div>
    <div className="metric-grid">
      <MetricCard label="Open orders" value={String(open.length)} detail="In review or fulfillment" trend="View status" tone="blue" onClick={() => navigate("orders")}/>
      <MetricCard label="Orders on record" value={String(scope.orders.length)} detail="Your account only" trend="Order history" tone="gold" onClick={() => navigate("orders")}/>
      <MetricCard label="Latest delivery" value={delivered ? `${delivered.cases} cs` : "—"} detail={delivered ? formatDate(delivered.placedAt) : "No delivered order"} trend="Delivery record" tone="green" onClick={() => navigate("orders")}/>
      <MetricCard label="Account status" value={account?.stage ?? "—"} detail="Current relationship stage" trend="Account details" tone="red" onClick={() => navigate("accounts")}/>
    </div>
    <div className="customer-home-grid">
      <Section title="Recent orders" description="Status and totals for your account" action={<TextButton onClick={() => navigate("orders")}>Open all orders</TextButton>}><div className="customer-order-list">{recent.map(order => <button key={order.id} onClick={() => navigate("orders")}><span><PackageCheck size={17}/></span><div><strong>{order.number}</strong><p>{order.cases} cases · {formatMoney(order.amount)}</p></div><StatusPill tone={["Delivered","Paid"].includes(order.status) ? "success" : order.status === "Awaiting approval" ? "warning" : "info"}>{order.status}</StatusPill></button>)}</div></Section>
      <Section title="Account contacts" description="Information connected to your organization"><dl className="customer-account-facts"><div><dt>Organization</dt><dd>{account?.name}</dd></div><div><dt>Primary contact</dt><dd>{account?.contactName}</dd></div><div><dt>Email</dt><dd>{account?.email}</dd></div><div><dt>Phone</dt><dd>{account?.phone}</dd></div></dl></Section>
    </div>
  </div>;
}

export function DashboardPage() {
  const { data, scope, currentUser, navigate, createBulletin, acknowledgeBulletin } = useWorkspace();
  const defaultTeam = currentUser?.role === "Sales Manager" ? currentUser.managedTeams?.[0] ?? "Sales" : "Sales";
  const [bulletinOpen,setBulletinOpen] = useState(false);
  const [form,setForm] = useState<{title:string;body:string;audience:Bulletin["audience"];team:Team;priority:Bulletin["priority"];expiresAt:string}>({ title:"", body:"", audience: currentUser?.role === "Sales Manager" ? "Team" : "Company", team: defaultTeam, priority:"Update", expiresAt:"" });
  const today = new Date().toISOString().slice(0,10);
  const appointments = scope.appointments.filter(item => item.date === today).sort((a,b) => a.startTime.localeCompare(b.startTime));
  const placements = scope.placements.filter(item => item.status !== "Healthy");
  const orders = scope.orders.filter(item => !["Delivered","Paid"].includes(item.status));
  const approvals = scope.approvals.filter(item => item.status === "Pending");
  const available = scope.inventory.reduce((sum,lot) => sum + lot.available,0);
  const held = scope.inventory.filter(lot => lot.status === "Quality hold").reduce((sum,lot) => sum + lot.onHand,0);
  const actions = scope.accounts.filter(account => account.nextAction && account.nextActionDate).sort((a,b) => a.nextActionDate.localeCompare(b.nextActionDate)).slice(0,3);
  const hour = new Date().getHours(); const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const metrics = useMemo(() => {
    if (!currentUser) return [];
    const cards: Array<{label:string;value:string;detail:string;trend:string;tone:"blue"|"gold"|"green"|"red";page:PageKey}> = [
      { label:"Today’s appointments", value:String(appointments.length), detail:"Work in your scope", trend:`${appointments.filter(item => item.status === "Completed").length} completed`, tone:"blue", page:"dispatch" },
      { label:"Open orders", value:String(orders.length), detail:"Not delivered or paid", trend:`${approvals.filter(item => item.type === "Order").length} awaiting review`, tone:"gold", page:"orders" },
    ];
    if (canAccessPage(currentUser,"retail")) cards.push({ label:"Active placements", value:String(scope.placements.length), detail:"Assigned account locations", trend:`${placements.length} need attention`, tone:"green", page:"retail" });
    if (canAccessPage(currentUser,"inventory")) cards.push({ label:"Available inventory", value:`${available} cs`, detail:"Across recorded lots", trend:`${held} cs held`, tone:"red", page:"inventory" });
    else cards.push({ label:"Account actions", value:String(actions.length), detail:"Earliest dated follow-ups", trend:"Open accounts", tone:"red", page:"accounts" });
    if (cards.length < 4) cards.push({ label:"Pending decisions", value:String(approvals.length), detail:"Within your review scope", trend:"Open work queue", tone:"red", page:"work" });
    return cards.slice(0,4);
  }, [actions.length,appointments,approvals,available,currentUser,held,orders.length,placements.length,scope.placements.length]);
  if (isCustomer(currentUser)) return <CustomerDashboard/>;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const ok = createBulletin({ title:form.title, body:form.body, audience:form.audience, team:form.audience === "Team" ? form.team : undefined, priority:form.priority, expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : undefined });
    if (ok) { setBulletinOpen(false); setForm(current => ({...current,title:"",body:""})); }
  };

  return <div className="page page--dashboard">
    <PageHeader eyebrow={`${formatDate(today,{weekday:"long",month:"long",day:"numeric"})} · Arizona market`} title={`${greeting}, ${currentUser?.firstName}.`} description={currentUser?.role === "Sales Manager" ? "Your team’s work, decisions, and account follow-ups in one place." : "Workload, exceptions, customer follow-ups, and company updates in one place."} actions={<Button variant="secondary" onClick={() => navigate("work")}>Review my work</Button>}/>
    <Section title="Company & team updates" description="Published to your role and team" className="bulletin-panel" action={canPostBulletin(currentUser) ? <Button size="sm" variant="secondary" icon={<Megaphone size={15}/>} onClick={() => setBulletinOpen(true)}>Post update</Button> : undefined}>
      <div className="bulletin-list">{scope.bulletins.map(item => {
        const author = data.users.find(user => user.id === item.authorId); const acknowledged = item.acknowledgedBy.includes(currentUser?.id ?? "");
        return <article className={`bulletin-card bulletin-card--${item.priority.toLowerCase()}`} key={item.id}><span><BellRing size={18}/></span><div><div className="bulletin-card__meta"><StatusPill tone={bulletinTone(item.priority)} dot={false}>{item.priority}</StatusPill><small>{item.audience === "Company" ? "All employees" : `${item.team} team`}</small><small>{formatDate(item.publishedAt,{month:"short",day:"numeric"})}</small></div><strong>{item.title}</strong><p>{item.body}</p><small>Posted by {author?.name ?? "Administrator"}</small></div><Button size="sm" variant={acknowledged ? "ghost" : "secondary"} icon={<Check size={14}/>} disabled={acknowledged} onClick={() => acknowledgeBulletin(item.id)}>{acknowledged ? "Acknowledged" : "Acknowledge"}</Button></article>;
      })}{scope.bulletins.length === 0 && <div className="review-empty"><Megaphone size={24}/><h3>No active updates</h3><p>Company and team posts will appear here.</p></div>}</div>
    </Section>
    <div className="metric-grid">{metrics.map(card => <MetricCard key={card.label} {...card} onClick={() => navigate(card.page)}/>)}</div>
    <div className="dashboard-main-grid">
      <Section title="Today’s schedule" description="Appointments and current field status" action={<TextButton onClick={() => navigate("dispatch")}>Open dispatch board</TextButton>} className="dashboard-schedule"><div className="schedule-list">{appointments.map(appointment => {
        const account = scope.accounts.find(item => item.id === appointment.accountId); const owner = data.users.find(item => item.id === appointment.ownerId); const active = ["Dispatched","En route","Arrived"].includes(appointment.status);
        return <article key={appointment.id}><div className="schedule-time"><strong>{appointment.startTime}</strong><span>{appointment.duration} min</span></div><div className={`schedule-marker ${active ? "is-live" : ""}`}><i/></div><div className="schedule-info"><div className="schedule-info__top"><div><strong>{account?.name}</strong><span>{appointment.type}</span></div><StatusPill tone={active ? "info" : appointment.status === "Completed" ? "success" : "neutral"}>{appointment.status}</StatusPill></div><p>{appointment.objective}</p><div className="schedule-meta">{owner && <><Avatar initials={owner.initials} color={owner.accent} size="sm"/><span>{owner.name}</span></>}<i/><span>{appointment.location}</span></div></div></article>;
      })}{appointments.length === 0 && <div className="review-empty"><Clock3 size={25}/><h3>No appointments today</h3><p>Open dispatch to schedule or review another date.</p></div>}</div></Section>
      <Section title="Attention needed" description="Exceptions within your scope" action={<TextButton onClick={() => navigate("work")}>Open work queue</TextButton>} className="decision-panel"><div className="decision-list">
        {approvals.length > 0 && <button onClick={() => navigate("work")}><span className="decision-icon decision-icon--warning"><PackageCheck size={18}/></span><div><strong>{approvals.length} decision{approvals.length === 1 ? "" : "s"} waiting</strong><p>Open the underlying record before deciding.</p></div><StatusPill tone="warning" dot={false}>Review</StatusPill></button>}
        {placements.map(item => { const account = scope.accounts.find(account => account.id === item.accountId); return <button key={item.id} onClick={() => navigate("retail")}><span className="decision-icon decision-icon--danger"><Store size={18}/></span><div><strong>{account?.name}: {item.status}</strong><p>{item.observedStock} units · {item.facings} facings · {item.cold ? "cold" : "not cold"}</p></div><StatusPill tone="danger" dot={false}>Action</StatusPill></button>; })}
        {approvals.length === 0 && placements.length === 0 && <div className="review-empty"><CheckCircle2 size={25}/><h3>No open exceptions</h3><p>Current records in your scope do not require review.</p></div>}
      </div></Section>
    </div>
    <div className={`dashboard-secondary-grid ${canAccessPage(currentUser,"accounts") ? "" : "dashboard-secondary-grid--compact"}`}>
      {canAccessPage(currentUser,"accounts") && <Section title="Sales pipeline" description="Accounts by current stage" action={<TextButton onClick={() => navigate("accounts")}>Open accounts</TextButton>} className="pipeline-panel"><div className="pipeline-bars">{stages.map((stage,index) => { const count = scope.accounts.filter(account => account.stage === stage).length; const width = Math.max(8,count/Math.max(scope.accounts.length,1)*100); return <div className="pipeline-row" key={stage}><span>{stage}</span><div><i style={{width:`${width}%`,opacity:1-index*.08}}/></div><strong>{count}</strong></div>; })}</div></Section>}
      {canAccessPage(currentUser,"accounts") && <Section title="Upcoming account actions" description="Earliest dated work in your scope" className="goal-panel"><div className="activity-list">{actions.map(account => <article key={account.id}><span><Route size={16}/></span><div><strong>{account.nextAction}</strong><p>{account.name} · {account.location}</p></div><small>{formatDate(account.nextActionDate,{month:"short",day:"numeric"})}</small></article>)}</div></Section>}
      <Section title="Recent activity" description="Latest changes within your scope" className="activity-panel"><div className="activity-list">{scope.activities.slice(0,4).map(activity => { const account = scope.accounts.find(item => item.id === activity.accountId); const Icon = activity.type === "placement" ? Store : activity.type === "visit" ? Route : activity.type === "order" ? PackageCheck : activity.type === "note" ? UsersRound : AlertTriangle; return <article key={activity.id}><span><Icon size={16}/></span><div><strong>{activity.title}</strong><p>{account?.name ?? "Workspace"} · {activity.detail}</p></div><small>{formatDate(activity.at,{hour:"numeric",minute:"2-digit"})}</small></article>; })}</div></Section>
    </div>
    <Modal open={bulletinOpen} title="Post a dashboard update" description={currentUser?.role === "Administrator" ? "Publish to all employees or one team." : "Publish only to the team you manage."} onClose={() => setBulletinOpen(false)} footer={<><Button variant="ghost" onClick={() => setBulletinOpen(false)}>Cancel</Button><Button type="submit" form="bulletin-form">Publish update</Button></>}>
      <form id="bulletin-form" className="form-grid" onSubmit={submit}>
        <Field label="Title"><input required maxLength={80} value={form.title} onChange={event => setForm({...form,title:event.target.value})}/></Field>
        <Field label="Priority"><select value={form.priority} onChange={event => setForm({...form,priority:event.target.value as Bulletin["priority"]})}><option>Update</option><option>Important</option><option>Urgent</option></select></Field>
        <Field label="Audience"><select value={form.audience} disabled={currentUser?.role === "Sales Manager"} onChange={event => setForm({...form,audience:event.target.value as Bulletin["audience"]})}>{currentUser?.role === "Administrator" && <option>Company</option>}<option>Team</option></select></Field>
        {form.audience === "Team" && <Field label="Team"><select value={form.team} disabled={currentUser?.role === "Sales Manager"} onChange={event => setForm({...form,team:event.target.value as Team})}><option>Leadership</option><option>Sales</option><option>Operations</option></select></Field>}
        <Field label="Expires after" hint="Optional; prevents stale posts"><input type="date" value={form.expiresAt} onChange={event => setForm({...form,expiresAt:event.target.value})}/></Field>
        <Field label="Message" className="field--full" hint="Include the action people need to take."><textarea required rows={5} maxLength={500} value={form.body} onChange={event => setForm({...form,body:event.target.value})}/></Field>
      </form>
    </Modal>
  </div>;
}
