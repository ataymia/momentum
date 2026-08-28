"use client";

import { BarChart3, Check, FileImage, Megaphone, Plus, RotateCcw, Search, Target, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

type MarketingRequest = {
  id: string; requesterId: string; type: "Collateral" | "Samples / event" | "Creative" | "Partnership";
  accountId?: string; title: string; detail: string; quantity?: number; neededBy?: string;
  status: "Submitted" | "Approved" | "Returned" | "Fulfilled"; submittedAt: string;
};
type Campaign = {
  id: string; name: string; objective: string; audience: string; startDate: string; endDate: string;
  requestedBudget: number; approvedBudget?: number; actualSpend: number; ownerId: string;
  status: "Draft" | "Awaiting approval" | "Approved" | "Active" | "Complete" | "Returned";
  successMeasure: string;
};
type Asset = { id: string; name: string; type: string; version: string; status: "Approved" | "Draft" | "Retired"; updatedAt: string };

type MarketingState = { requests: MarketingRequest[]; campaigns: Campaign[]; assets: Asset[] };
const KEY = "momentum-marketing-v2";
const seed: MarketingState = {
  requests: [
    { id:"mr-1", requesterId:"usr-jordan", type:"Collateral", accountId:"acc-101", title:"Retailer sell-sheet restock", detail:"Need approved retailer sheets for account follow-up.", quantity:25, neededBy:"2026-09-02", status:"Submitted", submittedAt:"2026-08-28T16:00:00Z" },
  ],
  campaigns: [
    { id:"mc-1", name:"Phoenix account support", objective:"Support newly opened local accounts", audience:"Independent retail customers near active placements", startDate:"2026-09-01", endDate:"2026-09-30", requestedBudget:0, actualSpend:0, ownerId:"usr-mia", status:"Draft", successMeasure:"Qualified retailer interest and reorder-support activity tied to source accounts" },
  ],
  assets: [
    { id:"ma-1", name:"Golden Eagle retailer sales sheet", type:"Retail collateral", version:"Controlled working copy", status:"Draft", updatedAt:"2026-08-28" },
    { id:"ma-2", name:"Momentum / Golden Eagle official logo", type:"Brand asset", version:"Current", status:"Approved", updatedAt:"2026-08-28" },
  ],
};

const load = (): MarketingState => {
  if (typeof window === "undefined") return seed;
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? JSON.stringify(seed)) as MarketingState; } catch { return seed; }
};
const statusTone = (status: MarketingRequest["status"] | Campaign["status"] | Asset["status"]) => status === "Approved" || status === "Fulfilled" || status === "Complete" ? "success" as const : status === "Returned" || status === "Retired" ? "danger" as const : status === "Awaiting approval" || status === "Submitted" ? "warning" as const : "info" as const;

