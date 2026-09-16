from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, count))


# Account creation must require a reachable contact, not both phone and email.
replace(
    "lib/workspace-context.tsx",
    'import { accountIsVisible, canAdvanceFulfillment, canAssignScheduleUser, canManageSchedule, canReconcileOrderPayment, canReviewApproval, canTransferSalesResponsibility, getWorkspaceScope } from "./access";\n',
    'import { accountIsVisible, canAdvanceFulfillment, canAssignScheduleUser, canManageSchedule, canReconcileOrderPayment, canReviewApproval, canTransferSalesResponsibility, getWorkspaceScope } from "./access";\nimport { validateNewAccountContact } from "./account-creation";\n',
)
replace(
    "lib/workspace-context.tsx",
    '    if ([account.name, account.location, account.channel, account.contactName, account.contactRole, account.phone, account.email].some((value) => !value.trim())) return null;',
    '    if (!validateNewAccountContact(account).ok) return null;',
)

replace(
    "components/pages/accounts.tsx",
    'import { canCreateAccount, isCustomer } from "../../lib/access";\n',
    'import { canCreateAccount, isCustomer } from "../../lib/access";\nimport { validateNewAccountContact } from "../../lib/account-creation";\n',
)
replace(
    "components/pages/accounts.tsx",
    'const submit=(event:FormEvent)=>{event.preventDefault();const duplicate=findAccountDuplicate(data.accounts,form);',
    'const submit=(event:FormEvent)=>{event.preventDefault();const validation=validateNewAccountContact(form);if(!validation.ok){setDuplicateWarning(validation.message);return}const duplicate=findAccountDuplicate(data.accounts,form);',
)
replace(
    "components/pages/accounts.tsx",
    '<Field label="Primary contact"><input value={form.contactName} onChange={(event)=>setForm({...form,contactName:event.target.value})}/></Field>',
    '<Field label="Primary contact"><input required value={form.contactName} onChange={(event)=>setForm({...form,contactName:event.target.value})}/></Field>',
)
replace(
    "components/pages/accounts.tsx",
    '<Field label="Contact role"><input value={form.contactRole} onChange={(event)=>setForm({...form,contactRole:event.target.value})}/></Field>',
    '<Field label="Contact role"><input required value={form.contactRole} onChange={(event)=>setForm({...form,contactRole:event.target.value})}/></Field>',
)
replace(
    "components/pages/accounts.tsx",
    '<Field label="Phone"><input value={form.phone} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,phone:event.target.value})}}/></Field><Field label="Email"><input type="email" value={form.email} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,email:event.target.value})}}/></Field>',
    '<Field label="Phone" hint="Phone or email is required. You do not need both."><input type="tel" value={form.phone} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,phone:event.target.value})}}/></Field><Field label="Email" hint="Optional when a phone number is provided."><input type="email" value={form.email} onChange={(event)=>{setDuplicateWarning(null);setForm({...form,email:event.target.value})}}/></Field>',
)

# Revisit is a first-class field-work type everywhere appointments are validated or imported.
for path in ["lib/workspace-normalization.ts", "lib/commercial-state.ts"]:
    replace(
        path,
        'const appointmentTypes = new Set(["First visit", "Sample drop", "Placement check", "Reorder", "Delivery"]);',
        'const appointmentTypes = new Set(["First visit", "Revisit", "Sample drop", "Placement check", "Reorder", "Delivery"]);',
    )
replace(
    "lib/csv-data-exchange.ts",
    'const types=new Set<Appointment["type"]>(["First visit","Sample drop","Placement check","Reorder","Delivery"]);',
    'const types=new Set<Appointment["type"]>(["First visit","Revisit","Sample drop","Placement check","Reorder","Delivery"]);',
)
replace(
    "lib/employee-profile.ts",
    'const salesAppointmentTypes = new Set<Appointment["type"]>(["First visit", "Sample drop", "Placement check", "Reorder"]);',
    'const salesAppointmentTypes = new Set<Appointment["type"]>(["First visit", "Revisit", "Sample drop", "Placement check", "Reorder"]);',
)
replace(
    "components/pages/dispatch-board.tsx",
    'const workTypes: Appointment["type"][] = operationsMode ? ["Delivery"] : ["First visit", "Sample drop", "Placement check", "Reorder", "Delivery"];',
    'const workTypes: Appointment["type"][] = operationsMode ? ["Delivery"] : ["First visit", "Revisit", "Sample drop", "Placement check", "Reorder", "Delivery"];',
)

# Regression coverage for the exact first-rep feedback.
replace(
    "tests/post-launch-regressions.test.ts",
    'import { createHcmSeed } from "../lib/hcm-engine";\n',
    'import { validateNewAccountContact } from "../lib/account-creation";\nimport { normalizeCommercialState } from "../lib/commercial-state";\nimport { createHcmSeed } from "../lib/hcm-engine";\nimport { normalizeWorkspaceData } from "../lib/workspace-normalization";\n',
)

test_path = Path("tests/post-launch-regressions.test.ts")
text = test_path.read_text()
marker = '\ndescribe("territory suggestions are advisory", () => {'
if marker not in text:
    raise SystemExit("Could not find test insertion point")
block = '''

describe("sales rep field account capture", () => {
  const baseContact = {
    name: "Copper Rail Bar",
    location: "Phoenix, AZ",
    channel: "Restaurant / nightlife",
    contactName: "Morgan Lee",
    contactRole: "Bar manager",
    phone: "",
    email: "",
  };

  test("accepts a phone-only primary contact", () => {
    assert.deepEqual(validateNewAccountContact({ ...baseContact, phone: "602-555-0144" }), { ok: true });
  });

  test("accepts an email-only primary contact", () => {
    assert.deepEqual(validateNewAccountContact({ ...baseContact, email: "manager@example.com" }), { ok: true });
  });

  test("rejects an account with no way to reach the primary contact", () => {
    const result = validateNewAccountContact(baseContact);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /phone number or an email/i);
  });

  test("Revisit survives both workspace and commercial normalization", () => {
    const account = {
      id: "acc-revisit",
      name: "Copper Rail Bar",
      location: "Phoenix, AZ",
      channel: "Restaurant / nightlife",
      stage: "Prospect" as const,
      ownerId: REP_A,
      contactName: "Morgan Lee",
      contactRole: "Bar manager",
      phone: "602-555-0144",
      email: "",
      lastActivity: "First visit completed",
      nextAction: "Return for manager follow-up",
      nextActionDate: "2026-09-17",
      health: "New" as const,
      lifetimeCases: 0,
      reorderCount: 0,
      notes: "",
    };
    const appointment = {
      id: "apt-revisit",
      accountId: account.id,
      ownerId: REP_A,
      date: "2026-09-17",
      startTime: "14:00",
      duration: 30,
      type: "Revisit" as const,
      status: "Scheduled" as const,
      objective: "Return to speak with the bar manager",
      location: account.location,
      priority: "Normal" as const,
      tags: [],
    };
    const fallback = { ...emptyWorkspace([admin, repA]), accounts: [account] };
    const workspace = normalizeWorkspaceData({ ...fallback, appointments: [appointment] }, fallback);
    assert.equal(workspace.appointments[0]?.type, "Revisit");
    const commercial = normalizeCommercialState({ version: 1, accountPatches: {}, orders: [], appointments: [appointment], approvals: [], activities: [], inventoryLots: [], territories: [] }, fallback, "2026-09-16");
    assert.equal(commercial.appointments[0]?.type, "Revisit");
  });
});
'''
test_path.write_text(text.replace(marker, block + marker, 1))
