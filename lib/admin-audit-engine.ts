import { arizonaDateKey, isValidCalendarDateKey } from "./date-time";
import { collectedCashFacts, resolvedPaidOrderFacts } from "./commercial-source";
import type { CommerceState } from "./commerce-engine";
import type { CrmState } from "./crm-engine";
import type { FieldTrackingState } from "./location-tracking-engine";
import type { WorkspaceData, TimeEntry } from "./types";

export type AuditCategory = "Timekeeping" | "Field" | "Sales" | "Accounts";
export type AuditFlag = { category: AuditCategory; reason: string };
export type AuditDay = {
  userId: string; employee: string; date: string; timeEntries: number; firstClockIn?: string; lastClockOut?: string;
  autoClosed: boolean; incompletePunch: boolean; corrected: boolean;
  lastPhysicalVisit?: string; lastWorkEvent?: string; lastGps?: string;
  visitToOutMinutes?: number; workToOutMinutes?: number; gpsToOutMinutes?: number;
  physicalVisits: number; distinctVisitedAccounts: number; savedGpsPoints: number;
  placedOrders: number; fullyPaidOrders: number; flags: AuditFlag[];
};
export type SalesAudit = {
  userId: string; employee: string; physicalVisits: number; distinctVisitedAccounts: number;
  newAccountsOpened: number; accountsOwnedNow: number;
  accountsSold: number; firstTimeBuyingAccounts: number; reorderingAccounts: number;
  placedOrders: number; paidOrders: number; paidCases: number; netCollected: number;
  visitedAccountsThatPaid: number; visitToPaidPercent: number | null;
  newAccountsThatPaid: number; newAccountToPaidPercent: number | null;
  ownedAccountsThatPaid: number; ownedBookBuyingPercent: number | null;
};
export type AccountAudit = { accountId: string; account: string; owner: string; status: string; issue: string; followUp?: string };
export type AdminAuditReport = {
  from: string; to: string; generatedAt: string; reviewedEmployees: number;
  days: AuditDay[]; sales: SalesAudit[]; accounts: AccountAudit[];
  definitions: string[];
};

