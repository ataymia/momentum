"use client";

import { AccountingPanel } from "../accounting/accounting-panel";
import { AuditCenter } from "../audit/audit-center";
import { OrderCashPanel } from "../commerce/order-cash-panel";
import { AccountHealthHome } from "../crm/account-health-home";
import { CrmDepthPanel } from "../crm/crm-depth-panel";
import { EmployeeDirectory } from "../hcm/employee-directory";
import { NewHireProvisioning } from "../hcm/new-hire-provisioning";
import { InventoryLedgerPanel } from "../inventory/inventory-ledger-panel";
import { DashboardPerformance } from "../performance/dashboard-performance";
import { ReportingCenter } from "../performance/reporting-center";
import { DataExchangeCenter } from "../settings/data-exchange-center";
import { PageHeader } from "../ui";
import { ActionCenter } from "../work/action-center";

export function ActionCenterPage(){return <div className="page page--focused-tool"><PageHeader eyebrow="My work" title="Action center" description="Work exceptions and open actions without mixing them into your approval queue."/><ActionCenter/></div>;}
export function AccountHealthPage(){return <div className="page page--focused-tool"><PageHeader eyebrow="CRM & sales" title="Account health" description="Review account health, reorder signals, and commercial follow-up in one focused view."/><AccountHealthHome/></div>;}
export function CrmToolsPage(){return <div className="page page--focused-tool"><PageHeader eyebrow="CRM & sales" title="CRM tools" description="Contacts, opportunities, territories, and deeper account controls."/><CrmDepthPanel/></div>;}
export function OrderCashPage(){return <div className="page page--focused-tool"><PageHeader eyebrow="Orders & billing" title="Invoices & payments" description="Manage invoice status, payment records, credits, refunds, and receivables separately from order entry."/><OrderCashPanel/></div>;}
export function InventoryLedgerPage(){return <div className="page page--focused-tool"><PageHeader eyebrow="Inventory & fulfillment" title="Inventory ledger" description="Review custody movements, reservations, counts, and inventory evidence without crowding the fulfillment page."/><InventoryLedgerPanel/></div>;}
export function EmployeeDirectoryPage(){return <div className="page page--focused-tool"><PageHeader eyebrow="Human Resources" title="Employee directory" description="People, reporting lines, roles, and workforce records."/><EmployeeDirectory/></div>;}
export function NewHirePage(){return <NewHireProvisioning view="create"/>;}
export function OnboardingQueuePage(){return <NewHireProvisioning view="queue"/>;}
export function AccountingWorkspacePage(){return <div className="page page--focused-tool"><PageHeader eyebrow="Finance & accounting" title="Accounting" description="Chart of accounts, journals, reconciliations, and accounting controls."/><AccountingPanel/></div>;}
export function PerformanceWorkspacePage(){return <div className="page page--focused-tool"><PageHeader eyebrow="Performance & reports" title="Performance" description="Operational performance signals and management scorecards."/><DashboardPerformance/></div>;}
export function ReportingCenterPage(){return <div className="page page--focused-tool"><PageHeader eyebrow="Performance & reports" title="Reporting center" description="Create, review, and trace recurring employee and management reports."/><ReportingCenter/></div>;}
export function AuditWorkspacePage(){return <div className="page page--focused-tool"><PageHeader eyebrow="Performance & reports" title="Audit trail" description="Review system actions and evidence without mixing audit history into performance reporting."/><AuditCenter/></div>;}
export function DataExchangePage(){return <div className="page page--focused-tool"><PageHeader eyebrow="Administration" title="Data exchange" description="Import, export, and move controlled data separately from system settings."/><DataExchangeCenter/></div>;}