export function MarketingPage() {
  const { data, scope, currentUser } = useWorkspace();
  const [tab, setTab] = useState<"requests"|"campaigns"|"assets"|"performance">("requests");
  const [state, setState] = useState<MarketingState>(load);
  const [requestType, setRequestType] = useState<MarketingRequest["type"]>("Collateral");
  const [title, setTitle] = useState(""); const [detail, setDetail] = useState(""); const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState(""); const [neededBy, setNeededBy] = useState("");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaign, setCampaign] = useState({ name:"", objective:"", audience:"", startDate:"", endDate:"", requestedBudget:"", successMeasure:"" });
  const admin = currentUser?.role === "Administrator";

  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(state)); }, [state]);

  const visibleRequests = useMemo(() => admin ? state.requests : state.requests.filter((request) => request.requesterId === currentUser?.id), [admin, currentUser?.id, state.requests]);
  const linkedCampaigns = state.campaigns.length;
  const activeSpend = state.campaigns.filter((item) => ["Approved","Active","Complete"].includes(item.status)).reduce((sum,item) => sum + item.actualSpend,0);

  const submitRequest = (event: FormEvent) => {
    event.preventDefault(); if (!currentUser || !title.trim() || !detail.trim()) return;
    const next: MarketingRequest = { id:`mr-${Date.now()}`, requesterId:currentUser.id, type:requestType, accountId:accountId || undefined, title:title.trim(), detail:detail.trim(), quantity:quantity ? Number(quantity) : undefined, neededBy:neededBy || undefined, status:"Submitted", submittedAt:new Date().toISOString() };
    setState((current) => ({ ...current, requests:[next,...current.requests] })); setTitle(""); setDetail(""); setAccountId(""); setQuantity(""); setNeededBy("");
  };
  const decideRequest = (id: string, status: "Approved"|"Returned"|"Fulfilled") => { if (!admin) return; setState((current) => ({ ...current, requests:current.requests.map((request) => request.id === id ? { ...request, status } : request) })); };
  const submitCampaign = (event: FormEvent) => {
    event.preventDefault(); if (!currentUser || !campaign.name.trim() || !campaign.objective.trim() || !campaign.startDate || !campaign.endDate || !campaign.successMeasure.trim()) return;
    const requestedBudget = Number(campaign.requestedBudget || 0);
    const next: Campaign = { id:`mc-${Date.now()}`, name:campaign.name.trim(), objective:campaign.objective.trim(), audience:campaign.audience.trim(), startDate:campaign.startDate, endDate:campaign.endDate, requestedBudget, actualSpend:0, ownerId:currentUser.id, status:requestedBudget > 0 ? "Awaiting approval" : "Draft", successMeasure:campaign.successMeasure.trim() };
    setState((current) => ({ ...current, campaigns:[next,...current.campaigns] })); setCampaign({ name:"", objective:"", audience:"", startDate:"", endDate:"", requestedBudget:"", successMeasure:"" }); setCampaignOpen(false);
  };
  const decideCampaign = (id: string, status: "Approved"|"Returned") => { if (!admin) return; setState((current) => ({ ...current, campaigns:current.campaigns.map((item) => item.id === id ? { ...item, status, approvedBudget:status === "Approved" ? item.requestedBudget : undefined } : item) })); };

  return <div className="page page--marketing">
    <PageHeader eyebrow="Demand generation & retailer support" title="Marketing" description="Plan campaigns, control spend, manage approved assets, and route field requests without disconnecting marketing activity from accounts and commercial outcomes." actions={<Button variant="gold" icon={<Plus size={16}/>} onClick={() => setCampaignOpen((open) => !open)}>New campaign</Button>} />
    <div className="company-rule-facts"><div><span>Open requests</span><strong>{state.requests.filter((item) => item.status === "Submitted").length}</strong><small>Material / event / creative work</small></div><div><span>Campaigns</span><strong>{linkedCampaigns}</strong><small>Draft through complete</small></div><div><span>Actual spend</span><strong>{formatMoney(activeSpend)}</strong><small>Recorded against campaign records</small></div><div><span>Approved assets</span><strong>{state.assets.filter((item) => item.status === "Approved").length}</strong><small>Version-controlled source</small></div></div>
    <div className="company-tabs">{(["requests","campaigns","assets","performance"] as const).map((item) => <button key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item === "requests" ? "Requests" : item === "campaigns" ? "Campaigns & spend" : item === "assets" ? "Asset library" : "Performance"}</button>)}</div>

    {tab === "requests" && <div className="company-grid company-grid--requests"><Section title="Request marketing support" description="Field teams can request approved materials, samples, creative, event support, or partnership help"><form className="form-grid" onSubmit={submitRequest}><Field label="Request type"><select value={requestType} onChange={(event) => setRequestType(event.target.value as MarketingRequest["type"])}><option>Collateral</option><option>Samples / event</option><option>Creative</option><option>Partnership</option></select></Field><Field label="Linked account"><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Not account-specific</option>{scope.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></Field><Field label="Request" className="field--full"><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you need?"/></Field><Field label="Quantity"><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)}/></Field><Field label="Needed by"><input type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)}/></Field><Field label="Business purpose" className="field--full"><textarea required rows={4} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Account, event, objective, and how the material will be used."/></Field><Button type="submit" icon={<Megaphone size={16}/>}>Submit marketing request</Button></form></Section><Section title={admin ? "Marketing request queue" : "My marketing requests"} description="Every request keeps requester, account, need-by date, decision, and fulfillment state"><div className="company-request-list">{visibleRequests.map((request) => { const requester = data.users.find((user) => user.id === request.requesterId); const account = data.accounts.find((item) => item.id === request.accountId); return <article key={request.id}><div><small>{request.type}</small><strong>{request.title}</strong><p>{requester?.name}{account ? ` · ${account.name}` : ""}{request.neededBy ? ` · due ${formatDate(request.neededBy,{month:"short",day:"numeric"})}` : ""}</p><p>{request.detail}</p></div><StatusPill tone={statusTone(request.status)}>{request.status}</StatusPill>{admin && request.status === "Submitted" && <div className="request-actions"><Button size="sm" variant="secondary" icon={<RotateCcw size={14}/>} onClick={() => decideRequest(request.id,"Returned")}>Return</Button><Button size="sm" icon={<Check size={14}/>} onClick={() => decideRequest(request.id,"Approved")}>Approve</Button></div>}{admin && request.status === "Approved" && <Button size="sm" variant="gold" onClick={() => decideRequest(request.id,"Fulfilled")}>Mark fulfilled</Button>}</article>; })}</div></Section></div>}

    {tab === "campaigns" && <><div className="marketing-campaign-create">{campaignOpen && <Section title="New campaign / activation" description="Define the business purpose before money or materials move"><form className="form-grid" onSubmit={submitCampaign}><Field label="Campaign name"><input required value={campaign.name} onChange={(event) => setCampaign({...campaign,name:event.target.value})}/></Field><Field label="Audience"><input value={campaign.audience} onChange={(event) => setCampaign({...campaign,audience:event.target.value})}/></Field><Field label="Start"><input type="date" required value={campaign.startDate} onChange={(event) => setCampaign({...campaign,startDate:event.target.value})}/></Field><Field label="End"><input type="date" required value={campaign.endDate} onChange={(event) => setCampaign({...campaign,endDate:event.target.value})}/></Field><Field label="Requested budget"><input type="number" min="0" step="0.01" value={campaign.requestedBudget} onChange={(event) => setCampaign({...campaign,requestedBudget:event.target.value})}/></Field><Field label="Objective" className="field--full"><textarea required rows={3} value={campaign.objective} onChange={(event) => setCampaign({...campaign,objective:event.target.value})}/></Field><Field label="Success measure" className="field--full"><textarea required rows={3} value={campaign.successMeasure} onChange={(event) => setCampaign({...campaign,successMeasure:event.target.value})} placeholder="Define what result makes this worth the spend."/></Field><Button type="submit" icon={<Target size={16}/>}>Create campaign</Button></form></Section>}</div><Section title="Campaign register" description="Budget approval and actual spend remain separate facts"><div className="campaign-register">{state.campaigns.map((item) => <article key={item.id}><div className="campaign-register__head"><div><small>{item.startDate} → {item.endDate}</small><strong>{item.name}</strong><p>{item.objective}</p></div><StatusPill tone={statusTone(item.status)}>{item.status}</StatusPill></div><div className="campaign-register__facts"><span>Requested <b>{formatMoney(item.requestedBudget)}</b></span><span>Approved <b>{item.approvedBudget == null ? "—" : formatMoney(item.approvedBudget)}</b></span><span>Actual <b>{formatMoney(item.actualSpend)}</b></span><span>Measure <b>{item.successMeasure}</b></span></div>{admin && item.status === "Awaiting approval" && <div className="request-actions"><Button size="sm" variant="secondary" icon={<RotateCcw size={14}/>} onClick={() => decideCampaign(item.id,"Returned")}>Return</Button><Button size="sm" icon={<Check size={14}/>} onClick={() => decideCampaign(item.id,"Approved")}>Approve spend</Button></div>}</article>)}</div></Section></>}

    {tab === "assets" && <Section title="Approved asset library" description="Marketing should know which version may be used before anything is printed, posted, emailed, or handed to a buyer"><div className="asset-register">{state.assets.map((asset) => <article key={asset.id}><span><FileImage size={20}/></span><div><strong>{asset.name}</strong><p>{asset.type} · {asset.version} · updated {formatDate(asset.updatedAt,{month:"short",day:"numeric",year:"numeric"})}</p></div><StatusPill tone={statusTone(asset.status)}>{asset.status}</StatusPill></article>)}</div></Section>}

    {tab === "performance" && <div className="company-grid company-grid--two"><Section title="Marketing KPI spine" description="Every result must drill back to campaign, account, or request evidence"><div className="company-list">{[[Target,"Qualified demand","Leads or account opportunities tied to a marketing source"],[BarChart3,"Commercial influence","Opened accounts, paid sales, reorders, or placement support linked to campaigns"],[WalletCards,"Spend control","Approved budget vs actual spend and cost per qualified outcome"],[Search,"Execution quality","Campaign completion, asset accuracy, request turnaround and reporting completeness"]].map(([Icon,title,copy]) => { const I = Icon as typeof Target; return <div key={title as string}><span><I size={18}/></span><div><strong>{title as string}</strong><p>{copy as string}</p></div></div>; })}</div></Section><Section title="Control rules" description="Marketing activity does not get credit merely for being busy"><div className="company-list company-list--questions"><div><span><Check size={17}/></span><div><p>Ad spend requires an approved campaign record, budget owner, dates, audience and success measure.</p></div></div><div><span><Check size={17}/></span><div><p>Physical material usage should eventually decrement marketing-material inventory and retain the requesting account/event.</p></div></div><div><span><Check size={17}/></span><div><p>Only approved asset versions may move into external use.</p></div></div></div></Section></div>}
  </div>;
}