const validTime = (value?: string) => Boolean(value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
const timeAt = (entry: TimeEntry, field: "clockIn" | "clockOut"): number | undefined => {
  const exact = field === "clockIn" ? entry.clockInAt : entry.clockOutAt;
  if (exact && Number.isFinite(Date.parse(exact))) return Date.parse(exact);
  const display = entry[field];
  if (!validTime(display)) return undefined;
  const value = Date.parse(entry.date + "T" + display + ":00-07:00");
  return Number.isFinite(value) ? value : undefined;
};
const parse = (at?: string): number | undefined => at && Number.isFinite(Date.parse(at)) ? Date.parse(at) : undefined;
const dateOf = (at?: string) => {
  const value = parse(at);
  return value === undefined ? "" : arizonaDateKey(new Date(value));
};
const latest = (values: Array<number | undefined>) => {
  const available = values.filter((value): value is number => value !== undefined);
  return available.length ? Math.max(...available) : undefined;
};
const toIso = (value?: number) => value === undefined ? undefined : new Date(value).toISOString();
const minutesToOut = (previous?: number, out?: number) =>
  previous === undefined || out === undefined || previous > out ? undefined : Math.round((out - previous) / 60000);
const percent = (n: number, d: number) => d ? Math.round(n * 1000 / d) / 10 : null;
const isAutoClosed = (entry: TimeEntry) => Boolean(entry.note?.includes("Automatically closed at Arizona midnight"));
const inPeriod = (date: string, from: string, to: string) => date >= from && date <= to;

export function buildAdminAudit(
  data: WorkspaceData, crm: CrmState, tracking: FieldTrackingState, commerce: CommerceState,
  from: string, to: string, userIds: readonly string[],
  scheduledShifts: readonly { userId: string; date: string; status?: string }[] = [],
  generatedAt = new Date().toISOString(),
): AdminAuditReport {
  if (!isValidCalendarDateKey(from) || !isValidCalendarDateKey(to) || from > to ||
      (Date.parse(to + "T12:00:00-07:00") - Date.parse(from + "T12:00:00-07:00")) / 86400000 > 92)
    throw new Error("Choose a valid period of 93 days or less.");
  const selected = new Set(userIds);
  const people = data.users.filter(user => selected.has(user.id) && user.role !== "Customer");
  const paid = resolvedPaidOrderFacts(data, commerce);
  const cash = collectedCashFacts(data, commerce);
  const orderById = new Map(data.orders.map(order => [order.id, order]));
  const allPaidByAccount = new Map<string, typeof paid>();
  for (const fact of paid) allPaidByAccount.set(fact.accountId, [...(allPaidByAccount.get(fact.accountId) ?? []), fact]);
  const firstPaidByAccount = new Map<string, string>();
  for (const [accountId, facts] of allPaidByAccount) firstPaidByAccount.set(accountId, [...facts].map(f => f.paidAt).sort()[0]);
  const dayRows: AuditDay[] = [];
  const sales: SalesAudit[] = [];
  for (const user of people) {
    const punches = data.timeEntries.filter(entry => entry.userId === user.id && inPeriod(entry.date, from, to));
    const interactions = crm.interactions.filter(item => item.userId === user.id && inPeriod(dateOf(item.occurredAt), from, to));
    const legacyWork = data.activities.filter(item => item.userId === user.id && inPeriod(dateOf(item.at), from, to));
    const completed = data.appointments.filter(item => item.ownerId === user.id && item.completedAt && item.status === "Completed" && inPeriod(dateOf(item.completedAt), from, to));
    const geo = tracking.samples.filter(item => item.userId === user.id && inPeriod(dateOf(item.at), from, to));
    const userOrders = data.orders.filter(order => (order.creditedRepId ?? order.ownerId) === user.id && inPeriod(dateOf(order.placedAt), from, to));
    const paidPeriod = paid.filter(fact => fact.creditedUserId === user.id && inPeriod(fact.paidAt, from, to));
    const scheduled = scheduledShifts.filter(shift => shift.userId === user.id && shift.status !== "Cancelled" && inPeriod(shift.date, from, to));
    const physical = interactions.filter(item => item.type === "Visit" && item.physicalVisit === true);
    const allDates = new Set([...punches.map(e => e.date), ...interactions.map(e => dateOf(e.occurredAt)), ...legacyWork.map(e => dateOf(e.at)),
      ...completed.map(e => dateOf(e.completedAt)), ...geo.map(e => dateOf(e.at)), ...userOrders.map(e => dateOf(e.placedAt)), ...scheduled.map(e => e.date)].filter(Boolean));
    for (const date of [...allDates].sort()) {
      const entryDay = punches.filter(e => e.date === date);
      const crmDay = interactions.filter(e => dateOf(e.occurredAt) === date);
      const legacyDay = legacyWork.filter(e => dateOf(e.at) === date);
      const completedDay = completed.filter(e => dateOf(e.completedAt) === date);
      const geoDay = geo.filter(e => dateOf(e.at) === date);
      const visitDay = physical.filter(e => dateOf(e.occurredAt) === date);
      const visitTimes = [...visitDay.map(e => parse(e.occurredAt)), ...legacyDay.filter(e => e.type === "visit").map(e => parse(e.at)),
        ...completedDay.filter(e => e.type !== "Delivery").map(e => parse(e.completedAt))];
      const workTimes = [...crmDay.map(e => parse(e.occurredAt)), ...legacyDay.map(e => parse(e.at)),
        ...completedDay.map(e => parse(e.completedAt)),
        ...userOrders.filter(e => dateOf(e.placedAt) === date).map(e => parse(e.placedAt))];
      const firstClockIn = entryDay.length ? Math.min(...entryDay.map(e => timeAt(e,"clockIn")).filter((n): n is number => n !== undefined)) : undefined;
      const lastClockOut = latest(entryDay.map(e => timeAt(e,"clockOut")));
      const lastVisit = latest(visitTimes), lastWork = latest(workTimes);
      const lastGps = latest(geoDay.map(e => parse(e.at)));
      const flags: AuditFlag[] = [];
      const addFlag = (category: AuditCategory, reason: string) => flags.push({ category, reason });
      const autoClosed = entryDay.some(isAutoClosed);
      if (autoClosed) addFlag("Timekeeping", "Midnight auto-closure: employee missed a clock-out. Verify actual worked hours and correction status.");
      if (entryDay.some(e => !e.clockOut)) addFlag("Timekeeping", "Open punch remains. Reconcile time actually worked.");
      if (entryDay.length > 1) addFlag("Timekeeping", "Multiple punch sessions; inspect separately.");
      if (entryDay.some(e => e.corrections?.length)) addFlag("Timekeeping", "Punch correction history exists; inspect adjustment evidence.");
      if (!entryDay.length && scheduled.some(s => s.date === date)) addFlag("Timekeeping", "Scheduled shift has no recorded punch; confirm attendance and work.");
      if (!entryDay.length && workTimes.length) addFlag("Timekeeping", "Work event recorded without a time entry.");
      const visitGap = minutesToOut(lastVisit,lastClockOut), workGap = minutesToOut(lastWork,lastClockOut), gpsGap = minutesToOut(lastGps,lastClockOut);
      if (user.role === "Sales Representative" || user.role === "Sales Manager") {
        if (visitGap !== undefined && visitGap >= 60) addFlag("Field", "Last documented visit precedes clock-out by " + visitGap + " minutes; investigate other duties.");
        if (workGap !== undefined && workGap >= 60) addFlag("Field", "Last recorded work event precedes clock-out by " + workGap + " minutes; not proof of inactivity.");
        if (entryDay.length && !workTimes.length) addFlag("Sales", "Punched time but no logged CRM/field/order event.");
      }
      if (user.role === "Sales Representative" && entryDay.length && !geoDay.length)
        addFlag("Field", "No retained GPS sample; device, permission, or short retention may explain.");
      if (lastWork !== undefined && lastClockOut !== undefined && lastWork > lastClockOut + 60000)
        addFlag("Timekeeping", "Work activity logged after final clock-out.");
      dayRows.push({userId:user.id,employee:user.name,date,timeEntries:entryDay.length,
        firstClockIn:toIso(firstClockIn),lastClockOut:toIso(lastClockOut),
        autoClosed,incompletePunch:entryDay.some(e=>!e.clockOut),corrected:entryDay.some(e=>Boolean(e.corrections?.length)),
        lastPhysicalVisit:toIso(lastVisit),lastWorkEvent:toIso(lastWork),lastGps:toIso(lastGps),
        visitToOutMinutes:visitGap,workToOutMinutes:workGap,gpsToOutMinutes:gpsGap,
        physicalVisits:visitDay.length,distinctVisitedAccounts:new Set(visitDay.map(v=>v.locationId)).size,
        savedGpsPoints:geoDay.length,placedOrders:userOrders.filter(e=>dateOf(e.placedAt)===date).length,
        fullyPaidOrders:paidPeriod.filter(f=>f.paidAt===date).length,flags});
    }
    if (user.role !== "Sales Representative" && user.role !== "Sales Manager") continue;
    const visited = new Map<string, string>();
    for (const interaction of physical) {
      const day = dateOf(interaction.occurredAt);
      const prev = visited.get(interaction.locationId);
      if (interaction.locationId && (!prev || day < prev)) visited.set(interaction.locationId, day);
    }
    const created = data.accounts.filter(account => account.createdByUid === user.id && inPeriod(dateOf(account.createdAt),from,to));
    const owned = data.accounts.filter(account => account.ownerId === user.id);
    const paidAccounts = new Set(paidPeriod.map(f => f.accountId));
    const firstBuyerAccounts = new Set(paidPeriod.filter(f => firstPaidByAccount.get(f.accountId) === f.paidAt).map(f => f.accountId));
    const reorderingAccounts = new Set(paidPeriod.filter(f => {
      const facts = allPaidByAccount.get(f.accountId) ?? [];
      return facts.some(prior => prior.orderId !== f.orderId && prior.paidAt <= f.paidAt);
    }).map(f=>f.accountId));
    const visitedToPaid = [...visited].filter(([accountId,visitDate]) =>
      paidPeriod.some(f=>f.accountId===accountId && f.paidAt>=visitDate)).length;
    const createdToPaid = created.filter(account => paidPeriod.some(f => f.accountId===account.id && f.paidAt>=dateOf(account.createdAt))).length;
    const ownedToPaid = owned.filter(account => (allPaidByAccount.get(account.id)??[]).some(f=>inPeriod(f.paidAt,from,to))).length;
    const userCash = cash.filter(f => f.creditedUserId===user.id && inPeriod(f.settledAt,from,to));
    const netCollected = userCash.reduce((sum,f)=>sum+(f.kind==="Refund"?-f.amount:f.amount),0);
    sales.push({userId:user.id,employee:user.name,physicalVisits:physical.length,
      distinctVisitedAccounts:visited.size,newAccountsOpened:created.length,accountsOwnedNow:owned.length,
      accountsSold:paidAccounts.size,firstTimeBuyingAccounts:firstBuyerAccounts.size,reorderingAccounts:reorderingAccounts.size,
      placedOrders:userOrders.filter(o=>o.status!=="Cancelled").length,paidOrders:paidPeriod.length,
      paidCases:paidPeriod.reduce((sum,f)=>sum+f.cases,0),netCollected,
      visitedAccountsThatPaid:visitedToPaid,visitToPaidPercent:percent(visitedToPaid,visited.size),
      newAccountsThatPaid:createdToPaid,newAccountToPaidPercent:percent(createdToPaid,created.length),
      ownedAccountsThatPaid:ownedToPaid,ownedBookBuyingPercent:percent(ownedToPaid,owned.length)});
  }
  dayRows.sort((a,b)=>b.date.localeCompare(a.date)||a.employee.localeCompare(b.employee));
  const names = new Map(data.users.map(u=>[u.id,u.name]));
  const accounts: AccountAudit[] = data.accounts.filter(a => selected.has(a.ownerId) && Boolean(a.ownerId))
    .flatMap(a => {
      const issue = !a.nextActionDate ? "No next action date" :
        a.nextActionDate < to && ["Prospect","Qualified","Sampled","Opening order","At risk"].includes(a.stage) ? "Overdue follow-up" : undefined;
      return issue ? [{accountId:a.id,account:a.locationName??a.name,owner:names.get(a.ownerId)??a.ownerId,status:a.stage,issue,followUp:a.nextActionDate||undefined}] : [];
    }).sort((a,b)=>a.owner.localeCompare(b.owner)||a.account.localeCompare(b.account));
  return {from,to,generatedAt,reviewedEmployees:people.length,days:dayRows,sales,accounts,
    definitions:[
      "Midnight auto-close marker is recorded by the existing Phoenix scheduled job. It is a missed punch needing reconciliation, not verified shift end.",
      "Physical visits = CRM Visit interactions marked physicalVisit=true; repeated visits count separately. Distinct visited accounts are unique CRM location IDs.",
      "New accounts opened = locations with an actual createdAt within period and createdByUid matching the employee. Legacy missing provenance is excluded.",
      "Accounts sold = unique locations with fully paid orders credited to the rep and settled within period. Orders placed and payments received are distinct.",
      "Visited-to-paid = distinct visited locations with a rep-credited paid order on/after the visit during the same period, divided by distinct visited locations. Association does not prove causation.",
      "New-account-to-paid = newly created locations credited to this rep that also have a rep-credited paid order during period, divided by new accounts opened.",
      "Owned book buying = currently owned locations with any paid order in period, regardless of who received sales credit, divided by accounts owned NOW; not a historical ownership rate.",
      "Net collected = payment allocations less settled refunds attributed to the rep and settled in the period. This differs from placed order value and can include payments for prior-period orders.",
      "Reordering account = rep-credited paid order with an earlier paid order for that location. Historical missing records can undercount reorders.",
      "GPS is browser-sampled and retained separately for ten Arizona calendar days; missing points are not evidence an employee was inactive.",
      "All time differences compare existing timestamps, not verified hours worked. Review exceptions, travel, calls, off-platform work and payroll corrections before decisions.",
    ]};
}
