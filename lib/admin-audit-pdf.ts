import type { AdminAuditReport, AuditDay, SalesAudit, VisitLocationAudit } from "./admin-audit-engine";

const safe = (s: string) => s.normalize("NFKD").replace(/[^\x20-\x7e]/g, "?");
const escapePdf = (s: string) => safe(s).replace(/[\\()]/g, "\\$&");
const fmt = (at?: string) => at ? new Intl.DateTimeFormat("en-US", {timeZone:"America/Phoenix",hour:"numeric",minute:"2-digit"}).format(new Date(at)) : "not recorded";
const duration = (n?: number) => n === undefined ? "n/a" : Math.floor(n/60)+"h "+String(n%60).padStart(2,"0")+"m";
const rate = (n: number | null) => n===null ? "n/a" : n.toFixed(1)+"%";
const money = (n: number) => "$"+n.toFixed(2);
function wrap(value: string, max=95): string[] {
  const words = safe(value).split(/\s+/); const rows: string[] = []; let line="";
  for (const word of words) {
    if ((line+" "+word).trim().length>max && line) {rows.push(line);line="";}
    line+=(line?" ":"")+word;
  }
  if(line)rows.push(line);
  return rows.length?rows:[""];
}
function dayLines(row: AuditDay):string[]{
  return [
    row.date+" | "+row.employee,
    "  Punches "+row.timeEntries+" | in "+fmt(row.firstClockIn)+" | out "+fmt(row.lastClockOut)+(row.autoClosed?" | MIDNIGHT AUTO-CLOSE":""),
    "  Last physical visit "+fmt(row.lastPhysicalVisit)+" | gap "+duration(row.visitToOutMinutes),
    "  Last work event     "+fmt(row.lastWorkEvent)+" | gap "+duration(row.workToOutMinutes),
    "  Last GPS ping       "+fmt(row.lastGps)+" | gap "+duration(row.gpsToOutMinutes),
    "  Visits "+row.physicalVisits+" | unique locations "+row.distinctVisitedAccounts+" | GPS "+row.savedGpsPoints+" | orders placed "+row.placedOrders+" | fully paid "+row.fullyPaidOrders,
    ...(row.flags.length ? row.flags.flatMap(f=>wrap("  REVIEW ["+f.category+"] "+f.reason)) : ["  No programmed exception found for this date"]),
    "",
  ];
}
function salesLines(row: SalesAudit):string[]{
  return [
    row.employee,
    "  Visits "+row.physicalVisits+" | locations visited "+row.distinctVisitedAccounts+" | returns "+row.returnVisits+" | locations revisited "+row.revisitedLocations,
    "  New opened "+row.newAccountsOpened+" | owned now "+row.accountsOwnedNow,
    "  Placed orders "+row.placedOrders+" | fully paid orders "+row.paidOrders+" | paid buying accounts "+row.accountsSold,
    "  First-time paid accounts "+row.firstTimeBuyingAccounts+" | repeat buyers "+row.reorderingAccounts+" | paid cases "+row.paidCases,
    "  Visited -> paid "+row.visitedAccountsThatPaid+"/"+row.distinctVisitedAccounts+" = "+rate(row.visitToPaidPercent),
    "  New opened -> paid "+row.newAccountsThatPaid+"/"+row.newAccountsOpened+" = "+rate(row.newAccountToPaidPercent),
    "  Owned book buyers "+row.ownedAccountsThatPaid+"/"+row.accountsOwnedNow+" = "+rate(row.ownedBookBuyingPercent),
    "  Net collected in period "+money(row.netCollected),
    "",
  ];
}
function visitLines(row: VisitLocationAudit):string[]{
  return [
    ...wrap(row.employee+" | "+row.location+" | "+(row.linkedAccount?"Linked account":"Unlinked CRM visit")),
    "  Visits "+row.visits+" | return visits "+row.returnVisits+" | days "+row.distinctVisitDays+
      " | unsuccessful "+row.unsuccessfulVisits+" | selected-team visits "+row.selectedTeamVisits,
    "  First "+row.firstVisitedAt+" | last "+row.lastVisitedAt,
    "  Paid orders credited to this rep "+(row.linkedAccount?row.paidOrdersCreditedToRep:"n/a (unlinked)"),
    ...wrap("  Visit dates: "+row.visitDates.join(", ")),
    "",
  ];
}
/** Generates an actual multipage PDF locally; no third-party service or geocoordinates. */
export function adminAuditPdf(report: AdminAuditReport): Blob {
  const alerts = report.days.reduce((n,d)=>n+d.flags.length,0)+report.accounts.length;
  const all = [
    "MOMENTUM DISTRIBUTION INC.",
    "ADMINISTRATOR AUDIT REVIEW | INTERNAL, RESTRICTED",
    "Period "+report.from+" to "+report.to+" | Generated "+report.generatedAt,
    "Employees "+report.reviewedEmployees+" | employee-days "+report.days.length+" | review signals "+alerts,
    "",
    "SALES FUNNEL & CONVERSION SUMMARY",
    "",
    ...(report.sales.length?report.sales.flatMap(salesLines):["No sales roles in this selection."]),
    "VISITS BY EMPLOYEE AND BUSINESS LOCATION",
    "",
    ...(report.visits.length?report.visits.flatMap(visitLines):["No physical CRM visits in selected period."]),
    "TIMEKEEPING / FIELD ACTIVITY BY DAY",
    "",
    ...(report.days.length?report.days.flatMap(dayLines):["No work, punch or schedule records found in selected period."]),
    "ACCOUNT FOLLOW-UP EXCEPTIONS",
    "",
    ...(report.accounts.length?report.accounts.flatMap(a=>wrap(a.owner+" | "+a.account+" | "+a.status+" | "+a.issue+" | "+(a.followUp??"no due date"))):["No programmed account exceptions."]),
    "",
    "METRIC DEFINITIONS AND INTERPRETATION LIMITS",
    ...report.definitions.flatMap(d=>wrap("* "+d)),
    "",
    "No payroll change or disciplinary conclusion has been made by this report.",
  ];
  const chunks:string[][]=[];
  for(let i=0;i<all.length;i+=48)chunks.push(all.slice(i,i+48));
  if(!chunks.length)chunks.push(["No records"]);
  const objects:string[]=[];
  const add=(value:string)=>{objects.push(value);return objects.length;};
  const font=add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  const pages=add("<< /Type /Pages /Count 0 /Kids [] >>");
  const pageIds:number[]=[];
  for(const [index,lines] of chunks.entries()){
    const commands=["BT","/F1 8 Tf","44 755 Td","13 TL",...lines.map(s=>"("+escapePdf(s.slice(0,112))+") Tj T*"),"ET",
      "BT","/F1 8 Tf","44 32 Td","(Momentum Internal | Page "+(index+1)+" of "+chunks.length+") Tj","ET"].join("\n");
    const stream=add("<< /Length "+commands.length+" >>\nstream\n"+commands+"\nendstream");
    pageIds.push(add("<< /Type /Page /Parent "+pages+" 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 "+font+" 0 R >> >> /Contents "+stream+" 0 R >>"));
  }
  objects[pages-1]="<< /Type /Pages /Count "+pageIds.length+" /Kids ["+pageIds.map(id=>id+" 0 R").join(" ")+"] >>";
  const root=add("<< /Type /Catalog /Pages "+pages+" 0 R >>");
  let pdf="%PDF-1.4\n";
  const offsets=[0];
  for(const [i,body] of objects.entries()){offsets.push(pdf.length);pdf+=(i+1)+" 0 obj\n"+body+"\nendobj\n";}
  const xref=pdf.length;
  pdf+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objects.length+1)+" /Root "+root+" 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  return new Blob([new TextEncoder().encode(pdf)],{type:"application/pdf"});
}
